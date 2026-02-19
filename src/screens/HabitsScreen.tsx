import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, X, Check, Flame, Trash2, Pencil, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Habit } from '../types';
import GoalBanner from '../components/GoalBanner';
import VoiceInput from '../components/VoiceInput';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const HABITS_CACHE_KEY = 'cached_habits_v1';

export default function HabitsScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
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
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHabits(parsed);
          }
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchHabits = async () => {
    try {
      const data = await api.getHabits();
      const habitsWithDates = (data || []).map((habit: Habit) => ({
        ...habit,
        completedDates: habit.logs?.map((log) => log.date.split('T')[0]) || [],
      }));
      setHabits(habitsWithDates);
      SecureStore.setItemAsync(HABITS_CACHE_KEY, JSON.stringify(habitsWithDates)).catch(() => {});
    } catch (error) {
      console.error('Habits fetch error:', error);
    }
  };

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchHabits(); } }, []));

  const onRefresh = async () => { setRefreshing(true); await fetchHabits(); setRefreshing(false); };

  const openAddModal = () => {
    setEditingHabit(null);
    setNewHabitName('');
    setSelectedColor(COLORS[0]);
    setShowModal(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setNewHabitName(habit.name);
    setSelectedColor(habit.color || COLORS[0]);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!newHabitName.trim()) { Alert.alert('오류', '습관 이름을 입력해주세요'); return; }
    if (isSubmitting) return;
    setIsSubmitting(true);
    const isEditing = !!editingHabit;
    const editId = editingHabit?.id;
    const name = newHabitName.trim();

    // 즉시 UI 업데이트 (Optimistic Update)
    setShowModal(false);
    let tempId = '';
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempHabit = { id: tempId, name, color: selectedColor, frequency: 'DAILY', completedDates: [], currentStreak: 0, createdAt: new Date().toISOString() } as any;
      setHabits(prev => [tempHabit, ...prev]);
    } else {
      setHabits(prev => prev.map(h => h.id === editId ? { ...h, name, color: selectedColor } : h));
    }

    try {
      if (isEditing && editId) {
        await api.updateHabit(editId, { name, color: selectedColor });
      } else {
        const created = await api.createHabit({ name, color: selectedColor, frequency: 'DAILY' }) as any;
        if (created?.id && tempId) {
          setHabits(prev => prev.map(h => h.id === tempId ? { ...h, id: created.id } : h));
        }
      }
    } catch (error: any) {
      // 서버에 생성됐을 수 있으므로, 다시 불러와서 동기화
      try { await fetchHabits(); } catch {}
    } finally { setIsSubmitting(false); }
  };

  const renderLeftActions = (habit: Habit) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeCopyBtn} onPress={() => {
          Clipboard.setStringAsync(habit.name);
          swipeableRefs.current.get(habit.id)?.close();
        }}>
          <Copy size={20} color="#fff" />
          <Text style={styles.swipeCopyText}>복사</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (habit: Habit) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => {
          Alert.alert('삭제', `"${habit.name}"을(를) 삭제하시겠습니까?`, [
            { text: '취소', style: 'cancel', onPress: () => swipeableRefs.current.get(habit.id)?.close() },
            { text: '삭제', style: 'destructive', onPress: async () => {
              const prev = [...habits];
              setHabits(h => h.filter(x => x.id !== habit.id));
              try { await api.deleteHabit(habit.id); }
              catch (error: any) { setHabits(prev); Alert.alert('오류', error?.message || '삭제에 실패했습니다'); }
            }},
          ]);
        }}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const handleCompleteHabit = async (habit: Habit) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const isCompletedToday = habit.completedDates?.includes(today);
    // 즉시 UI 업데이트 (Optimistic Update)
    const prevHabits = [...habits];
    setHabits(habits.map(h => {
      if (h.id !== habit.id) return h;
      const newDates = isCompletedToday
        ? (h.completedDates || []).filter(d => d !== today)
        : [...(h.completedDates || []), today];
      return { ...h, completedDates: newDates, currentStreak: isCompletedToday ? Math.max(0, (h.currentStreak || 0) - 1) : (h.currentStreak || 0) + 1 };
    }));
    try {
      if (isCompletedToday) { await api.uncompleteHabit(habit.id, today); }
      else { await api.completeHabit(habit.id, today); }
    } catch (error: any) {
      setHabits(prevHabits); // 실패 시 원복
      Alert.alert('오류', error?.message || '습관 업데이트에 실패했습니다');
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const completedCount = habits.filter((h) => h.completedDates?.includes(today)).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <GoalBanner />
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>습관</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            오늘 {completedCount}/{habits.length} 완료
          </Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={habits}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onDragEnd={({ data }: { data: Habit[] }) => setHabits(data)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>습관을 추가해보세요</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 20 }} />}
        ListHeaderComponent={
          habits.length > 0 ? <Text style={[styles.hintText, { color: colors.mutedForeground }]}>→ 복사 | ← 삭제 | 꾹 드래그</Text> : null
        }
        renderItem={({ item: habit, drag, isActive }: RenderItemParams<Habit>) => {
          const isDone = habit.completedDates?.includes(today);
          return (
            <ScaleDecorator>
              <Swipeable
                ref={(ref) => { if (ref) swipeableRefs.current.set(habit.id, ref); }}
                renderLeftActions={renderLeftActions(habit)}
                renderRightActions={renderRightActions(habit)}
                overshootLeft={false}
                overshootRight={false}
                leftThreshold={40}
                rightThreshold={40}
                friction={2}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[styles.habitItem, { backgroundColor: colors.card, borderLeftColor: habit.color || '#6366f1', borderLeftWidth: 3, paddingVertical: cardPadding, paddingHorizontal: cardPadding, opacity: isActive ? 0.8 : 1 }]}
                  onPress={() => handleCompleteHabit(habit)}
                  onLongPress={drag}
                  disabled={isActive}
                >
                  <Text style={[styles.habitName, { color: isDone ? colors.mutedForeground : colors.foreground, textDecorationLine: isDone ? 'line-through' : 'none', fontSize: scaledFont(14), flex: 1, textAlign }]}>{habit.name}</Text>
                  <View style={styles.streakRow}>
                    <Flame size={11} color="#f97316" />
                    <Text style={[styles.streakText, { color: colors.mutedForeground, fontSize: scaledFont(11) }]}>{habit.currentStreak || 0}일째</Text>
                  </View>
                  <TouchableOpacity onPress={() => openEditModal(habit)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                    <Pencil size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <View style={[styles.checkCircle, { backgroundColor: isDone ? '#22c55e' : 'transparent', borderColor: isDone ? '#22c55e' : colors.border }]}>
                    {isDone && <Check size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              </Swipeable>
            </ScaleDecorator>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingHabit ? '습관 수정' : '새 습관'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 0, minHeight: 40, maxHeight: 100, textAlignVertical: 'center' }]}
                placeholder="습관 이름"
                placeholderTextColor={colors.mutedForeground}
                value={newHabitName}
                onChangeText={setNewHabitName}
                autoFocus
                multiline
                blurOnSubmit={false}
              />
              <VoiceInput color={colors.primary} onResult={(text) => setNewHabitName(prev => prev ? prev + ' ' + text : text)} />
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>색상</Text>
            <View style={styles.colorRow}>
              {COLORS.map((color) => (
                <TouchableOpacity key={color} style={[styles.colorOption, { backgroundColor: color, borderWidth: selectedColor === color ? 2 : 0, borderColor: '#fff' }]} onPress={() => setSelectedColor(color)} />
              ))}
            </View>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: isSubmitting ? colors.mutedForeground : colors.primary }]} onPress={handleSubmit} disabled={isSubmitting}>
              <Text style={styles.submitText}>{isSubmitting ? '저장 중...' : editingHabit ? '수정' : '추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  empty: { padding: 24, borderRadius: 10, alignItems: 'center' },
  emptyText: { fontSize: 13 },
  habitItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4, gap: 10 },
  habitName: { fontSize: 14, fontWeight: '500' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 8 },
  streakText: { fontSize: 11 },
  checkCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  colorOption: { width: 30, height: 30, borderRadius: 15 },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hintText: { fontSize: 10, textAlign: 'right', paddingHorizontal: 4, marginBottom: 4 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 4 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  swipeCopy: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 4 },
  swipeCopyBtn: { backgroundColor: '#3b82f6', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeCopyText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
