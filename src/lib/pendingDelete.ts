// 잠금화면 알람에서 "삭제"를 누른 건(pending)을 앱 복귀 시 처리한다.
// CalendarScreen 과 SimpleHomeScreen 두 곳에서 같은 로직을 쓰므로 공용화.
//
// 핵심 규칙: **성공했거나 "이미 없음(4xx)"일 때만 pending 을 지운다.**
// 네트워크 실패/서버 5xx 에서 pending 을 지우면 사용자는 지웠다고 믿는데 서버엔 남는다.
// 그런 경우엔 pending 을 남겨 다음 앱 복귀 때 재시도한다.

import { Platform, NativeModules } from "react-native";
import { api } from "./api";

function httpStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

/** 4xx = 서버가 "그런 건 없다/못 지운다"고 확답 → 재시도해도 소용없으니 pending 정리 */
function isSettled(e: unknown): boolean {
  const s = httpStatus(e);
  return typeof s === "number" && s >= 400 && s < 500 && s !== 401;
}

export async function processPendingDelete(): Promise<boolean> {
  if (Platform.OS !== "android" || !NativeModules.AlarmModule) return false;

  let pending: { id?: string; type?: string } | null = null;
  try {
    pending = await NativeModules.AlarmModule.getPendingDelete();
  } catch {
    return false;
  }
  if (!pending?.id) return false;

  let done = false;
  if (pending.type === "schedule") {
    // 개인일정은 이제 events. 이관 전에 걸린 오래된 알람이면 routine id 일 수 있어 폴백.
    try {
      await api.deleteEvent(pending.id);
      done = true;
    } catch (e1) {
      try {
        await api.deleteRoutine(pending.id);
        done = true;
      } catch (e2) {
        // 둘 다 "이미 없음"이면 지울 게 없는 것 → 정리. 그 외(네트워크/5xx)는 다음에 재시도.
        done = isSettled(e1) && isSettled(e2);
      }
    }
  } else {
    try {
      await api.deleteTask(pending.id);
      done = true;
    } catch (e) {
      done = isSettled(e);
    }
  }

  if (done) {
    try {
      await NativeModules.AlarmModule.clearPendingDelete();
    } catch {}
  }
  return done;
}
