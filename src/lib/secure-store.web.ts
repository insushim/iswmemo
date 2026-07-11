/**
 * expo-secure-store 웹 심(shim) — metro.config.js가 웹 번들에서만 이 파일로 치환한다.
 *
 * 브라우저에는 OS 키체인이 없어 localStorage로 대체한다(웹 PWA의 신뢰 수준 한계 —
 * XSS에 노출되는 평문 저장이므로, 웹에서 더 강한 보호가 필요해지면 growthpad-web의
 * IndexedDB + non-extractable CryptoKey 패턴으로 승격할 것). 네이티브 앱은 이 파일을
 * 절대 로드하지 않는다(플랫폼 분기는 번들 단계에서 끝남).
 *
 * 앱이 쓰는 API 표면 3개만 구현: getItemAsync / setItemAsync / deleteItemAsync.
 * ⚠️ 에러 계약은 네이티브 expo-secure-store와 동일하게 유지한다(교차검증 codex 채택):
 *   set/delete 실패 = reject. 여기서 삼키면 storage.ts persistentSet의 "전 레이어
 *   실패 시 throw" 감지와 e2ee-store의 저장 성공 가정이 깨져, 토큰·암호화 키가
 *   메모리에만 남은 채 "성공"으로 위장된다(새로고침 후 증발).
 */

const PREFIX = "gp_ss_"; // 다른 localStorage 사용자와 키 충돌 방지

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // 일부 프라이버시 모드에서 접근 자체가 throw
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  // 읽기 실패는 "값 없음"과 동치로 처리 — 호출부 전부 null=캐시미스로 다룸
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  const s = storage();
  if (!s) throw new Error("secure-store.web: storage unavailable");
  s.setItem(PREFIX + key, value); // quota 초과 등 실패는 그대로 throw(네이티브 계약)
}

export async function deleteItemAsync(key: string): Promise<void> {
  const s = storage();
  if (!s) throw new Error("secure-store.web: storage unavailable");
  s.removeItem(PREFIX + key);
}
