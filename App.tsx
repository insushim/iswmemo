import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, NativeModules, Alert, AppState, InteractionManager } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Navigation from './src/navigation';
import { useAuthStore } from './src/store/auth';
import { useGoalStore } from './src/store/goals';
import { useSettingsStore } from './src/store/settings';
import { requestNotificationPermission, syncAuthTokenToNative } from './src/lib/taskAlarm';
import { promptAutoStart } from './src/lib/autostart';
import { checkForUpdate } from './src/lib/appUpdate';

const { AutoLaunchModule } = NativeModules;

// 기한 알람만 포그라운드에서 표시 (나머지 알림은 모두 무시)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const channelId = notification.request.content.data?.channelId as string | undefined;
    const isAlarm = channelId === 'task_alarm_full' || channelId === 'task-alarm';
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

  useEffect(() => {
    const init = async () => {
      try {
        await loadSettings();
        await checkAuth();
        await syncAuthTokenToNative(); // 알람 삭제용 토큰 동기화
        await loadPinnedGoals();
        // 기존 expo 잔여 알림 모두 정리 (네이티브 알람은 영향 없음)
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.dismissAllNotificationsAsync();
        // 업데이트 확인 (백그라운드)
        checkForUpdate();
      } catch (error) {
        console.error('Init failed:', error);
      } finally {
        await SplashScreen.hideAsync();
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
        const sub = AppState.addEventListener('change', (s) => {
          if (s !== 'active') left = true;
          if (left && s === 'active') finish();
        });
        openFn();
        setTimeout(finish, 120000); // 2분 안전장치
      });

    const requestAllPermissions = async () => {
      try {
        if (Platform.OS !== 'android' || !AutoLaunchModule) return;

        // 1. 다른 앱 위에 표시 권한 (최우선, 필수)
        const hasOverlay = await AutoLaunchModule.checkOverlayPermission();
        if (!hasOverlay) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              '권한 필요: 다른 앱 위에 표시',
              '화면 자동실행과 알람 표시에 필수 권한입니다.\n\n설정에서 또박또박을 찾아 권한을 켜주세요.',
              [{
                text: '설정으로 이동',
                onPress: () => {
                  openSettingsAndWait(() => AutoLaunchModule.requestOverlayPermission())
                    .then(resolve);
                },
              }],
              { cancelable: false },
            );
          });
        }

        // 오버레이 허용됐으면 서비스 시작
        if (autoLaunchEnabled) {
          try { AutoLaunchModule.startService(); } catch {}
        }

        // 2. 알람 및 리마인더 권한 (필수)
        const hasAlarm = await AutoLaunchModule.checkExactAlarmPermission();
        if (!hasAlarm) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              '권한 필요: 알람 및 리마인더',
              '할일 기한 알람이 정확히 울리려면 필수 권한입니다.\n\n설정에서 권한을 켜주세요.',
              [{
                text: '설정으로 이동',
                onPress: () => {
                  openSettingsAndWait(() => AutoLaunchModule.requestExactAlarmPermission())
                    .then(resolve);
                },
              }],
              { cancelable: false },
            );
          });
        }

        // 3. POST_NOTIFICATIONS 권한
        await requestNotificationPermission();

        // 4. 전체 화면 알림 권한 (Android 14+, 잠금화면 알람 표시 필수)
        try {
          const hasFullScreen = await AutoLaunchModule.checkFullScreenIntentPermission();
          if (!hasFullScreen) {
            await new Promise<void>((resolve) => {
              Alert.alert(
                '권한 필요: 전체 화면 알림',
                '잠금화면에서 알람이 울리려면 필수 권한입니다.\n\n설정에서 권한을 켜주세요.',
                [{
                  text: '설정으로 이동',
                  onPress: () => {
                    openSettingsAndWait(() => AutoLaunchModule.requestFullScreenIntentPermission())
                      .then(resolve);
                  },
                }],
                { cancelable: false },
              );
            });
          }
        } catch {}

        // 5. 자동 시작 권한 안내 (제조사별)
        await promptAutoStart();

      } catch (e) {
        if (__DEV__) console.error('Permission request error:', e);
      }
    };

    // InteractionManager로 렌더링 완료 후 권한 요청 (렉 방지)
    const handle = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(requestAllPermissions, 800);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={darkMode ? "light" : "dark"} translucent={true} backgroundColor="transparent" />
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
