import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, NativeModules, Alert, AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Navigation from './src/navigation';
import { useAuthStore } from './src/store/auth';
import { useGoalStore } from './src/store/goals';
import { useSettingsStore } from './src/store/settings';
import { requestNotificationPermission } from './src/lib/taskAlarm';
import { promptAutoStart } from './src/lib/autostart';

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
        await loadPinnedGoals();
        // 기존 expo 잔여 알림 모두 정리 (네이티브 알람은 영향 없음)
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.dismissAllNotificationsAsync();
      } catch (error) {
        console.error('Init failed:', error);
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    init();
  }, []);

  // 로그인 후 필요 권한 요청 (하나씩 순차적으로)
  useEffect(() => {
    if (!isAuthenticated) return;

    // Alert 표시 → "설정 열기" 누르면 설정 이동 → 돌아올 때까지 대기
    const askPermission = (title: string, msg: string, openFn: () => void) =>
      new Promise<void>((resolve) => {
        Alert.alert(title, msg, [
          { text: '나중에', style: 'cancel', onPress: () => resolve() },
          {
            text: '설정 열기',
            onPress: () => {
              openFn();
              // 설정에서 돌아올 때까지 대기
              let left = false;
              const sub = AppState.addEventListener('change', (s) => {
                if (s === 'background') left = true;
                if (left && s === 'active') {
                  sub.remove();
                  setTimeout(resolve, 500);
                }
              });
              setTimeout(() => { sub.remove(); resolve(); }, 60000);
            },
          },
        ]);
      });

    const requestAllPermissions = async () => {
      try {
        if (Platform.OS !== 'android' || !AutoLaunchModule) return;

        // 1. POST_NOTIFICATIONS 권한
        await requestNotificationPermission();

        // 2. 자동 시작 권한 안내
        await promptAutoStart();

        // 3. 오버레이 권한
        const hasOverlay = await AutoLaunchModule.checkOverlayPermission();
        if (!hasOverlay) {
          await askPermission(
            '다른 앱 위에 표시',
            '알람이 화면에 표시되려면 이 권한이 필요합니다.\n\n또박또박을 찾아 권한을 켜주세요.',
            () => AutoLaunchModule.requestOverlayPermission(),
          );
        } else if (autoLaunchEnabled) {
          AutoLaunchModule.startService();
        }

        // 4. 정확한 알람 권한
        const hasAlarm = await AutoLaunchModule.checkExactAlarmPermission();
        if (!hasAlarm) {
          await askPermission(
            '알람 및 리마인더',
            '할일 기한 알람이 정확히 울리려면 이 권한이 필요합니다.',
            () => AutoLaunchModule.requestExactAlarmPermission(),
          );
        }

        // 5. 전체 화면 알림 권한
        const hasFullScreen = await AutoLaunchModule.checkFullScreenIntentPermission();
        if (!hasFullScreen) {
          await askPermission(
            '전체 화면 알림',
            '알람이 전체 화면으로 표시되려면 이 권한이 필요합니다.',
            () => AutoLaunchModule.requestFullScreenIntentPermission(),
          );
        }

        // 6. 배터리 최적화 예외 (시스템 다이얼로그라 앱이 백그라운드로 안 감)
        try {
          await new Promise<void>((resolve) => {
            Alert.alert(
              '배터리 최적화',
              '알람이 절전 모드에서도 정확히 울리려면 배터리 최적화를 해제해주세요.\n\n"허용"을 선택하세요.',
              [
                { text: '나중에', style: 'cancel', onPress: () => resolve() },
                {
                  text: '설정 열기',
                  onPress: () => {
                    AutoLaunchModule.openBatteryOptimization();
                    // 시스템 다이얼로그는 앱 위에 뜨므로 3초 후 resolve
                    setTimeout(resolve, 3000);
                  },
                },
              ],
            );
          });
        } catch {}
      } catch (e) {
        if (__DEV__) console.error('Permission request error:', e);
      }
    };
    const timer = setTimeout(requestAllPermissions, 1500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={darkMode ? "light" : "dark"} />
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
