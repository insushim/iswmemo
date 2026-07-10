import { NativeModules, Platform } from "react-native";
import { API_URL } from "./config";
import { persistentGet, persistentSet, persistentDelete } from "./storage";
import { reportError } from "./errorReporter";
import { encrypt, decrypt, isEncrypted } from "./e2ee";
import { getE2EEKey } from "./e2ee-store";
import type {
  Task,
  Habit,
  Goal,
  Note,
  Routine,
  RoutineLog,
  Priority,
  HabitFrequency,
  GoalType,
  GoalStatus,
  RoutineType,
  CalendarEvent,
} from "../types";

// --- Request payload types ---

interface CreateEventPayload {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  isAllDay?: boolean;
  color?: string;
  category?: string | null;
  recurrence?: string | null;
  isRecurring?: boolean;
  reminderSettings?: string | null;
}

interface UpdateEventPayload {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  isAllDay?: boolean;
  color?: string;
  category?: string | null;
  recurrence?: string | null;
  isRecurring?: boolean;
  reminderSettings?: string | null;
}

interface CreateTaskPayload {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
}

interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  isCompleted?: boolean;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
}

interface CreateHabitPayload {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  frequency?: HabitFrequency;
  targetDays?: number[];
  targetCount?: number;
}

interface UpdateHabitPayload {
  name?: string;
  description?: string | null;
  icon?: string;
  color?: string;
  frequency?: HabitFrequency;
  targetDays?: number[];
  targetCount?: number;
  isActive?: boolean;
}

interface CreateGoalPayload {
  title: string;
  description?: string | null;
  type?: GoalType;
  priority?: Priority;
  status?: GoalStatus;
  targetValue?: number | null;
  unit?: string | null;
  startDate?: string;
  endDate?: string | null;
  color?: string;
  icon?: string;
}

interface UpdateGoalPayload {
  title?: string;
  description?: string | null;
  type?: GoalType;
  status?: GoalStatus;
  priority?: Priority;
  progress?: number;
  targetValue?: number | null;
  currentValue?: number;
  unit?: string | null;
  endDate?: string | null;
  color?: string;
  icon?: string;
}

interface CreateNotePayload {
  title: string;
  content?: string;
  contentType?: "text" | "markdown" | "rich";
  color?: string | null;
}

interface UpdateNotePayload {
  title?: string;
  content?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  color?: string | null;
}

interface CreateRoutinePayload {
  name: string;
  description?: string | null;
  type?: RoutineType;
  startTime?: string | null;
  endTime?: string | null;
  items?: { name: string; duration?: number | null; order?: number }[];
}

interface UpdateRoutinePayload {
  name?: string;
  description?: string | null;
  type?: RoutineType;
  startTime?: string | null;
  endTime?: string | null;
  isActive?: boolean;
  items?: { name: string; duration?: number | null; order?: number }[];
}

interface RoutinesResponse {
  routines: Routine[];
}

// --- E2EE 변환 헬퍼 (SchoolDesk·웹과 동일 규약) ---
// 자유텍스트는 무제한 컬럼(description/content)에 암호문으로 싣고 title 은 자물쇠 placeholder.
// 읽기: 복호 성공 시 평문 복원, 실패/키없음/평문(레거시)은 안전 처리. 쓰기: 키 있으면 암호화.

const LOCK = "🔒";

function firstLine(s: string, n = 50): string {
  return (s.split("\n")[0] || "").slice(0, n);
}

// ⚠️ 데이터 안전: 복호 불가(키없음/실패)면 객체를 **그대로** 반환(암호문 보존).
// 빈 값으로 바꾸면 사용자가 그 상태로 저장 시 서버 암호문을 파괴하므로 절대 비우지 않는다.
// 서버 title 은 이미 '🔒 메모/할일/일정' placeholder 라 그대로도 자물쇠로 보인다.

/** note 복호화. 평문/복호불가는 원본 유지. */
function decryptNote(n: Note, key: Uint8Array | null): Note {
  if (!key || !isEncrypted(n.content)) return n;
  try {
    const obj = JSON.parse(decrypt(n.content, key));
    const content = typeof obj?.c === "string" ? obj.c : "";
    return { ...n, content, title: firstLine(content) || n.title };
  } catch {
    return n; // 암호문 보존
  }
}

/** task 복호화(SchoolDesk가 description 에 {t,d} 암호화). */
function decryptTask(t: Task, key: Uint8Array | null): Task {
  if (!key || !isEncrypted(t.description)) return t;
  try {
    const obj = JSON.parse(decrypt(t.description as string, key));
    return {
      ...t,
      title: typeof obj?.t === "string" && obj.t ? obj.t : t.title,
      description: typeof obj?.d === "string" ? obj.d : "",
    };
  } catch {
    return t; // 암호문 보존
  }
}

