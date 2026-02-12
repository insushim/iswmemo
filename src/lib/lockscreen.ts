import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'lockscreen-tasks';
const NOTIFICATION_ID = 'lockscreen-tasks';

export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '잠금화면 할 일',
    description: '잠금화면에 오늘의 할 일을 표시합니다',
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: false,
    sound: undefined,
    showBadge: true,
    bypassDnd: true,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showLockScreenNotification(title: string, body: string): Promise<boolean> {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return false;

    if (Platform.OS === 'android') {
      await setupNotificationChannel();
    }

    // 기존 알림 제거 후 새로 표시
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        data: { type: 'lockscreen-tasks', openApp: true },
      },
      trigger: null,
    });

    return true;
  } catch (error) {
    console.error('잠금화면 알림 표시 실패:', error);
    return false;
  }
}

export async function dismissLockScreenNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch (error) {
    console.error('잠금화면 알림 제거 실패:', error);
  }
}

export function formatTasksForNotification(tasks: Array<{ title: string; isCompleted?: boolean }>): string {
  const incompleteTasks = tasks.filter(t => !t.isCompleted);

  if (incompleteTasks.length === 0) {
    return '모든 할 일을 완료했어요! 🎉';
  }

  const displayTasks = incompleteTasks.slice(0, 5);
  const remaining = incompleteTasks.length - displayTasks.length;

  let content = displayTasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');

  if (remaining > 0) {
    content += `\n외 ${remaining}개...`;
  }

  return content;
}
