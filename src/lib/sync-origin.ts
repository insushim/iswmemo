/**
 * 이 기기의 동기화 발신 식별자(에코 억제용).
 *
 * 모든 API 쓰기에 X-Sync-Origin 으로 실려 나가고, 서버의 실시간 변경신호(푸시)에
 * origin 으로 되돌아온다. 자기 origin 신호는 무시해 self-refetch 루프를 막는다.
 * 비밀 아님. ⚠️ 영속 플래그는 SecureStore 직접 금지 — storage.ts 3중 폴백 사용.
 */
import { persistentGet, persistentSet } from "./storage";

let cached: string | null = null;

function makeId(): string {
  // uuid 의존성 없이 충분한 무작위 id (기기당 1회 생성)
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getSyncOriginId(): Promise<string> {
  if (cached) return cached;
  let id = await persistentGet("sync_client_id");
  if (!id) {
    id = makeId();
    await persistentSet("sync_client_id", id);
  }
  cached = id;
  return id;
}

/** 앱 시작 시 미리 캐시(이후 동기 접근용). 실패해도 무해. */
export function primeSyncOriginId(): void {
  void getSyncOriginId().catch(() => {});
}

/** 캐시된 id 동기 반환(prime 전이면 null — 호출측은 null 이면 무시 판단 불가로 처리 진행). */
export function getCachedSyncOriginId(): string | null {
  return cached;
}
