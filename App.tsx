import React, { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  Platform,
  NativeModules,
  Alert,
  AppState,
  InteractionManager,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import Navigation from "./src/navigation";
import { useAuthStore } from "./src/store/auth";
import { useGoalStore } from "./src/store/goals";
import { useSettingsStore } from "./src/store/settings";
import { useTheme } from "./src/lib/theme";
import {
  requestNotificationPermission,
  syncAuthTokenToNative,
  registerExpoPushToken,
} from "./src/lib/taskAlarm";
import { promptAutoStart } from "./src/lib/autostart";
import { checkForUpdate } from "./src/lib/appUpdate";

const { AutoLaunchModule } = NativeModules;

// 기한 알람만 포그라운드에서 표시 (나머지 알림은 모두 무시)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const channelId = notification.request.content.data?.channelId as
      | string
      | undefined;
    const isAlarm =
      channelId === "task_alarm_full" || channelId === "task-alarm";
    return {
      shouldShowAlert: isAlarm,
      shouldPlaySound: isAlarm,
      shouldSetBadge: false,
      shouldShowBanner: isAlarm,
      shouldShowList: isAlarm,
    };
  },
});

SplashScreen.preventAutoHideAsync();

export default function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { loadPinnedGoals } = useGoalStore();
  const { loadSettings, darkMode, autoLaunchEnabled } = useSettingsStore();
  const { colors } = useTheme();
  const appReady = useRef(false);
  const [appInitialized, setAppInitialized] = React.useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // 필수 초기화 병렬 로드 (콜드 스타트 시간 단축)
        await Promise.all([
          loadSettings(),
          checkAuth(),
          loadPinnedGoals(),
        ]);
      } catch (error) {
        console.error("Init failed:", error);
      } finally {
        // 초기화 완료 → Navigation 즉시 마운트
        setAppInitialized(true);
        // 렌더링 안정화 후 splash 숨김 (2 RAF)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            SplashScreen.hideAsync().catch(() => {});
            appReady.current = true;
            // 비필수 작업은 splash 숨긴 후 백그라운드에서 처리
            syncAuthTokenToNative().catch(() => {});
            Notifications.cancelAllScheduledNotificationsAsync().catch(
              () => {},
            );
            Notifications.dismissAllNotificationsAsync().catch(() => {});
            // 업데이트 확인 (앱 안정화 후 10초 뒤)
            setTimeout(checkForUpdate, 10000);
          });
        });
      }
    };
    init();
  }, []);

  // 로그인 후 필요 권한 요청 (다른 앱 위에 표시 → 알람 순서로)
  useEffect(() => {
    if (!isAuthenticated) return;

    // 설정 화면으로 이동 후 돌아올 때까지 대기
    const openSettingsAndWait = (openFn: () => void) =>
      new Promise<void>((resolve) => {
        let left = false;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          sub.remove();
          setTimeout(resolve, 600);
        };
        // 리스너를 먼저 등록한 후 설정 열기 (타이밍 이슈 방지)
        const sub = AppState.addEventListener("change", (s) => {
          if (s !== "active") left = true;
          if (left && s === "active") finish();
        });
        openFn();
        setTimeout(finish, 120000); // 2분 안전장치
      });

    const requestAllPermissions = async () => {
      try {
        if (Platform.OS !== "android" || !AutoLaunchModule) return;

        // 1. 다른 앱 위에 표시 권한 (최우선, 필수)
        const hasOverlay = await AutoLaunchModule.checkOverlayPermission();
        if (!hasOverlay) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              "권한 필요: 다른 앱 위에 표시",
              "화면 자동실행과 알람 표시에 필수 권한입니다.\n\n설정에서 또박또박을 찾아 권한을 켜주세요.",
              [
                {
                  text: "설정으로 이동",
                  onPress: () => {
                    openSettingsAndWait(() =>
                      AutoLaunchModule.requestOverlayPermission(),
                    ).then(resolve);
                  },
                },
              ],
              { cancelable: false },
            );
          });
        }

        // 오버레이 허용됐으면 서비스 시작
        if (autoLaunchEnabled) {
          try {
            AutoLaunchModule.startService();
          } catch {}
        }

        // 2. 알람 및 리마인더 권한 (필수)
        const hasAlarm = await AutoLaunchModule.checkExactAlarmPermission();
        if (!hasAlarm) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              "권한 필요: 알람 및 리마인더",
              "할일 기한 알람이 정확히 울리려면 필수 권한입니다.\n\n설정에서 권한을 켜주세요.",
              [
                {
                  text: "설정으로 이동",
                  onPress: () => {
                    openSettingsAndWait(() =>
                      AutoLaunchModule.requestExactAlarmPermission(),
                    ).then(resolve);
                  },
                },
              ],
              { cancelable: false },
            );
          });
        }

        // 3. POST_NOTIFICATIONS 권한
        await requestNotificationPermission();
        // Expo 푸시 토큰 등록 (백엔드에 저장, 서버→기기 푸시 가능)
        await registerExpoPushToken();

        // 3.5 위치 권한 (날씨·미세먼지·동네 정보 표시용)
        try {
          const current = await Location.getForegroundPermissionsAsync();
          const granted = current.status === "granted";
          const fine =
            (current as { android?: { accuracy?: string } }).android
              ?.accuracy !== "coarse";
          if (!granted) {
            if (current.canAskAgain !== false) {
              // 시스템 prompt 가능 — 안내 후 요청
              await new Promise<void>((resolve) => {
                Alert.alert(
                  "위치 권한 안내",
                  "현재 위치의 날씨·미세먼지·동네 정보를 정확히 표시하기 위해 위치 권한이 필요합니다.\n\n다음 화면에서 [정확한 위치] 옵션도 함께 켜주세요.",
                  [
                    {
                      text: "허용하기",
                      onPress: async () => {
                        try {
                          await Location.requestForegroundPermissionsAsync();
                        } catch {}
                        resolve();
                      },
                    },
                    {
                      text: "나중에",
                      style: "cancel",
                      onPress: () => resolve(),
                    },
                  ],
                  { cancelable: false },
                );
              });
            } else {
              // 영구 거부 — 설정으로 안내
              await new Promise<void>((resolve) => {
                Alert.alert(
                  "위치 권한 필요",
                  "위치 권한이 꺼져 있어 날씨·미세먼지·동네 정보를 정확히 표시할 수 없습니다.\n\n[설정 → 권한 → 위치]에서 켜주세요.",
                  [
                    {
                      text: "설정으로 이동",
                      onPress: () => {
                        Linking.openSettings().catch(() => {});
                        resolve();
                      },
                    },
                    {
                      text: "나중에",
                      style: "cancel",
                      onPress: () => resolve(),
                    },
                  ],
                  { cancelable: false },
                );
              });
            }
          } else if (!fine) {
            // 권한은 있는데 "대략적 위치"만 켜진 경우 — 정확한 위치 안내
            await new Promise<void>((resolve) => {
              Alert.alert(
                "정확한 위치 켜기",
                "현재 [대략적 위치]만 허용돼 있어 동·구 단위가 부정확할 수 있습니다.\n\n[설정 → 권한 → 위치 → 정확한 위치 사용] 토글을 켜주세요.",
                [
                  {
                    text: "설정으로 이동",
                    onPress: () => {
                      Linking.openSettings().catch(() => {});
                      resolve();
                    },
                  },
                  {
                    text: "나중에",
                    style: "cancel",
                    onPress: () => resolve(),
                  },
                ],
                { cancelable: false },
              );
            });
          }
        } catch {}

        // 4. 전체 화면 알림 권한 (Android 14+, 잠금화면 알람 표시 필수)
        try {
          const hasFullScreen =
            await AutoLaunchModule.checkFullScreenIntentPermission();
          if (!hasFullScreen) {
            await new Promise<void>((resolve) => {
              Alert.alert(
                "권한 필요: 전체 화면 알림",
                "잠금화면에서 알람이 울리려면 필수 권한입니다.\n\n설정에서 권한을 켜주세요.",
                [
                  {
                    text: "설정으로 이동",
                    onPress: () => {
                      openSettingsAndWait(() =>
                        AutoLaunchModule.requestFullScreenIntentPermission(),
                      ).then(resolve);
                    },
                  },
                ],
                { cancelable: false },
              );
            });
          }
        } catch {}

        // 5. 자동 시작 권한 안내 (제조사별)
        await promptAutoStart();
      } catch (e) {
        if (__DEV__) console.error("Permission request error:", e);
      }
    };

    // 앱 초기화 완료 후 권한 요청 (splash 숨김 + 네비게이션 안정화 대기)
    const waitAndRequest = () => {
      const check = () => {
        if (appReady.current) {
          setTimeout(requestAllPermissions, 1500);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    };
    const handle = InteractionManager.runAfterInteractions(waitAndRequest);
    return () => handle.cancel();
  }, [isAuthenticated]);

  // 초기화 전에는 splash 배경과 동일한 색상 유지 → 흰 flash 방지
  const rootBg = appInitialized ? colors.background : "#6366f1";

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: rootBg }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {/* Android: 상태바 완전 숨김 - GoalBanner가 그 자리 차지 */}
        <StatusBar
          hidden={Platform.OS === "android"}
          style={darkMode ? "light" : "dark"}
        />
        {appInitialized ? <Navigation /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
