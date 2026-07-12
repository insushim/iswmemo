import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Animated,
  Share,
  AppState,
  Platform,
  NativeModules,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useSyncRefresh } from "../lib/syncRefresh";
import {
  Plus,
  X,
  Clock,
  MapPin,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Share2,
  Bell,
  BellOff,
  Copy,
  GraduationCap,
  Repeat,
  CalendarDays,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import {
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  isBefore,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import * as SecureStore from "expo-secure-store";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import { Routine, Task, CalendarEvent } from "../types";
import { useSettingsStore } from "../store/settings";
import { scheduleTaskAlarm, cancelTaskAlarm } from "../lib/taskAlarm";
import VoiceInput from "../components/VoiceInput";
import { Swipeable } from "react-native-gesture-handler";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";

const SCHEDULE_CACHE_KEY = "cached_schedules_v1";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TASK_COLOR = "#f59e0b"; // 기한 할일 = 주황 (ScheduleScreen 컨벤션과 통일)
const SCHOOL_COLOR = "#8b5cf6"; // 학교일정(events, school-desk 연동) = 보라

// 학교일정 카테고리(school-desk schedules.category 와 동일 집합)
const EVENT_CATEGORIES = [
  "일반",
  "학교행사",
  "수업",
  "회의",
  "출장",
  "연수",
  "개인",
] as const;
// 반복(school-desk recurrence 와 동일 값)
const RECURRENCE_OPTIONS: { label: string; value: string | null }[] = [
  { label: "없음", value: null },
  { label: "매일", value: "daily" },
  { label: "매주", value: "weekly" },
  { label: "매월", value: "monthly" },
  { label: "매년", value: "yearly" },
];
const RECURRENCE_LABEL: Record<string, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

interface ScheduleMeta {
  date: string; // YYYY-MM-DD
  place?: string;
  notify?: boolean;
}

function parseScheduleMeta(desc: string | null): ScheduleMeta | null {
  if (!desc) return null;
  try {
    const parsed = JSON.parse(desc);
    if (parsed && parsed.date) return parsed;
  } catch {}
  return null;
}

function getScheduleTime(routine: Routine): string {
  return routine.startTime || "00:00";
}

// 월 그리드를 항상 완전한 주(7칸) 단위로 — flexWrap + (100/7)% 부동소수점 초과로
// 토요일 칸이 다음 줄로 밀리는 버그를 원천 차단(주 단위 row + flex:1 셀).
function monthWeeks(month: Date): Date[][] {
  const s = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const e = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const all = eachDayOfInterval({ start: s, end: e });
  const weeks: Date[][] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  return weeks;
}

export default function CalendarScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const { scheduleAlarmEnabled } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [schedules, setSchedules] = useState<Routine[]>([]);
  const [deadlineTasks, setDeadlineTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]); // 학교일정(events)
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const viewMonthRef = useRef(viewMonth);
  useEffect(() => {
    viewMonthRef.current = viewMonth;
  }, [viewMonth]);

  // 추가/수정 모달
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Routine | null>(null);
  // 학교일정(events) 모달 상태
  const [entryType, setEntryType] = useState<"personal" | "school">("personal");
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventCategory, setEventCategory] = useState<string>("일반");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventRecurrence, setEventRecurrence] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [eventDate, setEventDate] = useState(new Date());
  const [eventHour, setEventHour] = useState(9);
  const [eventMinute, setEventMinute] = useState(0);
  const [eventIsAM, setEventIsAM] = useState(true);
  const [eventNotify, setEventNotify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventCalendarMonth, setEventCalendarMonth] = useState(new Date());
  const [editingHour, setEditingHour] = useState(false);
  const [editingMinute, setEditingMinute] = useState(false);
  const [hourInput, setHourInput] = useState("");
  const [minuteInput, setMinuteInput] = useState("");
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  const to24Hour = (hour12: number, am: boolean): number => {
    if (am) return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const from24Hour = (hour24: number): { hour: number; am: boolean } => {
    if (hour24 === 0) return { hour: 12, am: true };
    if (hour24 < 12) return { hour: hour24, am: true };
    if (hour24 === 12) return { hour: 12, am: false };
    return { hour: hour24 - 12, am: false };
  };

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(SCHEDULE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setSchedules(parsed);
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      setSchedules(data || []);
      SecureStore.setItemAsync(
        SCHEDULE_CACHE_KEY,
        JSON.stringify(data || []),
      ).catch(() => {});
    } catch (error) {
      console.error("Schedule fetch error:", error);
    }
  };

  const fetchTasks = async () => {
    try {
      const tasksRes = await api.getTasks();
      if (Array.isArray(tasksRes)) {
        const withDueDate = tasksRes.filter(
          (t: Task) => !t.isCompleted && t.dueDate,
        );
        setDeadlineTasks(withDueDate);
      }
    } catch {}
  };

  // 학교일정(events) — 보고 있는 달(또는 명시한 달) 기준 조회(school-desk 연동분 포함).
  // month 인자: 다른 달로 저장 직후 setViewMonth 가 반영되기 전(viewMonthRef 미갱신) race 방지용.
  const fetchEvents = async (month?: Date) => {
    const vm = month ?? viewMonthRef.current;
    try {
      const evs = await api.getEventsByMonth(
        vm.getFullYear(),
        vm.getMonth() + 1,
      );
      setEvents(Array.isArray(evs) ? evs : []);
    } catch {}
  };

  // 달 이동 시 해당 월 학교일정 재조회
  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchSchedules();
      }
      fetchTasks();
      fetchEvents();
    }, []),
  );

  // 스쿨데스크/웹 변경 실시간 반영 (변경신호 푸시 → refetch)
  useSyncRefresh(["tasks", "events", "routines"], () => {
    fetchSchedules();
    fetchTasks();
    fetchEvents();
  });

  // 잠금화면 알람에서 "일정 삭제" 누른 경우 → pending delete 처리
  const processPendingScheduleDelete = useCallback(async () => {
    if (Platform.OS !== "android" || !NativeModules.AlarmModule) return;
    try {
      const pending = await NativeModules.AlarmModule.getPendingDelete();
      if (pending?.id && pending.type === "schedule") {
        await api.deleteRoutine(pending.id);
        await NativeModules.AlarmModule.clearPendingDelete();
      }
    } catch (e) {
      try {
        await NativeModules.AlarmModule.clearPendingDelete();
      } catch {}
    }
  }, []);

  // 앱 복귀 시 pending delete 처리 후 새로고침
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        processPendingScheduleDelete().then(() => {
          fetchSchedules();
          fetchTasks();
          fetchEvents();
        });
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [processPendingScheduleDelete]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSchedules(), fetchTasks(), fetchEvents()]);
    setRefreshing(false);
  };

  // --- 날짜별 집계 ---
  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

  const schedulesForDay = useCallback(
    (day: Date): Routine[] => {
      const key = dayKey(day);
      return schedules
        .filter((s) => parseScheduleMeta(s.description)?.date === key)
        .sort((a, b) => getScheduleTime(a).localeCompare(getScheduleTime(b)));
    },
    [schedules],
  );

  const tasksForDay = useCallback(
    (day: Date): Task[] => {
      const key = dayKey(day);
      return deadlineTasks
        .filter((t) => t.dueDate && dayKey(parseISO(t.dueDate)) === key)
        .sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));
    },
    [deadlineTasks],
  );

  // 학교일정: startAt~endAt(로컬 날짜) 범위에 해당 날짜가 들어오면 표시(멀티데이 포함)
  const eventsForDay = useCallback(
    (day: Date): CalendarEvent[] => {
      const key = dayKey(day);
      return events
        .filter((e) => {
          if (!e.startAt) return false;
          const s = format(parseISO(e.startAt), "yyyy-MM-dd");
          const en = e.endAt ? format(parseISO(e.endAt), "yyyy-MM-dd") : s;
          return key >= s && key <= en;
        })
        .sort((a, b) => (a.startAt || "").localeCompare(b.startAt || ""));
    },
    [events],
  );

  const todaySchedules = schedulesForDay(selectedDate);
  const todayDeadlineTasks = tasksForDay(selectedDate);
  const todayEvents = eventsForDay(selectedDate);
  const allDisplayed = [...todaySchedules];

  const weeks = useMemo(() => monthWeeks(viewMonth), [viewMonth]);

  const openAddModal = () => {
    setEditingSchedule(null);
    setEditingEvent(null);
    setEntryType("personal");
    setEventCategory("일반");
    setEventAllDay(false);
    setEventRecurrence(null);
    setEventName("");
    setEventPlace("");
    setEventDate(selectedDate);
    setEventCalendarMonth(selectedDate);
    const now = new Date();
    const { hour, am } = from24Hour(now.getHours());
    setEventHour(hour);
    setEventMinute(now.getMinutes());
    setEventIsAM(am);
    setEventNotify(true);
    setShowModal(true);
  };

  const openEditModal = (schedule: Routine) => {
    setEditingSchedule(schedule);
    setEditingEvent(null);
    setEntryType("personal");
    setEventName(schedule.name);
    const meta = parseScheduleMeta(schedule.description);
    setEventPlace(meta?.place || "");
    const ed = meta?.date ? parseISO(meta.date) : new Date();
    setEventDate(ed);
    setEventCalendarMonth(ed);
    setEventNotify(meta?.notify !== false);
    if (schedule.startTime) {
      const [h, m] = schedule.startTime.split(":");
      const { hour, am } = from24Hour(parseInt(h));
      setEventHour(hour);
      setEventMinute(parseInt(m));
      setEventIsAM(am);
    }
    setShowModal(true);
  };

  // 학교일정(event) 수정 모달
  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingSchedule(null);
    setEditingEvent(ev);
    setEntryType("school");
    setEventName(ev.title);
    setEventPlace(ev.location || "");
    setEventCategory(ev.category || "일반");
    setEventAllDay(!!ev.isAllDay);
    setEventRecurrence(ev.recurrence || null);
    const sd = ev.startAt ? parseISO(ev.startAt) : new Date();
    setEventDate(sd);
    setEventCalendarMonth(sd);
    const { hour, am } = from24Hour(sd.getHours());
    setEventHour(hour);
    setEventMinute(sd.getMinutes());
    setEventIsAM(am);
    setShowModal(true);
  };

  // 학교일정(event) 생성/수정 — startAt/endAt ISO 변환은 school-desk 규약과 동일
  // (시간일정=로컬→UTC, 종일=날짜기반 UTC자정 고정으로 TZ 불변)
  const submitEvent = async (dateStr: string, startTime: string) => {
    const allDay = eventAllDay;
    const baseStart = new Date(`${dateStr}T${startTime}:00`);
    const startAt = allDay
      ? `${dateStr}T00:00:00.000Z`
      : baseStart.toISOString();
    const endAt = allDay
      ? `${dateStr}T00:00:00.000Z`
      : new Date(baseStart.getTime() + 60 * 60 * 1000).toISOString();
    const recurrence = eventRecurrence;
    const reminderSettings =
      editingEvent?.reminderSettings ||
      JSON.stringify({
        reminderMinutes: 10,
        recurrenceEnd: null,
        isCompleted: 0,
      });
    const payload = {
      title: eventName.trim(),
      // E2EE: 제목·설명·장소가 한 묶음으로 암호화되므로 수정 시 기존 설명을 함께 보내야
      // 서버 설명이 빈값으로 덮이지 않는다(editingEvent 는 복호된 메모리 값, 신규면 빈값).
      description: editingEvent?.description ?? "",
      location: eventPlace.trim() || null,
      startAt,
      endAt,
      isAllDay: allDay,
      color: editingEvent?.color || SCHOOL_COLOR,
      category: eventCategory,
      recurrence,
      isRecurring: !!recurrence,
      reminderSettings,
    };
    const editing = editingEvent;
    setShowModal(false);
    setSelectedDate(parseISO(dateStr));
    if (!isSameMonth(parseISO(dateStr), viewMonth)) {
      setViewMonth(startOfMonth(parseISO(dateStr)));
    }
    const targetMonth = parseISO(dateStr);
    try {
      if (editing) {
        await api.updateEvent(editing.id, payload);
      } else {
        await api.createEvent(payload as any);
      }
      await fetchEvents(targetMonth);
    } catch {
      Alert.alert("오류", "학교일정 저장에 실패했습니다");
      fetchEvents(targetMonth);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!eventName.trim()) {
      Alert.alert("오류", "일정 이름을 입력해주세요");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    let finalHour = eventHour;
    let finalMinute = eventMinute;
    if (editingHour) {
      const v = parseInt(hourInput);
      if (v >= 1 && v <= 12) finalHour = v;
      setEventHour(finalHour);
      setEditingHour(false);
    }
    if (editingMinute) {
      const v = parseInt(minuteInput);
      if (v >= 0 && v <= 59) finalMinute = v;
      setEventMinute(finalMinute);
      setEditingMinute(false);
    }

    const hour24 = to24Hour(finalHour, eventIsAM);
    const startTime = `${String(hour24).padStart(2, "0")}:${String(finalMinute).padStart(2, "0")}`;
    const dateStr = format(eventDate, "yyyy-MM-dd");

    // 학교일정이면 events 경로로 분기(개인일정 routine 로직은 아래 그대로)
    if (entryType === "school") {
      await submitEvent(dateStr, startTime);
      return;
    }

    const meta: ScheduleMeta = {
      date: dateStr,
      place: eventPlace.trim() || undefined,
      notify: eventNotify,
    };
    const payload = {
      name: eventName.trim(),
      description: JSON.stringify(meta),
      type: "CUSTOM" as any,
      startTime,
    };

    const isEditing = !!editingSchedule;
    const editId = editingSchedule?.id;

    setShowModal(false);
    // 선택일을 추가한 일정의 날짜로 이동(바로 보이도록)
    setSelectedDate(parseISO(dateStr));
    if (!isSameMonth(parseISO(dateStr), viewMonth)) {
      setViewMonth(startOfMonth(parseISO(dateStr)));
    }
    let tempId = "";
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const temp = {
        id: tempId,
        ...payload,
        items: [],
        completedItemsToday: [],
        isActive: true,
        endTime: null,
        createdAt: new Date().toISOString(),
      } as any;
      setSchedules((prev) => [temp, ...prev]);
    } else {
      setSchedules((prev) =>
        prev.map((s) => (s.id === editId ? { ...s, ...payload } : s)),
      );
    }

    try {
      if (isEditing && editId) {
        await api.updateRoutine(editId, payload);
        if (eventNotify && scheduleAlarmEnabled) {
          const alarmDate = new Date(`${dateStr}T${startTime}:00`);
          if (alarmDate.getTime() > Date.now()) {
            await scheduleTaskAlarm(editId, payload.name, alarmDate, "schedule");
          }
        } else {
          await cancelTaskAlarm(editId);
        }
      } else {
        const created = (await api.createRoutine(payload)) as any;
        if (created?.id && tempId) {
          setSchedules((prev) =>
            prev.map((s) => (s.id === tempId ? { ...s, id: created.id } : s)),
          );
          if (eventNotify && scheduleAlarmEnabled) {
            const alarmDate = new Date(`${dateStr}T${startTime}:00`);
            if (alarmDate.getTime() > Date.now()) {
              await scheduleTaskAlarm(
                created.id,
                payload.name,
                alarmDate,
                "schedule",
              );
            }
          }
        }
      }
    } catch {
      Alert.alert("오류", "저장에 실패했습니다");
      fetchSchedules();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (schedule: Routine) => {
    Alert.alert("삭제", `"${schedule.name}" 삭제할까요?`, [
      {
        text: "취소",
        style: "cancel",
        onPress: () => swipeableRefs.current.get(schedule.id)?.close(),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const prev = [...schedules];
          setSchedules((s) => s.filter((x) => x.id !== schedule.id));
          await cancelTaskAlarm(schedule.id);
          try {
            await api.deleteRoutine(schedule.id);
          } catch {
            setSchedules(prev);
            Alert.alert("오류", "삭제에 실패했습니다");
          }
        },
      },
    ]);
  };

  const handleDeleteEvent = (ev: CalendarEvent) => {
    Alert.alert("삭제", `"${ev.title}" 학교일정을 삭제할까요?`, [
      {
        text: "취소",
        style: "cancel",
        onPress: () => swipeableRefs.current.get(`event-${ev.id}`)?.close(),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const prev = [...events];
          setEvents((e) => e.filter((x) => x.id !== ev.id));
          try {
            await api.deleteEvent(ev.id);
          } catch {
            setEvents(prev);
            Alert.alert("오류", "삭제에 실패했습니다");
          }
        },
      },
    ]);
  };

  const handleShare = (schedule: Routine) => {
    const meta = parseScheduleMeta(schedule.description);
    const dateStr = meta?.date
      ? format(parseISO(meta.date), "yyyy년 M월 d일 (EEEE)", { locale: ko })
      : "";
    const timeStr = schedule.startTime || "";
    const placeStr = meta?.place ? `장소: ${meta.place}\n` : "";
    const message = `📅 또박또박 일정 공유\n\n일정: ${schedule.name}\n날짜: ${dateStr}\n시간: ${timeStr}\n${placeStr}\n또박또박 앱에서 확인하세요!`;
    Share.share({ message });
  };

  const handleShareToday = () => {
    const dayStr = format(selectedDate, "yyyy년 M월 d일 (EEEE)", { locale: ko });
    let message = `📅 또박또박 - ${dayStr} 일정\n`;
    if (allDisplayed.length > 0) {
      allDisplayed.forEach((s) => {
        const meta = parseScheduleMeta(s.description);
        const time = s.startTime ? formatTime12(s.startTime) : "";
        const place = meta?.place ? ` @ ${meta.place}` : "";
        message += `\n• ${time ? time + " " : ""}${s.name}${place}`;
      });
    } else {
      message += `\n일정이 없습니다.`;
    }
    message += `\n\n또박또박 앱에서 확인하세요!`;
    Share.share({ message });
  };

  const renderLeftActions =
    (schedule: Routine) =>
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [0.5, 1],
        extrapolate: "clamp",
      });
      return (
        <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
          <TouchableOpacity
            style={styles.swipeCopyBtn}
            onPress={() => {
              const meta = parseScheduleMeta(schedule.description);
              const time = schedule.startTime
                ? formatTime12(schedule.startTime)
                : "";
              const place = meta?.place ? ` (${meta.place})` : "";
              Clipboard.setStringAsync(
                `${time ? time + " " : ""}${schedule.name}${place}`,
              );
              swipeableRefs.current.get(schedule.id)?.close();
            }}
          >
            <Copy size={20} color="#fff" />
            <Text style={styles.swipeCopyText}>복사</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const renderRightActions =
    (schedule: Routine) =>
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });
      return (
        <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
          <TouchableOpacity
            style={styles.swipeDeleteBtn}
            onPress={() => handleDelete(schedule)}
          >
            <Trash2 size={20} color="#fff" />
            <Text style={styles.swipeDeleteText}>삭제</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const formatTime12 = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const { hour, am } = from24Hour(h);
    return `${am ? "오전" : "오후"} ${hour}:${String(m).padStart(2, "0")}`;
  };

  const isPast = (schedule: Routine) => {
    const meta = parseScheduleMeta(schedule.description);
    if (!meta?.date || !schedule.startTime) return false;
    const dt = new Date(`${meta.date}T${schedule.startTime}:00`);
    return dt.getTime() < Date.now();
  };

  const renderItem = ({
    item: schedule,
    drag,
    isActive,
  }: RenderItemParams<Routine>) => {
    const meta = parseScheduleMeta(schedule.description);
    const past = isPast(schedule);
    return (
      <ScaleDecorator>
        <Swipeable
          ref={(ref) => {
            if (ref) swipeableRefs.current.set(schedule.id, ref);
          }}
          renderLeftActions={renderLeftActions(schedule)}
          renderRightActions={renderRightActions(schedule)}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={40}
          rightThreshold={40}
          friction={2}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.scheduleCard,
              {
                backgroundColor: colors.card,
                padding: cardPadding,
                opacity: isActive ? 0.8 : 1,
              },
            ]}
            onPress={() => openEditModal(schedule)}
            onLongPress={drag}
            disabled={isActive}
          >
            <View style={styles.scheduleCenter}>
              <Text
                style={[
                  styles.scheduleName,
                  {
                    color: past ? "#ef4444" : colors.foreground,
                    fontSize: scaledFont(14),
                    textAlign,
                    textDecorationLine: past ? "line-through" : "none",
                  },
                ]}
              >
                {schedule.name}
              </Text>
              {meta?.place && (
                <View
                  style={[
                    styles.placeRow,
                    textAlign === "center" && { justifyContent: "center" },
                  ]}
                >
                  <MapPin size={11} color={colors.mutedForeground} />
                  <Text
                    style={[
                      styles.placeText,
                      { color: colors.mutedForeground, fontSize: scaledFont(11) },
                    ]}
                  >
                    {meta.place}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.scheduleRight}>
              {schedule.startTime && (
                <Text
                  style={[
                    styles.timeText,
                    {
                      color: past ? "#ef4444" : colors.primary,
                      fontSize: scaledFont(12),
                    },
                  ]}
                >
                  {formatTime12(schedule.startTime)}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => handleShare(schedule)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 2 }}
              >
                <Share2 size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Swipeable>
      </ScaleDecorator>
    );
  };

  // 학교일정(event) 카드
  const renderEventCard = (ev: CalendarEvent) => {
    const start = ev.startAt ? parseISO(ev.startAt) : null;
    const timeLabel = ev.isAllDay
      ? "종일"
      : start
        ? formatTime12(format(start, "HH:mm"))
        : "";
    const recur = ev.recurrence ? RECURRENCE_LABEL[ev.recurrence] : null;
    const cat = ev.category || "일반";
    return (
      <Swipeable
        key={`event-${ev.id}`}
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(`event-${ev.id}`, ref);
        }}
        renderRightActions={(
          _p: Animated.AnimatedInterpolation<number>,
          dragX: Animated.AnimatedInterpolation<number>,
        ) => {
          const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0.5],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              style={[styles.swipeDelete, { transform: [{ scale }] }]}
            >
              <TouchableOpacity
                style={styles.swipeDeleteBtn}
                onPress={() => handleDeleteEvent(ev)}
              >
                <Trash2 size={20} color="#fff" />
                <Text style={styles.swipeDeleteText}>삭제</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        overshootRight={false}
        rightThreshold={40}
        friction={2}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.scheduleCard,
            {
              backgroundColor: colors.card,
              padding: cardPadding,
              borderLeftColor: SCHOOL_COLOR,
              borderLeftWidth: 3,
            },
          ]}
          onPress={() => openEditEventModal(ev)}
        >
          <View style={styles.scheduleCenter}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <View
                style={[styles.catBadge, { backgroundColor: SCHOOL_COLOR + "22" }]}
              >
                <Text style={[styles.catBadgeText, { color: SCHOOL_COLOR }]}>
                  {cat}
                </Text>
              </View>
              <Text
                style={[
                  styles.scheduleName,
                  { color: colors.foreground, fontSize: scaledFont(14) },
                ]}
                numberOfLines={2}
              >
                {ev.title}
              </Text>
            </View>
            {(ev.location || recur) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 2,
                }}
              >
                {ev.location ? (
                  <View style={styles.placeRow}>
                    <MapPin size={11} color={colors.mutedForeground} />
                    <Text
                      style={[
                        styles.placeText,
                        {
                          color: colors.mutedForeground,
                          fontSize: scaledFont(11),
                        },
                      ]}
                    >
                      {ev.location}
                    </Text>
                  </View>
                ) : null}
                {recur ? (
                  <View style={styles.placeRow}>
                    <Repeat size={11} color={SCHOOL_COLOR} />
                    <Text
                      style={[
                        styles.placeText,
                        { color: SCHOOL_COLOR, fontSize: scaledFont(11) },
                      ]}
                    >
                      {recur}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
          <View style={styles.scheduleRight}>
            <Text
              style={[
                styles.timeText,
                { color: SCHOOL_COLOR, fontSize: scaledFont(12) },
              ]}
            >
              {timeLabel}
            </Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* 월 헤더 */}
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={() => setViewMonth(subMonths(viewMonth, 1))}
          hitSlop={10}
          style={styles.navBtn}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const now = new Date();
            setViewMonth(startOfMonth(now));
            setSelectedDate(now);
          }}
        >
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {format(viewMonth, "yyyy년 M월", { locale: ko })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMonth(addMonths(viewMonth, 1))}
          hitSlop={10}
          style={styles.navBtn}
        >
          <ChevronRight size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View style={styles.weekHeaderRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[
              styles.weekHeaderText,
              {
                color:
                  i === 0
                    ? "#ef4444"
                    : i === 6
                      ? "#3b82f6"
                      : colors.mutedForeground,
              },
            ]}
          >
            {w}
          </Text>
        ))}
      </View>

      {/* 월 그리드 (주 단위 행 — 토요일 누락 버그 없음) */}
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const selected = isSameDay(day, selectedDate);
              const today = isSameDay(day, new Date());
              const dow = day.getDay();
              const hasSchedule = schedulesForDay(day).length > 0;
              const hasTask = tasksForDay(day).length > 0;
              const hasEvent = eventsForDay(day).length > 0;
              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={styles.cell}
                  activeOpacity={0.6}
                  onPress={() => {
                    setSelectedDate(day);
                    if (!inMonth) setViewMonth(startOfMonth(day));
                  }}
                >
                  <View
                    style={[
                      styles.dayNumWrap,
                      selected && { backgroundColor: colors.primary },
                      !selected &&
                        today && {
                          borderWidth: 1.5,
                          borderColor: colors.primary,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : !inMonth
                              ? colors.mutedForeground + "70"
                              : dow === 0
                                ? "#ef4444"
                                : dow === 6
                                  ? "#3b82f6"
                                  : colors.foreground,
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dotRow}>
                    {hasSchedule && (
                      <View
                        style={[styles.dot, { backgroundColor: colors.primary }]}
                      />
                    )}
                    {hasEvent && (
                      <View
                        style={[styles.dot, { backgroundColor: SCHOOL_COLOR }]}
                      />
                    )}
                    {hasTask && (
                      <View
                        style={[styles.dot, { backgroundColor: TASK_COLOR }]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* 선택일 헤더 */}
      <View style={[styles.detailHeader, { borderTopColor: colors.border }]}>
        <Text style={[styles.detailDate, { color: colors.foreground }]}>
          {isSameDay(selectedDate, new Date())
            ? "오늘"
            : format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {allDisplayed.length > 0 && (
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              →복사 | ←삭제 | 꾹 드래그
            </Text>
          )}
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: colors.card,
                borderWidth: 1.5,
                borderColor: colors.primary,
              },
            ]}
            onPress={handleShareToday}
          >
            <Share2 size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.primary }]}
            onPress={openAddModal}
          >
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 선택일 일정 + 기한 할일 */}
      <View style={{ flex: 1 }}>
        <DraggableFlatList
          data={allDisplayed}
          activationDistance={20}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={({ data }: { data: Routine[] }) => {
            const ids = new Set(data.map((d) => d.id));
            setSchedules((prev) => [...data, ...prev.filter((s) => !ids.has(s.id))]);
            api
              .reorder(
                "routine",
                data.map((r, i) => ({ id: r.id, order: i })),
              )
              .catch(() => {});
          }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            todayEvents.length > 0 ? (
              <View style={{ marginBottom: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 4,
                    marginBottom: 6,
                  }}
                >
                  <GraduationCap size={12} color={SCHOOL_COLOR} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: SCHOOL_COLOR,
                    }}
                  >
                    학교일정
                  </Text>
                </View>
                {todayEvents.map((ev) => renderEventCard(ev))}
                {todaySchedules.length > 0 && (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.mutedForeground,
                      paddingHorizontal: 4,
                      marginTop: 8,
                      marginBottom: 6,
                    }}
                  >
                    개인일정
                  </Text>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            todayEvents.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card }]}>
                <Clock size={32} color={colors.mutedForeground} />
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  이 날 일정이 없습니다
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            <>
              {todayDeadlineTasks.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.mutedForeground,
                      paddingHorizontal: 4,
                      marginBottom: 6,
                    }}
                  >
                    기한 할일
                  </Text>
                  {todayDeadlineTasks.map((task) => {
                    const taskPast =
                      task.dueDate && isBefore(parseISO(task.dueDate), new Date());
                    return (
                      <Swipeable
                        key={task.id}
                        ref={(ref) => {
                          if (ref)
                            swipeableRefs.current.set(`task-${task.id}`, ref);
                        }}
                        renderLeftActions={(_p, dragX) => {
                          const scale = dragX.interpolate({
                            inputRange: [0, 80],
                            outputRange: [0.5, 1],
                            extrapolate: "clamp",
                          });
                          return (
                            <Animated.View
                              style={[styles.swipeCopy, { transform: [{ scale }] }]}
                            >
                              <TouchableOpacity
                                style={styles.swipeCopyBtn}
                                onPress={() => {
                                  const time = task.dueTime
                                    ? formatTime12(task.dueTime) + " "
                                    : "";
                                  Clipboard.setStringAsync(`${time}${task.title}`);
                                  swipeableRefs.current
                                    .get(`task-${task.id}`)
                                    ?.close();
                                }}
                              >
                                <Copy size={20} color="#fff" />
                                <Text style={styles.swipeCopyText}>복사</Text>
                              </TouchableOpacity>
                            </Animated.View>
                          );
                        }}
                        renderRightActions={(_p, dragX) => {
                          const scale = dragX.interpolate({
                            inputRange: [-80, 0],
                            outputRange: [1, 0.5],
                            extrapolate: "clamp",
                          });
                          return (
                            <Animated.View
                              style={[styles.swipeDelete, { transform: [{ scale }] }]}
                            >
                              <TouchableOpacity
                                style={styles.swipeDeleteBtn}
                                onPress={() => {
                                  Alert.alert(
                                    "삭제",
                                    `"${task.title}" 삭제할까요?`,
                                    [
                                      {
                                        text: "취소",
                                        style: "cancel",
                                        onPress: () =>
                                          swipeableRefs.current
                                            .get(`task-${task.id}`)
                                            ?.close(),
                                      },
                                      {
                                        text: "삭제",
                                        style: "destructive",
                                        onPress: async () => {
                                          setDeadlineTasks((prev) =>
                                            prev.filter((t) => t.id !== task.id),
                                          );
                                          try {
                                            await api.deleteTask(task.id);
                                          } catch {
                                            fetchTasks();
                                            Alert.alert("오류", "삭제에 실패했습니다");
                                          }
                                        },
                                      },
                                    ],
                                  );
                                }}
                              >
                                <Trash2 size={20} color="#fff" />
                                <Text style={styles.swipeDeleteText}>삭제</Text>
                              </TouchableOpacity>
                            </Animated.View>
                          );
                        }}
                        overshootLeft={false}
                        overshootRight={false}
                        leftThreshold={40}
                        rightThreshold={40}
                        friction={2}
                      >
                        <View
                          style={[
                            styles.scheduleCard,
                            {
                              backgroundColor: colors.card,
                              padding: cardPadding,
                              borderLeftColor: taskPast ? "#ef4444" : TASK_COLOR,
                              borderLeftWidth: 3,
                            },
                          ]}
                        >
                          <View style={styles.scheduleCenter}>
                            <Text
                              style={[
                                styles.scheduleName,
                                {
                                  color: taskPast ? "#ef4444" : colors.foreground,
                                  fontSize: scaledFont(14),
                                  textAlign,
                                  textDecorationLine: taskPast
                                    ? "line-through"
                                    : "none",
                                },
                              ]}
                            >
                              {task.title}
                            </Text>
                          </View>
                          <View style={styles.scheduleRight}>
                            {task.dueTime && (
                              <Text
                                style={[
                                  styles.timeText,
                                  {
                                    color: taskPast ? "#ef4444" : colors.primary,
                                    fontSize: scaledFont(12),
                                  },
                                ]}
                              >
                                {formatTime12(task.dueTime)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </Swipeable>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 20 }} />
            </>
          }
        />
      </View>

      {/* 추가/수정 모달 */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingEvent
                  ? "학교일정 수정"
                  : editingSchedule
                    ? "일정 수정"
                    : entryType === "school"
                      ? "새 학교일정"
                      : "새 일정"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* 일정 종류 토글(추가 시에만) */}
              {!editingSchedule && !editingEvent && (
                <View style={styles.typeToggleRow}>
                  {(
                    [
                      { key: "personal", label: "개인일정", color: colors.primary },
                      { key: "school", label: "학교일정", color: SCHOOL_COLOR },
                    ] as const
                  ).map((opt) => {
                    const active = entryType === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.typeToggleBtn,
                          {
                            backgroundColor: active
                              ? opt.color + "18"
                              : colors.background,
                            borderColor: active ? opt.color : colors.border,
                          },
                        ]}
                        onPress={() => setEntryType(opt.key)}
                      >
                        {opt.key === "school" ? (
                          <GraduationCap
                            size={15}
                            color={active ? opt.color : colors.mutedForeground}
                          />
                        ) : (
                          <CalendarDays
                            size={15}
                            color={active ? opt.color : colors.mutedForeground}
                          />
                        )}
                        <Text
                          style={[
                            styles.typeToggleText,
                            {
                              color: active ? opt.color : colors.mutedForeground,
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* 일정 이름 */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      borderColor: colors.border,
                      marginBottom: 0,
                    },
                  ]}
                  placeholder="일정 이름"
                  placeholderTextColor={colors.mutedForeground}
                  value={eventName}
                  onChangeText={setEventName}
                  autoFocus
                />
                <VoiceInput
                  color={colors.primary}
                  onResult={(text) =>
                    setEventName((prev) => (prev ? prev + " " + text : text))
                  }
                />
              </View>

              {/* 장소 */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <MapPin size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      borderColor: colors.border,
                      marginBottom: 0,
                    },
                  ]}
                  placeholder="장소 (선택)"
                  placeholderTextColor={colors.mutedForeground}
                  value={eventPlace}
                  onChangeText={setEventPlace}
                />
              </View>

              {/* 카테고리(학교일정 전용) */}
              {entryType === "school" && (
                <>
                  <Text style={[styles.label, { color: colors.foreground }]}>
                    카테고리
                  </Text>
                  <View style={styles.chipRow}>
                    {EVENT_CATEGORIES.map((c) => {
                      const active = eventCategory === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.chip,
                            { borderColor: colors.border },
                            active && {
                              backgroundColor: SCHOOL_COLOR,
                              borderColor: SCHOOL_COLOR,
                            },
                          ]}
                          onPress={() => setEventCategory(c)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: active ? "#fff" : colors.foreground },
                            ]}
                          >
                            {c}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* 날짜 선택 (모달 내 미니 달력 — 주 단위 행) */}
              <Text style={[styles.label, { color: colors.foreground }]}>날짜</Text>
              <View style={styles.calendarSection}>
                <View style={styles.miniHeader}>
                  <TouchableOpacity
                    onPress={() =>
                      setEventCalendarMonth(subMonths(eventCalendarMonth, 1))
                    }
                  >
                    <ChevronLeft size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text
                    style={[styles.miniMonthText, { color: colors.foreground }]}
                  >
                    {format(eventCalendarMonth, "yyyy년 M월", { locale: ko })}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setEventCalendarMonth(addMonths(eventCalendarMonth, 1))
                    }
                  >
                    <ChevronRight size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <View style={styles.weekHeaderRow}>
                  {WEEKDAYS.map((d, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.miniWeekday,
                        {
                          color:
                            i === 0
                              ? "#ef4444"
                              : i === 6
                                ? "#3b82f6"
                                : colors.mutedForeground,
                        },
                      ]}
                    >
                      {d}
                    </Text>
                  ))}
                </View>
                {monthWeeks(eventCalendarMonth).map((week, wi) => (
                  <View key={wi} style={styles.weekRow}>
                    {week.map((day) => {
                      const isSel = isSameDay(day, eventDate);
                      const isTd = isSameDay(day, new Date());
                      const inM = isSameMonth(day, eventCalendarMonth);
                      const dow = getDay(day);
                      return (
                        <TouchableOpacity
                          key={day.toISOString()}
                          style={styles.miniCell}
                          onPress={() => setEventDate(day)}
                        >
                          <View
                            style={[
                              styles.miniDayWrap,
                              isSel && { backgroundColor: colors.primary },
                              isTd &&
                                !isSel && {
                                  borderWidth: 1,
                                  borderColor: colors.primary,
                                },
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniDayText,
                                {
                                  color: isSel
                                    ? colors.primaryForeground
                                    : !inM
                                      ? colors.mutedForeground + "70"
                                      : dow === 0
                                        ? "#ef4444"
                                        : dow === 6
                                          ? "#3b82f6"
                                          : colors.foreground,
                                },
                              ]}
                            >
                              {format(day, "d")}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* 종일 토글(학교일정 전용) */}
              {entryType === "school" && (
                <TouchableOpacity
                  style={[
                    styles.notifyToggle,
                    {
                      borderColor: eventAllDay ? SCHOOL_COLOR : colors.border,
                      backgroundColor: eventAllDay
                        ? SCHOOL_COLOR + "15"
                        : colors.secondary,
                      marginTop: 4,
                    },
                  ]}
                  onPress={() => setEventAllDay(!eventAllDay)}
                >
                  <CalendarDays
                    size={16}
                    color={eventAllDay ? SCHOOL_COLOR : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.notifyText,
                      {
                        color: eventAllDay
                          ? SCHOOL_COLOR
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {eventAllDay ? "종일" : "시간 지정"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* 시간 휠 (종일이면 숨김) */}
              {!(entryType === "school" && eventAllDay) && (
                <>
              <Text style={[styles.label, { color: colors.foreground, marginTop: 12 }]}>
                시간
              </Text>
              <View style={styles.wheelRow}>
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => setEventIsAM(!eventIsAM)}
                    >
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.wheelValue,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                        {eventIsAM ? "오전" : "오후"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => setEventIsAM(!eventIsAM)}
                    >
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => {
                        setEditingHour(false);
                        setEventHour((prev) => (prev === 12 ? 1 : prev + 1));
                      }}
                    >
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.wheelValue,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                      onPress={() => {
                        setEditingHour(true);
                        setHourInput(String(eventHour));
                      }}
                    >
                      {editingHour ? (
                        <TextInput
                          style={[
                            styles.wheelValueText,
                            {
                              color: colors.primary,
                              padding: 0,
                              textAlign: "center",
                              minWidth: 30,
                            },
                          ]}
                          value={hourInput}
                          onChangeText={setHourInput}
                          keyboardType="number-pad"
                          maxLength={2}
                          autoFocus
                          selectTextOnFocus
                          onBlur={() => {
                            const v = parseInt(hourInput);
                            if (v >= 1 && v <= 12) setEventHour(v);
                            setEditingHour(false);
                          }}
                          onSubmitEditing={() => {
                            const v = parseInt(hourInput);
                            if (v >= 1 && v <= 12) setEventHour(v);
                            setEditingHour(false);
                          }}
                        />
                      ) : (
                        <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                          {eventHour}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => {
                        setEditingHour(false);
                        setEventHour((prev) => (prev === 1 ? 12 : prev - 1));
                      }}
                    >
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[styles.wheelColon, { color: colors.foreground }]}>:</Text>
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => {
                        setEditingMinute(false);
                        setEventMinute((prev) => (prev === 59 ? 0 : prev + 1));
                      }}
                    >
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.wheelValue,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                      onPress={() => {
                        setEditingMinute(true);
                        setMinuteInput(String(eventMinute).padStart(2, "0"));
                      }}
                    >
                      {editingMinute ? (
                        <TextInput
                          style={[
                            styles.wheelValueText,
                            {
                              color: colors.primary,
                              padding: 0,
                              textAlign: "center",
                              minWidth: 30,
                            },
                          ]}
                          value={minuteInput}
                          onChangeText={setMinuteInput}
                          keyboardType="number-pad"
                          maxLength={2}
                          autoFocus
                          selectTextOnFocus
                          onBlur={() => {
                            const v = parseInt(minuteInput);
                            if (v >= 0 && v <= 59) setEventMinute(v);
                            setEditingMinute(false);
                          }}
                          onSubmitEditing={() => {
                            const v = parseInt(minuteInput);
                            if (v >= 0 && v <= 59) setEventMinute(v);
                            setEditingMinute(false);
                          }}
                        />
                      ) : (
                        <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                          {String(eventMinute).padStart(2, "0")}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.wheelArrow}
                      onPress={() => {
                        setEditingMinute(false);
                        setEventMinute((prev) => (prev === 0 ? 59 : prev - 1));
                      }}
                    >
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 빠른 분 선택 */}
              <View style={styles.quickMinuteRow}>
                {[0, 5, 10, 15, 30, 45].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.quickMinuteBtn,
                      { borderColor: colors.border },
                      eventMinute === m && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setEventMinute(m)}
                  >
                    <Text
                      style={[
                        styles.quickMinuteText,
                        { color: eventMinute === m ? "#fff" : colors.foreground },
                      ]}
                    >
                      {String(m).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
                </>
              )}

              {/* 반복(학교일정 전용) */}
              {entryType === "school" && (
                <>
                  <Text
                    style={[
                      styles.label,
                      { color: colors.foreground, marginTop: 12 },
                    ]}
                  >
                    반복
                  </Text>
                  <View style={styles.chipRow}>
                    {RECURRENCE_OPTIONS.map((opt) => {
                      const active = eventRecurrence === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[
                            styles.chip,
                            { borderColor: colors.border },
                            active && {
                              backgroundColor: SCHOOL_COLOR,
                              borderColor: SCHOOL_COLOR,
                            },
                          ]}
                          onPress={() => setEventRecurrence(opt.value)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: active ? "#fff" : colors.foreground },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* 알림 토글(개인일정 전용) */}
              {entryType === "personal" && (
              <TouchableOpacity
                style={[
                  styles.notifyToggle,
                  {
                    backgroundColor: eventNotify
                      ? colors.primary + "15"
                      : colors.secondary,
                    borderColor: eventNotify ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setEventNotify(!eventNotify)}
              >
                {eventNotify ? (
                  <Bell size={16} color={colors.primary} />
                ) : (
                  <BellOff size={16} color={colors.mutedForeground} />
                )}
                <Text
                  style={[
                    styles.notifyText,
                    {
                      color: eventNotify ? colors.primary : colors.mutedForeground,
                    },
                  ]}
                >
                  {eventNotify ? "시간에 알림 받기" : "알림 없음"}
                </Text>
              </TouchableOpacity>
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {!editingSchedule && !editingEvent && (
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      flex: 1,
                      backgroundColor: isSubmitting
                        ? colors.mutedForeground
                        : colors.secondary,
                      borderWidth: 1,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={async () => {
                    await handleSubmit();
                    setTimeout(() => {
                      setEditingSchedule(null);
                      setEditingEvent(null);
                      setEventName("");
                      setEventPlace("");
                      setShowModal(true);
                    }, 200);
                  }}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.submitText, { color: colors.primary }]}>
                    추가 후 계속
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    flex: 1,
                    backgroundColor: isSubmitting
                      ? colors.mutedForeground
                      : colors.primary,
                  },
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                <Text style={styles.submitText}>
                  {isSubmitting
                    ? "저장 중..."
                    : editingSchedule || editingEvent
                      ? "수정"
                      : "추가"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 20,
  },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 18, fontWeight: "700", minWidth: 120, textAlign: "center" },
  weekHeaderRow: { flexDirection: "row", paddingHorizontal: 4 },
  weekHeaderText: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600" },
  grid: { paddingHorizontal: 4, paddingTop: 2 },
  weekRow: { flexDirection: "row" },
  cell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: 4 },
  dayNumWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNum: { fontSize: 14, fontWeight: "600" },
  dotRow: { flexDirection: "row", gap: 2, marginTop: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 0.5,
    marginTop: 4,
  },
  detailDate: { fontSize: 16, fontWeight: "700" },
  hintText: { fontSize: 10 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  list: { paddingHorizontal: 12, paddingTop: 6 },
  empty: { padding: 28, borderRadius: 10, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13 },
  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    gap: 10,
  },
  scheduleRight: { alignItems: "flex-end", gap: 4, minWidth: 60 },
  timeText: { fontSize: 12, fontWeight: "600" },
  scheduleCenter: { flex: 1 },
  scheduleName: { fontSize: 14, fontWeight: "600" },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  placeText: { fontSize: 11 },
  swipeDelete: { justifyContent: "center", alignItems: "center", width: 80, marginBottom: 6 },
  swipeDeleteBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  swipeDeleteText: { color: "#fff", fontSize: 11, fontWeight: "600", marginTop: 2 },
  swipeCopy: { justifyContent: "center", alignItems: "center", width: 80, marginBottom: 6 },
  swipeCopyBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  swipeCopyText: { color: "#fff", fontSize: 11, fontWeight: "600", marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  calendarSection: { marginBottom: 8 },
  miniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  miniMonthText: { fontSize: 15, fontWeight: "600" },
  miniWeekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "500" },
  miniCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  miniDayWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  miniDayText: { fontSize: 13, fontWeight: "500" },
  wheelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  wheelColumn: { alignItems: "center" },
  wheelBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    width: 72,
  },
  wheelArrow: { paddingVertical: 5, alignItems: "center", width: "100%" },
  wheelValue: { paddingVertical: 10, alignItems: "center", width: "100%" },
  wheelValueText: { fontSize: 20, fontWeight: "700" },
  wheelColon: { fontSize: 22, fontWeight: "700" },
  quickMinuteRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  quickMinuteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickMinuteText: { fontSize: 12, fontWeight: "500" },
  notifyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  notifyText: { fontSize: 14, fontWeight: "500" },
  typeToggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  typeToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  typeToggleText: { fontSize: 14, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "500" },
  catBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catBadgeText: { fontSize: 10, fontWeight: "700" },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
