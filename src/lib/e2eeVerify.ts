// 설정한 E2EE 암호가 스쿨데스크/웹의 것과 **실제로 같은지** 서버 데이터로 확인한다.
//
// 배경(2026-07-13): 폰에 암호를 넣어도 스쿨데스크가 암호화한 메모가 계속 암호문으로
// 보였다. 암호가 서로 달랐던 것인데, 앱은 "설정됨"만 알려줄 뿐 열리는지는 확인해 주지
// 않아서 사용자가 원인을 알 수 없었다. → 넣자마자 실제로 열어보고 알려준다.

import { api } from "./api";
import { getE2EEKey } from "./e2ee-store";
import { isEncrypted, decrypt } from "./e2ee";

export type E2EECheck =
  | "ok" // 암호화된 항목을 실제로 열었다 = 스쿨데스크와 같은 암호
  | "mismatch" // 암호화된 항목이 있는데 못 열었다 = 암호가 다름
  | "nothing" // 서버에 암호화된 항목이 없어 확인 불가(문제 아님)
  | "offline"; // 서버 조회 실패 — 판정 불가

/** 서버의 암호화된 원본을 복호화해 본다. 화면 표시용 복호는 거치지 않는다. */
export async function verifyE2EEAgainstServer(): Promise<E2EECheck> {
  const key = await getE2EEKey();
  if (!key) return "nothing";

  let raw: { content?: string | null }[] = [];
  try {
    // ⚠️ api.getNotes() 는 이미 복호화된 결과라 판정에 쓸 수 없다. 원본이 필요하므로
    //    복호화를 거치지 않는 저수준 fetch 를 쓴다.
    const res = await api.fetch<
      { content?: string | null }[] | { notes: { content?: string | null }[] }
    >("/api/notes");
    // 서버는 { notes, pagination } 으로 감싸서 준다.
    raw = Array.isArray(res) ? res : (res?.notes ?? []);
  } catch {
    return "offline";
  }

  const locked = raw.filter((n) => isEncrypted(n?.content));
  if (locked.length === 0) return "nothing";

  for (const n of locked) {
    try {
      const obj = JSON.parse(decrypt(n.content as string, key));
      if (typeof obj?.c === "string") return "ok";
    } catch {
      // 다음 항목으로 — 한 건이 깨졌을 수도 있으니 전부 실패해야 mismatch 로 본다.
    }
  }
  return "mismatch";
}
