// 업데이트 후 "새로운 점" 안내 — 스쿨데스크처럼 바뀐 점을 간단히 보여준다.
// 저장된 마지막 확인 버전과 현재 버전을 비교해, 그 사이에 올라온 변경사항만 모은다.
import { APP_VERSION } from "./config";
import { persistentGet, persistentSet } from "./storage";

const LAST_SEEN_KEY = "whats_new_seen_version";

export interface ChangelogEntry {
  version: string;
  notes: string[];
}

// 최신이 위로. 사용자에게 보여줄 한 줄 문구만(기술 용어 X).
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "3.13.34",
    notes: [
      "순서 바꾸기(꾹 눌러 이동)가 더 잘 되도록 고쳤어요 — 집으면 살짝 커지고 테두리·진동으로 '집었다'를 표시합니다.",
    ],
  },
  {
    version: "3.13.33",
    notes: [
      "목록 좌우 스와이프가 너무 민감해 드래그 중 실수로 삭제·복사되던 문제를 고쳤어요(더 확실히 옆으로 밀어야 실행).",
    ],
  },
  {
    version: "3.13.32",
    notes: [
      "마이크 권한이 없을 때 오류 대신 '마이크 권한을 켜주세요' 안내가 뜨도록 고쳤어요.",
    ],
  },
  {
    version: "3.13.31",
    notes: [
      "전화가 올 때 잠금화면 메모가 전화 화면을 가리지 않도록 고쳤어요(카톡·영상통화 등 포함).",
      "앱을 업데이트하면 바뀐 점을 이렇게 알려드려요.",
    ],
  },
  {
    version: "3.13.30",
    notes: ["새로 쓴 할일이 저장되기 전에 화면에서 잠깐 사라지던 문제를 막았어요."],
  },
  {
    version: "3.13.29",
    notes: ["새로 추가한 할일이 앱을 껐다 켜도 맨 위에 그대로 있도록 고쳤어요."],
  },
  {
    version: "3.13.28",
    notes: ["작은 화면 폰에서 상단 헤더(날씨·미세먼지)가 잘리던 문제를 고쳤어요."],
  },
  {
    version: "3.13.26",
    notes: ["내용이 빈 메모가 자물쇠로 잘못 보이던 문제를 고쳤어요."],
  },
  {
    version: "3.13.25",
    notes: ["계정을 바꿔 로그인해도 앱을 껐다 켜지 않고 바로 동기화되도록 고쳤어요."],
  },
];

/** "a.b.c" 비교: a>b → 1, a<b → -1, 같으면 0 */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 마지막으로 확인한 버전 이후 ~ 현재 버전까지의 변경사항을 최신순으로 반환.
 * - 처음 설치(저장된 버전 없음)면 빈 배열(설치 직후엔 안내 안 함).
 * - 이미 최신을 봤으면 빈 배열.
 */
export async function getUnseenChangelog(): Promise<ChangelogEntry[]> {
  let seen: string | null = null;
  try {
    seen = await persistentGet(LAST_SEEN_KEY);
  } catch {
    seen = null;
  }
  // 저장된 기준선이 없음(이 기능 도입 전부터 쓰던 사용자 or 새 설치).
  // 기준선을 현재 버전으로 심되, 이번 버전 변경사항 하나는 보여준다(도입 즉시 체감).
  // 다음 업데이트부터는 그 사이 변경분만 모여서 나온다.
  if (!seen) {
    try {
      await persistentSet(LAST_SEEN_KEY, APP_VERSION);
    } catch {}
    return CHANGELOG.filter((e) => cmpVersion(e.version, APP_VERSION) === 0);
  }
  if (cmpVersion(seen, APP_VERSION) >= 0) return [];
  return CHANGELOG.filter(
    (e) => cmpVersion(e.version, seen!) > 0 && cmpVersion(e.version, APP_VERSION) <= 0,
  );
}

/** 안내를 닫으면 현재 버전을 확인 완료로 기록. */
export async function markChangelogSeen(): Promise<void> {
  try {
    await persistentSet(LAST_SEEN_KEY, APP_VERSION);
  } catch {}
}
