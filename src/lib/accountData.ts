// 계정에 딸린 로컬 데이터 정리.
//
// 버그였던 것(2026-07-14): 같은 폰에서 다른 계정으로 새로 가입했는데
//  - 헤더에 **이전 계정의 고정 목표**가 그대로 떠 있었고,
//  - 할일·습관·달력이 잠깐 보였다가 사라졌다.
// 원인: 화면들이 오프라인 대비로 저장해 둔 캐시(cached_tasks_v1 등)와 고정 목표(pinned_goals)가
//       **기기 단위**라 계정이 바뀌어도 남아 있었다. 앱은 그 캐시를 먼저 그려 주고(그래서 보였다),
//       새 계정의 서버 응답(빈 목록)으로 교체했다(그래서 사라졌다).
//       = 다른 사람의 데이터가 잠깐이라도 화면에 보이는 문제이기도 하다.
//
// → 로그아웃할 때, 그리고 **다른 계정으로 로그인/가입할 때** 이 데이터를 전부 지운다.

import * as SecureStore from "expo-secure-store";
import { persistentDelete, persistentGet, persistentSet } from "./storage";
import { clearE2EEKey } from "./e2ee-store";

/** 마지막으로 로그인했던 사용자 id. 계정이 바뀌었는지 판정용. */
const LAST_USER_KEY = "last_user_id";
/** 저장된 암호화 키의 **소유자**. 다른 사람의 키를 쓰지 않기 위한 표식. */
const E2EE_OWNER_KEY = "e2ee_key_owner";

/**
 * 계정에 종속된 로컬 키 전부.
 * ⚠️ 새 캐시를 추가하면 여기에도 반드시 넣을 것 — 빠뜨리면 다음 사용자에게 남는다.
 */
const CACHE_KEYS = [
  // 화면 오프라인 캐시
  "cached_tasks_v1",
  "cached_habits_v1",
  "cached_routines_v1",
  "cached_routines_v2",
  "cached_notes_v1",
  "cached_goals_v1",
  // 헤더의 고정 목표
  "pinned_goals",
  // 1회성 이관 플래그(계정마다 따로 판단해야 한다)
  "schedule_to_event_migrated_v1",
] as const;

/**
 * 암호화 키 — **계정이 실제로 바뀔 때만** 지운다.
 *
 * 로그아웃할 때마다 지우면, 같은 사용자가 다시 로그인할 때마다 암호를 새로 입력해야 한다
 * (잠긴 메모가 안 열린다). 반대로 다른 계정으로 넘어갈 땐 반드시 지워야 한다 —
 * 이전 사용자의 키를 남길 수는 없다.
 */
const E2EE_KEYS = ["e2ee_key_b64", "e2ee_keyring_b64"] as const;

async function wipe(keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    // 개별 실패는 무시 — 하나 실패했다고 나머지를 못 지우면 안 된다.
    try {
      await persistentDelete(key);
    } catch {}
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  }
}

/** 캐시·고정 목표 등 화면에 보이는 데이터 정리(암호 키는 유지). */
export async function clearAccountData(): Promise<void> {
  await wipe(CACHE_KEYS);
}

/**
 * 로그인/가입 성공 직후 호출. 직전 사용자와 **다른 계정**이면 이전 계정의 로컬 데이터를 지운다.
 * 같은 계정이면 캐시를 유지한다(오프라인에서도 바로 보이는 이점을 잃지 않도록).
 */
export async function switchAccount(userId: string | null | undefined): Promise<void> {
  const id = typeof userId === "string" ? userId : "";
  if (!id) return;

  let prev = "";
  try {
    prev = (await persistentGet(LAST_USER_KEY)) ?? "";
  } catch {}

  const changed = prev !== "" && prev !== id;
  // 직전 사용자를 모르는데(첫 실행·업데이트 직후) 캐시가 남아 있으면, 그게 누구 것인지 알 수 없다.
  // 화면에 남의 데이터를 보여주느니 지우는 편이 낫다 — 내 데이터라면 서버에서 곧 다시 받는다.
  const unknownOwner = prev === "";

  if (changed || unknownOwner) {
    await clearAccountData();
  }

  // 암호화 키는 소유자를 확인해서 처리한다.
  //  - 다른 사람 키 → 지운다. (안 지우면 새 계정이 만든 데이터가 **이전 사용자의 키로 암호화**되어
  //    그 사람은 자기 데이터를 영영 못 연다. 메모리 캐시까지 반드시 비운다.)
  //  - 소유자 표시가 없는 예전 키 → 지금 로그인한 사람 것으로 간주하고 표시만 남긴다
  //    (이 표시는 이번 버전부터 생겼다. 기존 사용자에게 암호를 다시 묻지 않기 위함).
  let owner = "";
  try {
    owner = (await persistentGet(E2EE_OWNER_KEY)) ?? "";
  } catch {}

  if (owner && owner !== id) {
    try {
      await clearE2EEKey();
    } catch {}
    await wipe(E2EE_KEYS);
  } else if (!owner && changed) {
    // 소유자를 모르는 키인데 계정이 바뀐 게 확실하다 → 이전 사용자 것으로 보고 지운다.
    try {
      await clearE2EEKey();
    } catch {}
    await wipe(E2EE_KEYS);
  }

  try {
    await persistentSet(E2EE_OWNER_KEY, id);
    await persistentSet(LAST_USER_KEY, id);
  } catch {}
}

/**
 * 로그아웃 시 호출 — 화면에 남는 데이터를 지운다.
 * 암호 키는 남긴다(같은 사용자가 다시 로그인할 때 암호를 또 묻지 않도록).
 * 다른 계정으로 로그인하면 그 시점에 switchAccount 가 암호 키까지 지운다.
 */
export async function clearOnLogout(): Promise<void> {
  await clearAccountData();
}
