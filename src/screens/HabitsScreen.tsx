import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Animated,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Plus,
  X,
  Check,
  Flame,
  Trash2,
  Pencil,
  Copy,
  List,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { format } from "date-fns";
import * as SecureStore from "expo-secure-store";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import { Habit, Routine, RoutineItem } from "../types";
import GoalBanner from "../components/GoalBanner";
import VoiceInput from "../components/VoiceInput";
import { Swipeable } from "react-native-gesture-handler";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];
const HABITS_CACHE_KEY = "cached_habits_v1";
const ROUTINES_CACHE_KEY = "cached_routines_v2";

type AddMode = "habit" | "routine";
type HabitEntry = Habit & { _listType: "habit" };
type RoutineEntry = Routine & { _listType: "routine" };
type ListEntry = HabitEntry | RoutineEntry;

export default function HabitsScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("habit");
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [newItems, setNewItems] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(HABITS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setHabits(parsed);
        }
      } catch {}
      try {
        const cached = await SecureStore.getItemAsync(ROUTINES_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setRoutines(parsed);
        }
      } catch {}
    };
    loadCached();
  }, []);

  const isScheduleRoutine = (r: Routine): boolean => {
    try {
      const meta = JSON.parse(r.description || "");
      return !!meta.date;
    } catch {
      return false;
    }
  };

  const fetchHabits = async () => {
    try {
      const data = await api.getHabits();
      const habitsWithDates = (data || []).map((habit: Habit) => ({
        ...habit,
        completedDates: habit.logs?.map((log) => log.date.split("T")[0]) || [],
      }));
      setHabits(habitsWithDates);
      SecureStore.setItemAsync(
        HABITS_CACHE_KEY,
        JSON.stringify(habitsWithDates),
      ).catch(() => {});
    } catch (error) {
      console.error("Habits fetch error:", error);
    }
  };

  const fetchRoutines = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      const actualRoutines = (data || []).filter(
        (r: Routine) => !isScheduleRoutine(r),
      );
      setRoutines(actualRoutines);
      SecureStore.setItemAsync(
        ROUTINES_CACHE_KEY,
        JSON.stringify(actualRoutines),
      ).catch(() => {});
    } catch {}
  };

  const fetchAll = async () => {
    await Promise.all([fetchHabits(), fetchRoutines()]);
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchAll();
      }
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const openAddModal = () => {
    setEditingHabit(null);
    setEditingRoutine(null);
    setNewName("");
    setSelectedColor(COLORS[0]);
    setAddMode("habit");
    setNewItems([""]);
    setShowModal(true);
  };

  const openEditHabitModal = (habit: Habit) => {
    setEditingHabit(habit);
    setEditingRoutine(null);
    setAddMode("habit");
    setNewName(habit.name);
    setSelectedColor(habit.color || COLORS[0]);
    setNewItems([""]);
    setShowModal(true);
  };

  const openEditRoutineModal = (routine: Routine) => {
    setEditingRoutine(routine);
    setEditingHabit(null);
    setAddMode("routine");
    setNewName(routine.name);
    setNewItems(routine.items?.map((item) => item.name) || [""]);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!newName.trim()) {
      Alert.alert(
        "오류",
        `${addMode === "habit" ? "습관" : "루틴"} 이름을 입력해주세요`,
      );
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    const name = newName.trim();

    if (addMode === "habit") {
      await submitHabit(name);
    } else {
      await submitRoutine(name);
    }
    setIsSubmitting(false);
  };

  const submitHabit = async (name: string) => {
    const isEditing = !!editingHabit;
    const editId = editingHabit?.id;

    setShowModal(false);
    let tempId = "";
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempHabit = {
        id: tempId,
        name,
        color: selectedColor,
        frequency: "DAILY",
        completedDates: [],
        currentStreak: 0,
        createdAt: new Date().toISOString(),
      } as any;
      setHabits((prev) => [tempHabit, ...prev]);
    } else {
      setHabits((prev) =>
        prev.map((h) =>
          h.id === editId ? { ...h, name, color: selectedColor } : h,
        ),
      );
    }

    try {
      if (isEditing && editId) {
        await api.updateHabit(editId, { name, color: selectedColor });
      } else {
        const created = (await api.createHabit({
          name,
          color: selectedColor,
          frequency: "DAILY",
        })) as any;
        if (created?.id && tempId) {
          setHabits((prev) =>
            prev.map((h) => (h.id === tempId ? { ...h, id: created.id } : h)),
          );
        }
      }
    } catch {
      try {
        await fetchHabits();
      } catch {}
    }
  };

  const submitRoutine = async (name: string) => {
    const isEditing = !!editingRoutine;
    const editId = editingRoutine?.id;
    const items = newItems
      .filter((item) => item.trim())
      .map((n) => ({ name: n }));

    setShowModal(false);
    let tempId = "";
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempRoutine = {
        id: tempId,
        name,
        type: "CUSTOM",
        items: items.length > 0 ? items : [],
        completedItemsToday: [],
        createdAt: new Date().toISOString(),
      } as any;
      setRoutines((prev) => [tempRoutine, ...prev]);
    } else {
      setRoutines((prev) =>
        prev.map((r) =>
          r.id === editId
            ? {
                ...r,
                name,
                items: items.length > 0 ? (items as any) : r.items,
              }
            : r,
        ),
      );
    }

    try {
      if (isEditing && editId) {
        await api.updateRoutine(editId, {
          name,
          type: "CUSTOM",
          items: items.length > 0 ? items : undefined,
        });
      } else {
        const created = (await api.createRoutine({
          name,
          type: "CUSTOM",
          items: items.length > 0 ? items : undefined,
        })) as any;
        if (created?.id && tempId) {
          setRoutines((prev) =>
            prev.map((r) => (r.id === tempId ? { ...r, id: created.id } : r)),
          );
        }
      }
    } catch {
      try {
        await fetchRoutines();
      } catch {}
    }
  };

  const handleCompleteHabit = async (habit: Habit) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const isCompletedToday = habit.completedDates?.includes(today);
    const prevHabits = [...habits];
    setHabits(
      habits.map((h) => {
        if (h.id !== habit.id) return h;
        const newDates = isCompletedToday
          ? (h.completedDates || []).filter((d) => d !== today)
          : [...(h.completedDates || []), today];
        return {
          ...h,
          completedDates: newDates,
          currentStreak: isCompletedToday
            ? Math.max(0, (h.currentStreak || 0) - 1)
            : (h.currentStreak || 0) + 1,
        };
      }),
    );
    try {
      if (isCompletedToday) {
        await api.uncompleteHabit(habit.id, today);
      } else {
        await api.completeHabit(habit.id, today);
      }
    } catch (error: any) {
      setHabits(prevHabits);
      Alert.alert("오류", error?.message || "습관 업데이트에 실패했습니다");
    }
  };

  const handleToggleRoutineItem = async (
    routineId: string,
    itemIndex: number,
  ) => {
    const prevRoutines = [...routines];
    setRoutines(
      routines.map((r) => {
        if (r.id !== routineId) return r;
        const completed = r.completedItemsToday || [];
        const newCompleted = completed.includes(itemIndex)
          ? completed.filter((i) => i !== itemIndex)
          : [...completed, itemIndex];
        return { ...r, completedItemsToday: newCompleted };
      }),
    );
    try {
      await api.toggleRoutineItem(routineId, itemIndex);
    } catch {
      setRoutines(prevRoutines);
      Alert.alert("오류", "업데이트에 실패했습니다");
    }
  };

  const handleDeleteHabit = (habit: Habit) => {
    Alert.alert("삭제", `"${habit.name}"을(를) 삭제하시겠습니까?`, [
      {
        text: "취소",
        style: "cancel",
        onPress: () => swipeableRefs.current.get(habit.id)?.close(),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const prev = [...habits];
          setHabits((h) => h.filter((x) => x.id !== habit.id));
          try {
            await api.deleteHabit(habit.id);
          } catch (error: any) {
            setHabits(prev);
            Alert.alert("오류", error?.message || "삭제에 실패했습니다");
          }
        },
      },
    ]);
  };

  const handleDeleteRoutine = (routine: Routine) => {
    Alert.alert("삭제", `"${routine.name}"을(를) 삭제하시겠습니까?`, [
      {
        text: "취소",
        style: "cancel",
        onPress: () => swipeableRefs.current.get(routine.id)?.close(),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const prev = [...routines];
          setRoutines((r) => r.filter((x) => x.id !== routine.id));
          try {
            await api.deleteRoutine(routine.id);
          } catch (error: any) {
            setRoutines(prev);
            Alert.alert("오류", error?.message || "삭제에 실패했습니다");
          }
        },
      },
    ]);
  };

  const renderLeftActions =
    (item: { id: string; name: string }) =>
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
              Clipboard.setStringAsync(item.name);
              swipeableRefs.current.get(item.id)?.close();
            }}
          >
            <Copy size={20} color="#fff" />
            <Text style={styles.swipeCopyText}>복사</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const renderRightActionsHabit =
    (habit: Habit) =>
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
            onPress={() => handleDeleteHabit(habit)}
          >
            <Trash2 size={20} color="#fff" />
            <Text style={styles.swipeDeleteText}>삭제</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const renderRightActionsRoutine =
    (routine: Routine) =>
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
            onPress={() => handleDeleteRoutine(routine)}
          >
            <Trash2 size={20} color="#fff" />
            <Text style={styles.swipeDeleteText}>삭제</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const today = format(new Date(), "yyyy-MM-dd");
  const completedCount = habits.filter((h) =>
    h.completedDates?.includes(today),
  ).length;

  // 오늘 완료한 습관은 맨 아래로
  const sortedHabits = [...habits].sort((a, b) => {
    const aDone = a.completedDates?.includes(today) ? 1 : 0;
    const bDone = b.completedDates?.includes(today) ? 1 : 0;
    return aDone - bDone;
  });

  // 습관 + 루틴 합친 리스트
  const combinedList: ListEntry[] = [
    ...sortedHabits.map((h) => ({ ...h, _listType: "habit" as const })),
    ...routines.map((r) => ({ ...r, _listType: "routine" as const })),
  ];

  const addItemField = () => setNewItems([...newItems, ""]);
  const updateItemField = (index: number, value: string) => {
    const u = [...newItems];
    u[index] = value;
    setNewItems(u);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={[]}
    >
      <GoalBanner />
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>습관</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            오늘 {completedCount}/{habits.length} 완료
            {routines.length > 0 ? ` · 루틴 ${routines.length}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={openAddModal}
        >
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <DraggableFlatList
          data={combinedList}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onDragEnd={({ data }: { data: ListEntry[] }) => {
            setHabits(
              data
                .filter((i) => i._listType === "habit")
                .map(({ _listType, ...rest }) => rest as Habit),
            );
            setRoutines(
              data
                .filter((i) => i._listType === "routine")
                .map(({ _listType, ...rest }) => rest as Routine),
            );
          }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                습관이나 루틴을 추가해보세요
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
          ListHeaderComponent={
            combinedList.length > 0 ? (
              <Text
                style={[styles.hintText, { color: colors.mutedForeground }]}
              >
                → 복사 | ← 삭제 | 꾹 드래그
              </Text>
            ) : null
          }
          renderItem={({
            item,
            drag,
            isActive,
          }: RenderItemParams<ListEntry>) => {
            if (item._listType === "routine") {
              const routine = item as RoutineEntry;
              const completedItems = routine.completedItemsToday || [];
              const totalItems = routine.items?.length || 0;
              const progress =
                totalItems > 0 ? completedItems.length / totalItems : 0;
              return (
                <ScaleDecorator>
                  <Swipeable
                    ref={(ref) => {
                      if (ref) swipeableRefs.current.set(routine.id, ref);
                    }}
                    renderLeftActions={renderLeftActions(routine)}
                    renderRightActions={renderRightActionsRoutine(routine)}
                    overshootLeft={false}
                    overshootRight={false}
                    leftThreshold={40}
                    rightThreshold={40}
                    friction={2}
                  >
                    <View
                      style={[
                        styles.routineCard,
                        {
                          backgroundColor: colors.card,
                          padding: cardPadding,
                          opacity: isActive ? 0.8 : 1,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.routineHeader}
                        onLongPress={drag}
                        onPress={() => openEditRoutineModal(routine)}
                      >
                        <List size={14} color={colors.primary} />
                        <View style={styles.routineInfo}>
                          <Text
                            style={[
                              styles.routineName,
                              {
                                color: colors.foreground,
                                fontSize: scaledFont(14),
                                textAlign,
                              },
                            ]}
                          >
                            {routine.name}
                          </Text>
                          <Text
                            style={[
                              styles.routineMeta,
                              {
                                color: colors.mutedForeground,
                                fontSize: scaledFont(11),
                              },
                            ]}
                          >
                            {completedItems.length}/{totalItems} 완료
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {totalItems > 0 && (
                        <View
                          style={[
                            styles.progressBg,
                            { backgroundColor: colors.secondary },
                          ]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                backgroundColor: colors.primary,
                                width: `${progress * 100}%` as any,
                              },
                            ]}
                          />
                        </View>
                      )}

                      {routine.items &&
                        routine.items.length > 0 &&
                        routine.items.map(
                          (rItem: RoutineItem, index: number) => {
                            const isCompleted = completedItems.includes(index);
                            return (
                              <TouchableOpacity
                                key={rItem.id || `item-${index}`}
                                activeOpacity={0.7}
                                style={[
                                  styles.routineItemRow,
                                  {
                                    borderBottomWidth:
                                      index < routine.items!.length - 1
                                        ? 0.5
                                        : 0,
                                    borderBottomColor: colors.border,
                                  },
                                ]}
                                onPress={() =>
                                  handleToggleRoutineItem(routine.id, index)
                                }
                              >
                                <View
                                  style={[
                                    styles.routineItemCheck,
                                    {
                                      backgroundColor: isCompleted
                                        ? "#22c55e"
                                        : "transparent",
                                      borderColor: isCompleted
                                        ? "#22c55e"
                                        : colors.border,
                                    },
                                  ]}
                                >
                                  {isCompleted && (
                                    <Check size={10} color="#fff" />
                                  )}
                                </View>
                                <Text
                                  style={[
                                    styles.routineItemName,
                                    {
                                      color: isCompleted
                                        ? colors.mutedForeground
                                        : colors.foreground,
                                      textDecorationLine: isCompleted
                                        ? "line-through"
                                        : "none",
                                      fontSize: scaledFont(13),
                                    },
                                  ]}
                                >
                                  {rItem.name}
                                </Text>
                                {rItem.duration && (
                                  <Text
                                    style={{
                                      color: colors.mutedForeground,
                                      fontSize: scaledFont(11),
                                    }}
                                  >
                                    {rItem.duration}분
                                  </Text>
                                )}
                              </TouchableOpacity>
                            );
                          },
                        )}
                    </View>
                  </Swipeable>
                </ScaleDecorator>
              );
            }

            // 습관 렌더링
            const habit = item as HabitEntry;
            const isDone = habit.completedDates?.includes(today);
            return (
              <ScaleDecorator>
                <Swipeable
                  ref={(ref) => {
                    if (ref) swipeableRefs.current.set(habit.id, ref);
                  }}
                  renderLeftActions={renderLeftActions(habit)}
                  renderRightActions={renderRightActionsHabit(habit)}
                  overshootLeft={false}
                  overshootRight={false}
                  leftThreshold={40}
                  rightThreshold={40}
                  friction={2}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[
                      styles.habitItem,
                      {
                        backgroundColor: colors.card,
                        borderLeftColor: habit.color || "#6366f1",
                        borderLeftWidth: 3,
                        paddingVertical: cardPadding,
                        paddingHorizontal: cardPadding,
                        opacity: isActive ? 0.8 : 1,
                      },
                    ]}
                    onPress={() => handleCompleteHabit(habit)}
                    onLongPress={drag}
                    disabled={isActive}
                  >
                    <Text
                      style={[
                        styles.habitName,
                        {
                          color: isDone
                            ? colors.mutedForeground
                            : colors.foreground,
                          textDecorationLine: isDone ? "line-through" : "none",
                          fontSize: scaledFont(14),
                          flex: 1,
                          textAlign,
                        },
                      ]}
                    >
                      {habit.name}
                    </Text>
                    <View style={styles.streakRow}>
                      <Flame size={11} color="#f97316" />
                      <Text
                        style={[
                          styles.streakText,
                          {
                            color: colors.mutedForeground,
                            fontSize: scaledFont(11),
                          },
                        ]}
                      >
                        {habit.currentStreak || 0}일째
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openEditHabitModal(habit)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Pencil size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.checkCircle,
                        {
                          backgroundColor: isDone ? "#22c55e" : "transparent",
                          borderColor: isDone ? "#22c55e" : colors.border,
                        },
                      ]}
                    >
                      {isDone && <Check size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              </ScaleDecorator>
            );
          }}
        />
      </View>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.card, maxHeight: "85%" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingHabit
                  ? "습관 수정"
                  : editingRoutine
                    ? "루틴 수정"
                    : addMode === "habit"
                      ? "새 습관"
                      : "새 루틴"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* 타입 선택 (새로 추가할 때만) */}
            {!editingHabit && !editingRoutine && (
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    { borderColor: colors.border },
                    addMode === "habit" && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setAddMode("habit")}
                >
                  <Flame
                    size={14}
                    color={addMode === "habit" ? "#fff" : colors.foreground}
                  />
                  <Text
                    style={[
                      styles.typeBtnText,
                      {
                        color: addMode === "habit" ? "#fff" : colors.foreground,
                      },
                    ]}
                  >
                    습관
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    { borderColor: colors.border },
                    addMode === "routine" && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setAddMode("routine")}
                >
                  <List
                    size={14}
                    color={addMode === "routine" ? "#fff" : colors.foreground}
                  />
                  <Text
                    style={[
                      styles.typeBtnText,
                      {
                        color:
                          addMode === "routine" ? "#fff" : colors.foreground,
                      },
                    ]}
                  >
                    루틴
                  </Text>
                </TouchableOpacity>
              </View>
            )}

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
                    minHeight: 40,
                    maxHeight: 100,
                    textAlignVertical: "center",
                  },
                ]}
                placeholder={addMode === "habit" ? "습관 이름" : "루틴 이름"}
                placeholderTextColor={colors.mutedForeground}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                multiline
                blurOnSubmit={false}
              />
              <VoiceInput
                color={colors.primary}
                onResult={(text) =>
                  setNewName((prev) => (prev ? prev + " " + text : text))
                }
              />
            </View>

            {/* 습관: 색상 선택 */}
            {addMode === "habit" && (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  색상
                </Text>
                <View style={styles.colorRow}>
                  {COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        {
                          backgroundColor: color,
                          borderWidth: selectedColor === color ? 2 : 0,
                          borderColor: "#fff",
                        },
                      ]}
                      onPress={() => setSelectedColor(color)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* 루틴: 항목 목록 */}
            {addMode === "routine" && (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  항목
                </Text>
                <ScrollView
                  style={{ maxHeight: 150 }}
                  showsVerticalScrollIndicator={false}
                >
                  {newItems.map((item, index) => (
                    <TextInput
                      key={index}
                      style={[
                        styles.routineItemInput,
                        {
                          backgroundColor: colors.background,
                          color: colors.foreground,
                          borderColor: colors.border,
                        },
                      ]}
                      placeholder={`항목 ${index + 1}`}
                      placeholderTextColor={colors.mutedForeground}
                      value={item}
                      onChangeText={(v) => updateItemField(index, v)}
                    />
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.addItemBtn, { borderColor: colors.border }]}
                  onPress={addItemField}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={[styles.addItemText, { color: colors.primary }]}>
                    항목 추가
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
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
                  : editingHabit || editingRoutine
                    ? "수정"
                    : "추가"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  empty: { padding: 24, borderRadius: 10, alignItems: "center" },
  emptyText: { fontSize: 13 },
  // 습관 아이템
  habitItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
  },
  habitName: { fontSize: 14, fontWeight: "500" },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginRight: 8,
  },
  streakText: { fontSize: 11 },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  // 루틴 카드
  routineCard: {
    borderRadius: 10,
    marginBottom: 4,
    borderLeftColor: "#6366f1",
    borderLeftWidth: 3,
  },
  routineHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  routineInfo: { flex: 1 },
  routineName: { fontSize: 14, fontWeight: "600" },
  routineMeta: { fontSize: 11, marginTop: 2 },
  progressBg: { height: 4, borderRadius: 2, marginBottom: 8 },
  progressFill: { height: "100%", borderRadius: 2 },
  routineItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  routineItemCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  routineItemName: { flex: 1, fontSize: 13 },
  // 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "600" },
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBtnText: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  colorOption: { width: 30, height: 30, borderRadius: 15 },
  routineItemInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 6,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    marginBottom: 12,
    gap: 4,
  },
  addItemText: { fontSize: 13, fontWeight: "500" },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  hintText: {
    fontSize: 10,
    textAlign: "right",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  swipeDelete: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: 4,
  },
  swipeDeleteBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  swipeDeleteText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  swipeCopy: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: 4,
  },
  swipeCopyBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
  },
  swipeCopyText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
