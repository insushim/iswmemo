import { NativeModules, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

const { AlarmModule } = NativeModules;

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Expo 푸시 토큰 등록 (백엔드에 저장)
export async function registerExpoPushToken(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "e0012d02-1743-443f-b934-e57dd252ba58",
    });
    const pushToken = tokenData.data;

    const authToken = await SecureStore.getItemAsync("auth_token");
    if (!authToken) return;

    await fetch(
      `${(await import("./config")).API_URL}/api/push/mobile/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ pushToken }),
      },
    );
  } catch (e) {
    // 푸시 토큰 등록 실패는 앱 동작에 영향 없음
    if (__DEV__) console.error("Expo push token register error:", e);
  }
}

// Native SharedPreferences에 auth 토큰 동기화 (AlarmActivity에서 DELETE 시 필요)
export async function syncAuthTokenToNative(): Promise<void> {
  if (Platform.OS !== "android" || !AlarmModule) return;
  try {
    const token = await SecureStore.getItemAsync("auth_token");
    if (token) await AlarmModule.saveAuthToken(token);
  } catch (e) {}
}

export async function scheduleTaskAlarm(
  taskId: string,
  title: string,
  dueDate: Date,
  type: "task" | "schedule" | "timer" = "task",
) {
  await cancelTaskAlarm(taskId);

  if (dueDate.getTime() <= Date.now()) return;

  try {
    if (Platform.OS === "android" && AlarmModule) {
      // 알람 설정 시 토큰도 동기화
      await syncAuthTokenToNative();
      await AlarmModule.scheduleAlarm(taskId, title, dueDate.getTime(), type);
    }
  } catch (e) {
    console.error("Failed to schedule alarm:", e);
  }
}

export async function cancelTaskAlarm(taskId: string) {
  try {
    if (Platform.OS === "android" && AlarmModule) {
      await AlarmModule.cancelAlarm(taskId);
    }
  } catch (e) {
    // ignore
  }
}

export function dismissAlarm() {
  if (Platform.OS === "android" && AlarmModule) {
    AlarmModule.dismissAlarm();
  }
}
