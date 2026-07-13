// 레거시 개인일정 이관 — routines 테이블에 편법 저장되던 개인일정을 정식 events 로 옮긴다.
//
// 배경: 과거 /api/events 가 모바일 토큰을 거부해서, 앱은 개인일정을 routines 에
// `description = JSON.stringify({date, place, notify})` 로 저장했다. 그 결과 스쿨데스크
// (schedules ↔ /api/events 동기화)로는 폰에서 만든 개인일정이 **영원히 넘어가지 못했다**.
// 이제 /api/events 가 모바일 토큰을 받으므로 저장소를 events 로 통일한다.
//
// 안전 규칙:
// - description 에 `date` 키가 있는 루틴만 대상 (진짜 루틴/습관은 절대 건드리지 않음)
// - 한 건씩 try/catch: **생성 성공한 건만** 원본 삭제 → 실패해도 데이터 유실 없음
// - 멱등: 남은 잔여분이 있으면 다음 실행 때 이어서 재시도

import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { Routine } from "../types";
import { scheduleTaskAlarm, cancelTaskAlarm } from "./taskAlarm";
import { useSettingsStore } from "../store/settings";

const MIGRATION_FLAG_KEY = "schedule_to_event_migrated_v1";

export const PERSONAL_CATEGORY = "개인";
export const PERSONAL_COLOR = "#6366f1"; // 개인일정 = 인디고(학교일정 보라와 구분)

export interface LegacyScheduleMeta {
  date: string; // YYYY-MM-DD
  place?: string;
  notify?: boolean;
}

// 앱이 실제로 써 넣던 키는 이 셋뿐이다. 그 외 키가 섞여 있으면 개인일정이 아니라고 보고
// 건드리지 않는다(진짜 루틴 오삭제 방지 — 보수적으로 판단).
const LEGACY_KEYS = new Set(["date", "place", "notify"]);

export function parseLegacyScheduleMeta(
  desc: string | null,
): LegacyScheduleMeta | null {
  if (!desc) return null;
  try {
    const parsed = JSON.parse(desc);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    if (typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date))
      return null;
    if (!Object.keys(parsed).every((k) => LEGACY_KEYS.has(k))) return null;
    return parsed as LegacyScheduleMeta;
  } catch {}
  return null;
}

/** routines 응답에서 레거시 개인일정만 골라낸다(진짜 루틴 제외). */
export function pickLegacySchedules(routines: Routine[]): Routine[] {
  return routines.filter(
    (r) =>
      !!parseLegacyScheduleMeta(r.description) &&
      // 항목이 있는 건 진짜 루틴(체크리스트) — 개인일정은 항상 항목이 없다
      (r.items?.length ?? 0) === 0,
  );
}

/** 레거시 루틴 1건 → events 생성 payload */
export function toEventPayload(routine: Routine) {
  const meta = parseLegacyScheduleMeta(routine.description)!;
  const time = routine.startTime || "00:00";
  const start = new Date(`${meta.date}T${time}:00`);
  if (Number.isNaN(start.getTime()))
    throw new Error(`invalid legacy schedule date: ${meta.date} ${time}`);
  const startAt = start.toISOString();
  const endAt = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
  return {
    title: routine.name,
    description: "",
    location: meta.place?.trim() || null,
    startAt,
    endAt,
    isAllDay: false,
    color: PERSONAL_COLOR,
    category: PERSONAL_CATEGORY,
    recurrence: null,
    isRecurring: false,
    reminderSettings: JSON.stringify({
      reminderMinutes: 10,
      recurrenceEnd: null,
      isCompleted: 0,
      notify: meta.notify !== false,
    }),
  };
}

export interface MigrationResult {
  migrated: number;
  failed: number;
  skipped: boolean; // 이미 완료돼서 아무것도 안 함
}

