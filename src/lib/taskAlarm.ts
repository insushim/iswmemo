import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const { AlarmModule } = NativeModules;

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleTaskAlarm(taskId: string, title: string, dueDate: Date) {
  await cancelTaskAlarm(taskId);

  if (dueDate.getTime() <= Date.now()) return;

  try {
    if (Platform.OS === 'android' && AlarmModule) {
      // 네이티브 AlarmManager는 알림 권한 없이도 동작
      await AlarmModule.scheduleAlarm(taskId, title, dueDate.getTime());
    }
  } catch (e) {
    console.error('Failed to schedule alarm:', e);
  }
}

export async function cancelTaskAlarm(taskId: string) {
  try {
    if (Platform.OS === 'android' && AlarmModule) {
      await AlarmModule.cancelAlarm(taskId);
    }
  } catch (e) {
    // ignore
  }
}

export function dismissAlarm() {
  if (Platform.OS === 'android' && AlarmModule) {
    AlarmModule.dismissAlarm();
  }
}
