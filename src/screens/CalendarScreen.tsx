import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Trash2,
  Clock,
} from "lucide-react-native";
import {
  format,
  parseISO,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import type { CalendarEvent, Task } from "../types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TASK_DOT = "#2563EB"; // 할일 = 파랑 (SchoolDesk 컨벤션)

export default function CalendarScreen() {
  const { colors } = useTheme();
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  // 추가 모달
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState(""); // "HH:MM" 비우면 종일
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evs, tks] = await Promise.all([
        api.getEventsByMonth(
          viewMonth.getFullYear(),
          viewMonth.getMonth() + 1,
        ),
        api.getTasks(),
      ]);
      setEvents(Array.isArray(evs) ? evs : []);
      setTasks(Array.isArray(tks) ? tks : []);
    } catch {
      // 네트워크 실패 시 조용히 — 기존 데이터 유지
    } finally {
      setLoading(false);
    }
  }, [viewMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 달력 그리드(주 시작=일요일)
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const eventsForDay = useCallback(
    (day: Date): CalendarEvent[] =>
      events.filter((e) => {
        try {
          const s = parseISO(e.startAt);
          const en = e.endAt ? parseISO(e.endAt) : s;
          return s <= endOfDay(day) && en >= startOfDay(day);
        } catch {
          return false;
        }
      }),
    [events],
  );

  const tasksForDay = useCallback(
    (day: Date): Task[] =>
      tasks.filter((t) => {
        if (!t.dueDate) return false;
        try {
          return isSameDay(parseISO(t.dueDate), day);
        } catch {
          return false;
        }
      }),
    [tasks],
  );

  const selectedEvents = eventsForDay(selectedDate);
  const selectedTasks = tasksForDay(selectedDate);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(newTime.trim());
      let startAt: Date;
      let endAt: Date;
      let isAllDay = true;
      if (timeMatch) {
        const h = Math.min(23, parseInt(timeMatch[1], 10));
        const m = Math.min(59, parseInt(timeMatch[2], 10));
        startAt = new Date(selectedDate);
        startAt.setHours(h, m, 0, 0);
        endAt = new Date(startAt.getTime() + 60 * 60 * 1000); // 1시간 기본
        isAllDay = false;
      } else {
        startAt = startOfDay(selectedDate);
        endAt = endOfDay(selectedDate);
      }
      await api.createEvent({
        title,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        isAllDay,
        color: colors.primary,
      });
      setNewTitle("");
      setNewTime("");
      setAdding(false);
      await load();
    } catch {
      Alert.alert("저장 실패", "일정을 저장하지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = (ev: CalendarEvent) => {
    Alert.alert("일정 삭제", `"${ev.title}" 을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteEvent(ev.id);
            await load();
          } catch {
            Alert.alert("삭제 실패", "다시 시도해주세요.");
          }
        },
      },
    ]);
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* 헤더: 월 이동 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setViewMonth(subMonths(viewMonth, 1))}
          style={styles.navBtn}
          hitSlop={10}
        >
          <ChevronLeft size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.cardForeground }]}>
          {format(viewMonth, "yyyy년 M월", { locale: ko })}
        </Text>
        <TouchableOpacity
          onPress={() => setViewMonth(addMonths(viewMonth, 1))}
          style={styles.navBtn}
          hitSlop={10}
        >
          <ChevronRight size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        {loading && (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ marginLeft: 8 }}
          />
        )}
      </View>

      {/* 요일 헤더 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[
              styles.weekday,
              {
                color:
                  i === 0
                    ? "#EF4444"
                    : i === 6
                      ? "#3B82F6"
                      : colors.mutedForeground,
              },
            ]}
          >
            {w}
          </Text>
        ))}
      </View>

      {/* 날짜 그리드 */}
      <View style={styles.grid}>
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const selected = isSameDay(day, selectedDate);
          const dayEvents = eventsForDay(day);
          const dayTasks = tasksForDay(day);
          const dow = day.getDay();
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={styles.cell}
              onPress={() => setSelectedDate(startOfDay(day))}
              activeOpacity={0.6}
            >
              <View
                style={[
                  styles.dayNumWrap,
                  selected && { backgroundColor: colors.primary },
                  !selected && isToday(day) && {
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
                            ? "#EF4444"
                            : dow === 6
                              ? "#3B82F6"
                              : colors.cardForeground,
                    },
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
              {/* 점 표시 */}
              <View style={styles.dotRow}>
                {dayEvents.slice(0, 3).map((e) => (
                  <View
                    key={e.id}
                    style={[styles.dot, { backgroundColor: e.color || colors.primary }]}
                  />
                ))}
                {dayTasks.length > 0 && (
                  <View style={[styles.dot, { backgroundColor: TASK_DOT }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 선택일 상세 */}
      <View style={styles.detailHeader}>
        <Text style={[styles.detailDate, { color: colors.cardForeground }]}>
          {format(selectedDate, "M월 d일 (E)", { locale: ko })}
        </Text>
        <TouchableOpacity
          onPress={() => setAdding(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          hitSlop={8}
        >
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>
            일정
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.detailList} contentContainerStyle={{ paddingBottom: 24 }}>
        {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            이 날 일정이 없습니다
          </Text>
        ) : (
          <>
            {selectedEvents.map((e) => (
              <View
                key={e.id}
                style={[
                  styles.item,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[styles.itemBar, { backgroundColor: e.color || colors.primary }]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.cardForeground }]}>
                    {e.title}
                  </Text>
                  <View style={styles.itemMetaRow}>
                    <Clock size={12} color={colors.mutedForeground} />
                    <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                      {e.isAllDay
                        ? "종일"
                        : `${format(parseISO(e.startAt), "a h:mm", { locale: ko })}`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDeleteEvent(e)} hitSlop={8}>
                  <Trash2 size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
            {selectedTasks.map((t) => (
              <View
                key={t.id}
                style={[
                  styles.item,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.itemBar, { backgroundColor: TASK_DOT }]} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.itemTitle,
                      {
                        color: colors.cardForeground,
                        textDecorationLine: t.isCompleted ? "line-through" : "none",
                        opacity: t.isCompleted ? 0.5 : 1,
                      },
                    ]}
                  >
                    {t.title}
                  </Text>
                  <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                    할일
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* 일정 추가 모달 */}
      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.cardForeground }]}>
                {format(selectedDate, "M월 d일", { locale: ko })} 일정 추가
              </Text>
              <TouchableOpacity onPress={() => setAdding(false)} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="일정 제목"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              style={[
                styles.input,
                { color: colors.cardForeground, borderColor: colors.border },
              ]}
            />
            <TextInput
              value={newTime}
              onChangeText={setNewTime}
              placeholder="시간 (예: 14:30) — 비우면 종일"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.input,
                { color: colors.cardForeground, borderColor: colors.border },
              ]}
            />
            <TouchableOpacity
              onPress={handleAdd}
              disabled={saving || !newTitle.trim()}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: saving || !newTitle.trim() ? 0.5 : 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                  저장
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 18, fontWeight: "700", minWidth: 120, textAlign: "center" },
  weekRow: { flexDirection: "row", paddingHorizontal: 4, marginBottom: 2 },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 4 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
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
  },
  detailDate: { fontSize: 16, fontWeight: "700" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 13, fontWeight: "700" },
  detailList: { flex: 1, paddingHorizontal: 12 },
  empty: { textAlign: "center", paddingVertical: 24, fontSize: 14 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  itemTitle: { fontSize: 15, fontWeight: "600" },
  itemMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  itemMeta: { fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: { borderRadius: 16, padding: 20 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  saveBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700" },
});
