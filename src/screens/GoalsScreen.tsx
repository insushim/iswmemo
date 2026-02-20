import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
import { Plus, Target, X, Pin, Trash2, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import { Goal, GoalType } from "../types";
import { useGoalStore } from "../store/goals";
import GoalBanner from "../components/GoalBanner";
import VoiceInput from "../components/VoiceInput";
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
const TYPE_DEFAULT_COLOR: Partial<Record<GoalType, string>> = {
  SHORT: "#6366f1",
  LONG: "#f59e0b",
  LIFE: "#ef4444",
};
const GOALS_CACHE_KEY = "cached_goals_v1";

export default function GoalsScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const { pinnedGoals, togglePinGoal, removePinGoal } = useGoalStore();
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalType, setNewGoalType] = useState<GoalType>("SHORT");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [filter, setFilter] = useState<"all" | GoalType>("all");
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(GOALS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setGoals(parsed);
          }
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchGoals = async () => {
    try {
      const data = await api.getGoals();
      setGoals(data || []);
      SecureStore.setItemAsync(
        GOALS_CACHE_KEY,
        JSON.stringify(data || []),
      ).catch(() => {});
    } catch (error) {
      console.error("Goals fetch error:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchGoals();
      }
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals();
    setRefreshing(false);
  };

  const openAddModal = () => {
    setEditingGoal(null);
    setNewGoalTitle("");
    setNewGoalType("SHORT");
    setSelectedColor(TYPE_DEFAULT_COLOR["SHORT"] || COLORS[0]);
    setShowModal(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setNewGoalTitle(goal.title);
    setNewGoalType(goal.type);
    setSelectedColor(goal.color || COLORS[0]);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!newGoalTitle.trim()) {
      Alert.alert("오류", "목표 제목을 입력해주세요");
      return;
    }
    const isEditing = !!editingGoal;
    const editId = editingGoal?.id;
    const title = newGoalTitle.trim();

    // 즉시 UI 업데이트 (Optimistic Update)
    setShowModal(false);
    let tempId = "";
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempGoal = {
        id: tempId,
        title,
        type: newGoalType,
        color: selectedColor,
        status: "IN_PROGRESS",
        createdAt: new Date().toISOString(),
      } as any;
      setGoals((prev) => [tempGoal, ...prev]);
    } else {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editId
            ? { ...g, title, type: newGoalType, color: selectedColor }
            : g,
        ),
      );
    }

    try {
      if (isEditing && editId) {
        await api.updateGoal(editId, {
          title,
          type: newGoalType,
          color: selectedColor,
        });
      } else {
        const created = (await api.createGoal({
          title,
          type: newGoalType,
          color: selectedColor,
          status: "IN_PROGRESS",
        })) as any;
        if (created?.id && tempId) {
          setGoals((prev) =>
            prev.map((g) => (g.id === tempId ? { ...g, id: created.id } : g)),
          );
        }
      }
    } catch (error) {
      // 서버에 생성됐을 수 있으므로, 다시 불러와서 동기화
      try {
        await fetchGoals();
      } catch {}
    }
  };

  const handleDeleteGoal = (goal: Goal) => {
    Alert.alert("삭제", `"${goal.title}" 삭제할까요?`, [
      {
        text: "취소",
        style: "cancel",
        onPress: () => {
          swipeableRefs.current.get(goal.id)?.close();
        },
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            removePinGoal(goal.id);
            setGoals((prev) => prev.filter((g) => g.id !== goal.id));
            await api.deleteGoal(goal.id);
          } catch (error) {
            Alert.alert("오류", "삭제에 실패했습니다");
            fetchGoals();
          }
        },
      },
    ]);
  };

  const renderLeftActions =
    (goal: Goal) =>
    (
      progress: Animated.AnimatedInterpolation<number>,
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
              Clipboard.setStringAsync(goal.title);
              swipeableRefs.current.get(goal.id)?.close();
            }}
          >
            <Copy size={20} color="#fff" />
            <Text style={styles.swipeCopyText}>복사</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const renderRightActions =
    (goal: Goal) =>
    (
      progress: Animated.AnimatedInterpolation<number>,
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
            onPress={() => handleDeleteGoal(goal)}
          >
            <Trash2 size={20} color="#fff" />
            <Text style={styles.swipeDeleteText}>삭제</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

  const handlePinGoal = (goal: Goal) => {
    togglePinGoal(goal);
  };

  const filteredGoals = goals.filter(
    (g) => filter === "all" || g.type === filter,
  );
  const typeLabels: Partial<Record<GoalType, string>> = {
    LIFE: "인생",
    LONG: "장기",
    SHORT: "단기",
    DECADE: "10년",
    FIVE_YEAR: "5년",
    YEARLY: "연간",
    QUARTERLY: "분기",
    MONTHLY: "월간",
    WEEKLY: "주간",
    DAILY: "일간",
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <GoalBanner />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>목표</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={openAddModal}
        >
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(["all", "LIFE", "LONG", "SHORT"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              { backgroundColor: filter === f ? colors.primary : colors.card },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? "#fff" : colors.foreground },
              ]}
            >
              {f === "all" ? "전체" : typeLabels[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <DraggableFlatList
        data={filteredGoals}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }: { data: Goal[] }) => setGoals(data)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          filteredGoals.length > 0 ? (
            <View style={styles.hintRow}>
              <Text
                style={[styles.hintText, { color: colors.mutedForeground }]}
              >
                → 복사 | ← 삭제 | 꾹 드래그
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Target size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              목표를 추가해보세요
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 20 }} />}
        renderItem={({
          item: goal,
          drag,
          isActive,
        }: RenderItemParams<Goal>) => {
          const isPinned = pinnedGoals.some((g) => g.id === goal.id);
          return (
            <ScaleDecorator>
              <Swipeable
                ref={(ref) => {
                  if (ref) swipeableRefs.current.set(goal.id, ref);
                }}
                renderLeftActions={renderLeftActions(goal)}
                renderRightActions={renderRightActions(goal)}
                overshootLeft={false}
                overshootRight={false}
                leftThreshold={15}
                rightThreshold={15}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[
                    styles.goalItem,
                    {
                      backgroundColor: colors.card,
                      borderWidth: isPinned ? 1.5 : 0,
                      borderColor: isPinned ? colors.primary : "transparent",
                      padding: cardPadding,
                      opacity: isActive ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => openEditModal(goal)}
                  onLongPress={drag}
                  disabled={isActive}
                >
                  <View style={styles.goalTop}>
                    <Text
                      style={[
                        styles.badge,
                        {
                          color: goal.color,
                          backgroundColor: (goal.color || "#6366f1") + "15",
                        },
                      ]}
                    >
                      {typeLabels[goal.type] || goal.type}
                    </Text>
                    <Text
                      style={[
                        styles.goalTitle,
                        {
                          color: colors.foreground,
                          fontSize: scaledFont(14),
                          flex: 1,
                          textAlign,
                        },
                      ]}
                    >
                      {goal.title}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.pinBtn,
                        {
                          backgroundColor: isPinned
                            ? colors.primary + "20"
                            : "transparent",
                        },
                      ]}
                      onPress={() => handlePinGoal(goal)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Pin
                        size={14}
                        color={
                          isPinned ? colors.primary : colors.mutedForeground
                        }
                        fill={isPinned ? colors.primary : "none"}
                      />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Swipeable>
            </ScaleDecorator>
          );
        }}
      />

      {/* 추가/수정 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingGoal ? "목표 수정" : "새 목표"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

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
                placeholder="목표를 입력하세요"
                placeholderTextColor={colors.mutedForeground}
                value={newGoalTitle}
                onChangeText={setNewGoalTitle}
                autoFocus
                multiline
                blurOnSubmit={false}
              />
              <VoiceInput
                color={colors.primary}
                onResult={(text) =>
                  setNewGoalTitle((prev) => (prev ? prev + " " + text : text))
                }
              />
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>
              유형
            </Text>
            <View style={styles.typeRow}>
              {(["LIFE", "LONG", "SHORT"] as GoalType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor:
                        newGoalType === type
                          ? colors.primary
                          : colors.background,
                    },
                  ]}
                  onPress={() => {
                    setNewGoalType(type);
                    setSelectedColor(TYPE_DEFAULT_COLOR[type] || COLORS[0]);
                  }}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      {
                        color:
                          newGoalType === type ? "#fff" : colors.foreground,
                      },
                    ]}
                  >
                    {typeLabels[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>
              색상
            </Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: c,
                      borderWidth: selectedColor === c ? 2 : 0,
                      borderColor: "#fff",
                    },
                  ]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitText}>
                {editingGoal ? "수정" : "추가"}
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 8,
  },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  filterText: { fontSize: 12, fontWeight: "500" },
  list: { paddingHorizontal: 12, paddingTop: 4 },
  empty: { padding: 32, borderRadius: 10, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13 },
  goalItem: { padding: 12, borderRadius: 10, marginBottom: 6 },
  goalTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalTitle: { fontSize: 14, fontWeight: "600" },
  badge: {
    fontSize: 10,
    fontWeight: "500",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  pinBtn: { padding: 6, borderRadius: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
  typeRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  typeBtnText: { fontSize: 13, fontWeight: "500" },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  colorOption: { width: 30, height: 30, borderRadius: 15 },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  hintRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  hintText: { fontSize: 10 },
  swipeDelete: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: 6,
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
    marginBottom: 6,
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
