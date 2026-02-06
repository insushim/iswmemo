import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, X, Check, Flame } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Habit } from '../types';
import PinnedGoals from '../components/PinnedGoals';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function HabitsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchHabits = async () => {
    try {
      const data = await api.getHabits();
      const habitsWithDates = (data || []).map((habit: Habit) => ({
        ...habit,
        completedDates: habit.logs?.map((log) => log.date.split('T')[0]) || [],
      }));
      setHabits(habitsWithDates);
    } catch (error) {
      console.error('Habits fetch error:', error);
    }
  };

  useFocusEffect(useCallback(() => { fetchHabits(); }, []));

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
    try {
      if (editingHabit) {
        await api.updateHabit(editingHabit.id, { name: newHabitName.trim(), color: selectedColor });
      } else {
        await api.createHabit({ name: newHabitName.trim(), color: selectedColor, frequency: 'DAILY' });
      }
      setShowModal(false);
      await fetchHabits();
    } catch (error: any) {
      Alert.alert('오류', error?.message || '저장에 실패했습니다');
    } finally { setIsSubmitting(false); }
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

  const handleLongPress = (habit: Habit) => {
    Alert.alert(habit.name, '어떤 작업을 하시겠습니까?', [
      { text: '수정', onPress: () => openEditModal(habit) },
      { text: '삭제', style: 'destructive', onPress: () => {
        Alert.alert('삭제', `"${habit.name}"을(를) 삭제하시겠습니까?`, [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
            try { await api.deleteHabit(habit.id); await fetchHabits(); }
            catch (error: any) { Alert.alert('오류', error?.message || '삭제에 실패했습니다'); }
          }},
        ]);
      }},
      { text: '취소', style: 'cancel' },
    ]);
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const completedCount = habits.filter((h) => h.completedDates?.includes(today)).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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

      <PinnedGoals />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
      >
        {habits.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>습관을 추가해보세요</Text>
          </View>
        ) : (
          habits.map((habit) => {
            const isDone = habit.completedDates?.includes(today);
            return (
              <TouchableOpacity
                key={habit.id}
                activeOpacity={0.7}
                style={[styles.habitItem, { backgroundColor: colors.card, borderLeftColor: habit.color || '#6366f1', borderLeftWidth: 3 }]}
                onPress={() => handleCompleteHabit(habit)}
                onLongPress={() => handleLongPress(habit)}
              >
                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: isDone ? colors.mutedForeground : colors.foreground, textDecorationLine: isDone ? 'line-through' : 'none' }]}>{habit.name}</Text>
                  <View style={styles.streakRow}>
                    <Flame size={11} color="#f97316" />
                    <Text style={[styles.streakText, { color: colors.mutedForeground }]}>{habit.currentStreak || 0}일</Text>
                  </View>
                </View>
                <View style={[styles.checkCircle, { backgroundColor: isDone ? '#22c55e' : 'transparent', borderColor: isDone ? '#22c55e' : colors.border }]}>
                  {isDone && <Check size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingHabit ? '습관 수정' : '새 습관'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="습관 이름"
              placeholderTextColor={colors.mutedForeground}
              value={newHabitName}
              onChangeText={setNewHabitName}
              autoFocus
            />

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
  habitInfo: { flex: 1 },
  habitName: { fontSize: 14, fontWeight: '500' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
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
});