/** event 복호화(SchoolDesk가 description 에 {t,d,l} 암호화). */
function decryptEvent(e: CalendarEvent, key: Uint8Array | null): CalendarEvent {
  if (!key || !isEncrypted(e.description)) return e;
  try {
    const obj = JSON.parse(decrypt(e.description as string, key));
    return {
      ...e,
      title: typeof obj?.t === "string" && obj.t ? obj.t : e.title,
      description: typeof obj?.d === "string" ? obj.d : "",
      location: typeof obj?.l === "string" ? obj.l : "",
    };
  } catch {
    return e; // 암호문 보존
  }
}

// 쓰기 암호화 — 키 없으면 평문 그대로. 자유텍스트 필드가 페이로드에 있을 때만 묶어 암호화한다
// (부분 업데이트로 빈 값 덮어쓰기 방지: 해당 필드가 undefined 면 건드리지 않음).
async function e2eeEncryptTaskPayload<T extends { title?: string; description?: string | null }>(
  data: T,
): Promise<T> {
  const key = await getE2EEKey();
  if (!key) return data;
  if (data.title === undefined && data.description === undefined) return data; // 메타만 변경
  const blob = encrypt(JSON.stringify({ t: data.title ?? "", d: data.description ?? "" }), key);
  return { ...data, title: `${LOCK} 할일`, description: blob };
}

async function e2eeEncryptNotePayload<T extends { title?: string; content?: string }>(
  data: T,
): Promise<T> {
  const key = await getE2EEKey();
  if (!key) return data;
  if (data.content === undefined) return data; // 핀/색만 변경
  const blob = encrypt(JSON.stringify({ c: data.content ?? "" }), key);
  return { ...data, title: `${LOCK} 메모`, content: blob };
}

async function e2eeEncryptEventPayload<
  T extends { title?: string; description?: string | null; location?: string | null },
>(data: T): Promise<T> {
  const key = await getE2EEKey();
  if (!key) return data;
  if (data.title === undefined && data.description === undefined && data.location === undefined) {
    return data;
  }
  const blob = encrypt(
    JSON.stringify({ t: data.title ?? "", d: data.description ?? "", l: data.location ?? "" }),
    key,
  );
  return { ...data, title: `${LOCK} 일정`, description: blob, location: "" };
}

// --- Fetch options ---

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: Record<string, unknown>;
}

// --- Timeout ---

const REQUEST_TIMEOUT_MS = 30_000;

// --- API Client ---

class ApiClient {
  private token: string | null = null;