// 재진입 락: 달력 탭을 빠르게 들락날락하면 이전 이관이 아직 네트워크 대기 중인데
// 두 번째 이관이 같은 목록을 읽어 이벤트를 이중 생성할 수 있다. 진행 중이면 그 Promise 를 공유.
let inFlight: Promise<MigrationResult> | null = null;

/**
 * 1회성(잔여분 있으면 재시도) 이관. 앱 시작/달력 진입 시 호출.
 * 실패해도 앱 동작에 영향이 없도록 절대 throw 하지 않는다.
 */
export function migrateLegacySchedules(): Promise<MigrationResult> {
  if (!inFlight) {
    inFlight = runMigration().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runMigration(): Promise<MigrationResult> {
  try {
    const done = await SecureStore.getItemAsync(MIGRATION_FLAG_KEY);
    if (done === "1") return { migrated: 0, failed: 0, skipped: true };
  } catch {}

  let legacy: Routine[] = [];
  try {
    const res = await api.getRoutines();
    const list = Array.isArray(res) ? res : res.routines;
    legacy = pickLegacySchedules(list || []);
  } catch {
    // 네트워크 실패: 플래그를 세우지 않고 다음 기회에 재시도
    return { migrated: 0, failed: 0, skipped: false };
  }

  if (legacy.length === 0) {
    try {
      await SecureStore.setItemAsync(MIGRATION_FLAG_KEY, "1");
    } catch {}
    return { migrated: 0, failed: 0, skipped: false };
  }

  const alarmEnabled = useSettingsStore.getState().scheduleAlarmEnabled;
  let migrated = 0;
  let failed = 0;

  // 중복 방어: 지난번 실행에서 "생성은 됐는데 원본 삭제가 실패"한 건이 있으면 다시 만들지 않는다.
  // 날짜별로 기존 개인일정을 1회만 조회해 (제목, 시작시각)이 같으면 그 이벤트를 재사용한다.
  const existingByDate = new Map<string, Map<string, string>>(); // date → (key → eventId)
  const existingOnDate = async (date: string): Promise<Map<string, string>> => {
    const cached = existingByDate.get(date);
    if (cached) return cached;
    const found = new Map<string, string>();
    try {
      const evs = await api.getEventsByDate(date);
      for (const e of evs) {
        if ((e.category || "") !== PERSONAL_CATEGORY) continue;
        found.set(`${e.title} ${e.startAt}`, e.id);
      }
    } catch {
      // 조회 실패 시엔 빈 맵 — 생성은 진행(유실보다 중복이 낫다)
    }
    existingByDate.set(date, found);
    return found;
  };

  for (const routine of legacy) {
    const meta = parseLegacyScheduleMeta(routine.description)!;
    try {
      // 깨진 날짜/시간이면 이 건만 건너뛴다(원본 보존). 예전엔 여기서 throw 되면
      // 남은 일정 전체가 이관되지 못했다.
      const payload = toEventPayload(routine);
      const dupId = (await existingOnDate(meta.date)).get(
        `${payload.title} ${payload.startAt}`,
      );
      const eventId = dupId ?? (await api.createEvent(payload as never))?.id;
      // 생성(또는 기존 건 확인)이 끝난 뒤에만 원본 삭제 → 중간에 죽어도 유실 없음
      await api.deleteRoutine(routine.id);
      migrated++;

      // 알람 주체가 루틴 id → 이벤트 id 로 바뀌므로 옮겨 단다.
      try {
        await cancelTaskAlarm(routine.id);
        const when = new Date(`${meta.date}T${routine.startTime || "00:00"}:00`);
        if (
          alarmEnabled &&
          meta.notify !== false &&
          eventId &&
          when.getTime() > Date.now()
        ) {
          await scheduleTaskAlarm(eventId, routine.name, when, "schedule");
        }
      } catch {}
    } catch {
      failed++;
    }
  }

  if (failed === 0) {
    try {
      await SecureStore.setItemAsync(MIGRATION_FLAG_KEY, "1");
    } catch {}
  }
  return { migrated, failed, skipped: false };
}
