import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Repeat, X, Check, Flame } from 'lucide-react-native';
import { format } from 'date-fns';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Habit } from '../types';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const ICONS = ['💪', '📚', '🏃', '💧', '🧘', '✍️', '🎯', '💤'];

export default function HabitsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(ICONS[0]);

  const fetchHabits = async () => {
    try {
      const data = await api.getHabits();
      setHabits(data || []);
    } catch (error) {
      console.error('Habits fetch error:', error);
    }
  };

  useEffect(() => {
    fetchHabits();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHabits();
    setRefreshing(false);
  };

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) {
      Alert.alert('오류', '습관 이름을 입력해주세요');
      return;
    }

    try {
      await api.createHabit({
        name: newHabitName,
        color: selectedColor,
        icon: selectedIcon,
        frequency: 'DAILY',
      });
      setNewHabitName('');
      setSelectedColor(COLORS[0]);
      setSelectedIcon(ICONS[0]);
      setShowModal(false);
      fetchHabits();
    } catch (error) {
      Alert.alert('오류', '습관 추가에 실패했습니다');
    }
  };

  const handleCompleteHabit = async (habit: Habit) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const isCompletedToday = habit.completedDates?.includes(today);

    try {
      if (isCompletedToday) {
        // 완료 취소
        await api.uncompleteHabit(habit.id, today);
      } else {
        // 완료 처리
        await api.completeHabit(habit.id, today);
      }
      fetchHabits();
    } catch (error) {
      Alert.alert('오류', '습관 업데이트에 실패했습니다');
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    Alert.alert('삭제', '이 습관을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteHabit(habitId);
            fetchHabits();
          } catch (error) {
            Alert.alert('오류', '삭제에 실패했습니다');
          }
        },
      },
    ]);
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>습관</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 오늘 현황 */}
      <View style={[styles.statsCard, { backgroundColor: colors.primary + '15' }]}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Repeat size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {habits.filter((h) => h.completedDates?.includes(today)).length}/{habits.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              오늘 완료
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Flame size={20} color="#f97316" />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {Math.max(...habits.map((h) => h.currentStreak || 0), 0)}일
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              최고 연속
            </Text>
          </View>
        </View>
      </View>

      {/* 습관 목록 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
      >
        {habits.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Repeat size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              습관을 추가해보세요
            </Text>
          </View>
        ) : (
          habits.map((habit) => {
            const isCompletedToday = habit.completedDates?.includes(today);
            return (
              <TouchableOpacity
                key={habit.id}
                style={[styles.habitCard, { backgroundColor: colors.card }]}
                onPress={() => handleCompleteHabit(habit)}
                onLongPress={() => handleDeleteHabit(habit.id)}
              >
                <View style={[styles.habitIcon, { backgroundColor: habit.color + '20' }]}>
                  <Text style={styles.habitEmoji}>{habit.icon}</Text>
                </View>
                <View style={styles.habitContent}>
                  <Text style={[styles.habitName, { color: colors.foreground }]}>
                    {habit.name}
                  </Text>
                  <View style={styles.habitMeta}>
                    <Flame size={12} color="#f97316" />
                    <Text style={[styles.streakText, { color: colors.mutedForeground }]}>
                      {habit.currentStreak || 0}일 연속
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.checkButton,
                    {
                      backgroundColor: isCompletedToday ? '#22c55e' : colors.secondary,
                      borderColor: isCompletedToday ? '#22c55e' : colors.border,
                    },
                  ]}
                  onPress={() => handleCompleteHabit(habit)}
                >
                  {isCompletedToday && <Check size={18} color="#fff" />}
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 추가 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                새 습관 추가
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="습관 이름을 입력하세요"
              placeholderTextColor={colors.mutedForeground}
              value={newHabitName}
              onChangeText={setNewHabitName}
            />

            <Text style={[styles.label, { color: colors.foreground }]}>아이콘</Text>
            <View style={styles.iconRow}>
              {ICONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    {
                      backgroundColor:
                        selectedIcon === icon ? colors.primary + '20' : colors.secondary,
                      borderColor: selectedIcon === icon ? colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedIcon(icon)}
                >
                  <Text style={styles.iconEmoji}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>색상</Text>
            <View style={styles.colorRow}>
              {COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: color,
                      borderWidth: selectedColor === color ? 3 : 0,
                      borderColor: '#fff',
                    },
                  ]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleAddHabit}
            >
              <Text style={styles.submitText}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  divider: {
    width: 1,
    height: 40,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  habitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  habitEmoji: {
    fontSize: 20,
  },
  habitContent: {
    flex: 1,
  },
  habitName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  habitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 12,
  },
  checkButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  iconEmoji: {
    fontSize: 20,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  submitButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