  async setToken(token: string): Promise<void> {
    this.token = token;
    await persistentSet("auth_token", token);
    // Native AlarmActivity에서 삭제 API 호출 시 사용할 토큰 저장
    if (Platform.OS === "android" && NativeModules.AlarmModule?.saveAuthToken) {
      try {
        await NativeModules.AlarmModule.saveAuthToken(token);
      } catch (e) {}
    }
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await persistentGet("auth_token");
      if (
        this.token &&
        Platform.OS === "android" &&
        NativeModules.AlarmModule?.saveAuthToken
      ) {
        try {
          NativeModules.AlarmModule.saveAuthToken(this.token);
        } catch (e) {}
      }
    }
    return this.token;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    await persistentDelete("auth_token");
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const token = await this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const config: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
    };

    if (options.body && typeof options.body === "object") {
      config.body = JSON.stringify(options.body);
    }

    const method = (options.method || "GET").toUpperCase();
    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);

      if (!response.ok) {
        const errBody = await response
          .json()
          .catch(() => ({ error: "Request failed" }));
        const msg =
          errBody?.error || `HTTP ${response.status} ${response.statusText || ""}`.trim();

        // 401 → 토큰 만료/무효 가능. 단, 단발 일시 401(서버 콜드스타트/clock skew/
        // 순간 5xx→401)과 진짜 만료를 구분한다. handleUnauthorized가 verify를 1회
        // 재확인해 재차 401일 때만 로그아웃(loggedOut=true). 그 외엔 세션 유지.
        if (response.status === 401) {
          const loggedOut = await this.handleUnauthorized(msg);
          throw new Error(
            loggedOut
              ? "세션이 만료되었습니다. 다시 로그인해주세요."
              : "일시적인 인증 오류입니다. 잠시 후 다시 시도해주세요.",
          );
        }

        const err = new Error(msg);
        reportError(err, `${method} ${endpoint}`);
        throw err;
      }

      // 204/빈 바디 응답(DELETE 등)에 json()을 시도하면 파싱 에러로 성공이 실패처럼
      // 보인다 → 빈 응답은 undefined로 정상 반환.
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        const timeoutErr = new Error(
          `Request to ${endpoint} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        );
        reportError(timeoutErr, `${method} ${endpoint}`);
        throw timeoutErr;
      }
      reportError(err, `${method} ${endpoint}`);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private unauthorizedHandling = false;
  // 401 수신 시 즉시 로그아웃하지 않고 verify로 1회 재확인한다.
  // 재확인도 "명시적 401"일 때만 토큰 삭제 + 로그아웃(true 반환).
  // 네트워크/5xx/일시 오류는 세션 유지(false) → 콜드스타트 blip 등에 의한
  // "가끔 로그인 풀림" 방지. checkAuth의 "일시 오류엔 로그아웃 안 함" 정책과 통일.
  // 반환: true=로그아웃됨, false=세션 유지.
  private async handleUnauthorized(serverMsg: string): Promise<boolean> {
    // 동시 다발 401 폭격 시 한 번만 처리 (나머지 호출은 세션 유지로 간주)
    if (this.unauthorizedHandling) return false;
    this.unauthorizedHandling = true;
    try {
      const confirmedInvalid = await this.confirmTokenInvalid();
      if (!confirmedInvalid) {
        // 토큰이 실제로는 유효하거나 판단 불가 → 일시 오류로 보고 세션 유지
        return false;
      }
      await this.clearToken();
      // circular dep 회피용 동적 require
      try {
        const { useAuthStore } = require("../store/auth");
        useAuthStore.getState().setUser(null);
      } catch {}
      reportError(
        new Error(`세션 만료 (${serverMsg}). 로그인 화면으로 이동합니다.`),
        "AUTH",
      );
      return true;
    } finally {
      // 다음 user action 때 다시 시도할 수 있게 약간의 쿨다운 후 해제
      setTimeout(() => {
        this.unauthorizedHandling = false;
      }, 2000);
    }
  }

  // verify 엔드포인트로 토큰 유효성 재확인.
  // 반환 true = 토큰이 확실히 무효(verify가 401) → 로그아웃해야 함.
  // 반환 false = 유효하거나 판단 불가(네트워크/5xx/타임아웃) → 세션 유지(보수적).
  private async confirmTokenInvalid(): Promise<boolean> {
    const token = this.token;
    if (!token) return true; // 토큰 자체가 없으면 이미 로그아웃 상태
    // 짧은 지연 후 재확인 — 서버 콜드스타트/일시 5xx가 가라앉을 여유를 준다
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${API_URL}/api/auth/mobile/verify`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // 명시적 401만 진짜 만료로 처리. 그 외(200/5xx 등)는 세션 유지.
      return resp.status === 401;
    } catch {
      // 네트워크 오류 → 일시적일 수 있으니 세션 유지
      return false;
    }
  }

  // --- Tasks ---

  async getTasks(): Promise<Task[]> {
    const tasks = await this.fetch<Task[]>("/api/tasks");
    const key = await getE2EEKey();
    if (!key || !Array.isArray(tasks)) return tasks;
    return tasks.map((t) => decryptTask(t, key));
  }

  async createTask(data: CreateTaskPayload): Promise<Task> {
    const body = await e2eeEncryptTaskPayload(data);
    const created = await this.fetch<Task>("/api/tasks", {
      method: "POST",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptTask(created, await getE2EEKey());
  }

  async updateTask(id: string, data: UpdateTaskPayload): Promise<Task> {
    const body = await e2eeEncryptTaskPayload(data);
    const updated = await this.fetch<Task>(`/api/tasks?id=${id}`, {
      method: "PATCH",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptTask(updated, await getE2EEKey());
  }

  async deleteTask(id: string): Promise<void> {
    return this.fetch<void>(`/api/tasks?id=${id}`, {
      method: "DELETE",
    });
  }

  // --- Habits ---

  async getHabits(): Promise<Habit[]> {
    return this.fetch<Habit[]>("/api/habits");
  }

  async createHabit(data: CreateHabitPayload): Promise<Habit> {
    return this.fetch<Habit>("/api/habits", {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async completeHabit(id: string, date: string): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}/complete`, {
      method: "POST",
      body: { date },
    });
  }

  async uncompleteHabit(id: string, date: string): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}/complete`, {
      method: "DELETE",
      body: { date },
    });
  }

  async updateHabit(id: string, data: UpdateHabitPayload): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteHabit(id: string): Promise<void> {
    return this.fetch<void>(`/api/habits/${id}`, {
      method: "DELETE",
    });
  }

  // --- Goals ---

  async getGoals(): Promise<Goal[]> {
    return this.fetch<Goal[]>("/api/goals");
  }

  async createGoal(data: CreateGoalPayload): Promise<Goal> {
    return this.fetch<Goal>("/api/goals", {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateGoal(id: string, data: UpdateGoalPayload): Promise<Goal> {
    return this.fetch<Goal>(`/api/goals/${id}`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteGoal(id: string): Promise<void> {
    return this.fetch<void>(`/api/goals/${id}`, {
      method: "DELETE",
    });
  }

  // --- Notes ---

  async getNotes(): Promise<Note[]> {
    const notes = await this.fetch<Note[]>("/api/notes");
    const key = await getE2EEKey();
    if (!key || !Array.isArray(notes)) return notes;
    return notes.map((n) => decryptNote(n, key));
  }

  async createNote(data: CreateNotePayload): Promise<Note> {
    const body = await e2eeEncryptNotePayload(data);
    const created = await this.fetch<Note>("/api/notes", {
      method: "POST",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptNote(created, await getE2EEKey());
  }

  async updateNote(id: string, data: UpdateNotePayload): Promise<Note> {
    const body = await e2eeEncryptNotePayload(data);
    const updated = await this.fetch<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptNote(updated, await getE2EEKey());
  }

  async deleteNote(id: string): Promise<void> {
    return this.fetch<void>(`/api/notes/${id}`, {
      method: "DELETE",
    });
  }

  // --- Routines ---

  async getRoutines(): Promise<RoutinesResponse | Routine[]> {
    return this.fetch<RoutinesResponse | Routine[]>("/api/routines");
  }

  async createRoutine(data: CreateRoutinePayload): Promise<Routine> {
    return this.fetch<Routine>("/api/routines", {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateRoutine(
    id: string,
    data: UpdateRoutinePayload,
  ): Promise<Routine> {
    return this.fetch<Routine>(`/api/routines/${id}`, {
      method: "PATCH",
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteRoutine(id: string): Promise<void> {
    return this.fetch<void>(`/api/routines/${id}`, {
      method: "DELETE",
    });
  }

  async reorder(
    type: "task" | "habit" | "note" | "routine" | "goal",
    items: { id: string; order: number }[],
  ): Promise<void> {
    await this.fetch<void>("/api/reorder", {
      method: "PATCH",
      body: { type, items } as unknown as Record<string, unknown>,
    });
  }

  async toggleRoutineItem(
    routineId: string,
    itemIndex: number,
  ): Promise<RoutineLog> {
    return this.fetch<RoutineLog>(`/api/routines/${routineId}/log`, {
      method: "POST",
      body: { itemIndex },
    });
  }

  // --- Calendar Events (달력) ---

  // 특정 월의 일정 (year=YYYY, month=1~12)
  async getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
    const res = await this.fetch<{ events: CalendarEvent[] }>(
      `/api/events?year=${year}&month=${month}`,
    );
    const events = res?.events ?? [];
    const key = await getE2EEKey();
    return key ? events.map((e) => decryptEvent(e, key)) : events;
  }

  // 특정 날짜의 일정 (date=YYYY-MM-DD)
  async getEventsByDate(date: string): Promise<CalendarEvent[]> {
    const res = await this.fetch<{ events: CalendarEvent[] }>(
      `/api/events?date=${date}`,
    );
    const events = res?.events ?? [];
    const key = await getE2EEKey();
    return key ? events.map((e) => decryptEvent(e, key)) : events;
  }

  async createEvent(data: CreateEventPayload): Promise<CalendarEvent> {
    const body = await e2eeEncryptEventPayload(data);
    const created = await this.fetch<CalendarEvent>("/api/events", {
      method: "POST",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptEvent(created, await getE2EEKey());
  }

  async updateEvent(
    id: string,
    data: UpdateEventPayload,
  ): Promise<CalendarEvent> {
    const body = await e2eeEncryptEventPayload(data);
    const updated = await this.fetch<CalendarEvent>(`/api/events/${id}`, {
      method: "PATCH",
      body: body as unknown as Record<string, unknown>,
    });
    return decryptEvent(updated, await getE2EEKey());
  }

  async deleteEvent(id: string): Promise<void> {
    return this.fetch<void>(`/api/events/${id}`, {
      method: "DELETE",
    });
  }
}

export const api = new ApiClient();
