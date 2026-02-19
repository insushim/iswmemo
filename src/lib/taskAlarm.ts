import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const { AlarmModule } = NativeModules;

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Native SharedPreferences에 auth 토큰 동기화 (AlarmActivity에서 DELETE 시 필요)
export async function syncAuthTokenToNative(): Promise<void> {
  if (Platform.OS !== 'android' || !AlarmModule) return;
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) await AlarmModule.saveAuthToken(token);
  } catch (e) {}
}

export async function scheduleTaskAlarm(taskId: string, title: string, dueDate: Date, type: 'task' | 'schedule' = 'task') {
  await cancelTaskAlarm(taskId);

  if (dueDate.getTime() <= Date.now()) return;

  try {
    if (Platform.OS === 'android' && AlarmModule) {
      // 알람 설정 시 토큰도 동기화
      await syncAuthTokenToNative();
      await AlarmModule.scheduleAlarm(taskId, title, dueDate.getTime(), type);
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
