import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  CheckCircle2,
  Circle,
  Repeat,
  Target,
  Settings,
  ChevronRight,
  Trash2,
  Flame,
  Clock,
  Check,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Task, Habit, Goal, Routine, RoutineItem } from '../types';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);

  const fetchData = async () => {
    try {
      const [tasksData, habitsData, goalsData, routinesData] = await Promise.all([
        api.getTasks().catch(() => []),
        api.getHabits().catch(() => []),
        api.getGoals().catch(() => []),
        api.getRoutines().catch(() => ({ routines: [] })),
      ]);

      const today = format(new Date(), 'yyyy-MM-dd');
      const todayTasksList = (tasksData || []).filter((t: Task) => {
        if (t.isCompleted) return false;
        if (!t.dueDate) return true;
        return t.dueDate.startsWith(today);
      }).slice(0, 5);

      const habitsWithDates = (habitsData || []).map((habit: Habit) => ({
        ...habit,
        completedDates: habit.logs?.map((log) => log.date.split('T')[0]) || [],
      }));

      const activeGoals = (goalsData || []).filter(
        (g: Goal) => g.status === 'IN_PROGRESS'
      ).slice(0, 3);

      const routinesList = routinesData?.routines || routinesData || [];

      setTasks(todayTasksList);
      setHabits(habitsWithDates.slice(0, 5));
      setGoals(activeGoals);
      setRoutines(Array.isArray(routinesList) ? routinesList.slice(0, 3) : []);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '늦은 밤이에요';
    if (hour < 12) return '좋은 아침이에요';
    if (hour < 18) return '좋은 오후에요';
    if (hour < 22) return '좋은 저녁이에요';
    return '늦은 밤이에요';
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const handleToggleTask = async (task: Task) => {
    try {
      await api.updateTask(task.id, { isCompleted: !task.isCompleted });
      fetchData();
    } catch (error) {
      Alert.alert('오류', '업데이트 실패');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      fetchData();
    } catch (error) {
      Alert.alert('오류', '삭제 실패');
    }
  };

  const handleToggleHabit = async (habit: Habit) => {
    const isCompletedToday = habit.completedDates?.includes(today);
    try {
      if (isCompletedToday) {
        await api.uncompleteHabit(habit.id, today);
      } else {
        await api.completeHabit(habit.id, today);
      }
      fetchData();
    } catch (error) {
      Alert.alert('오류', '업데이트 실패');
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    try {
      await api.deleteHabit(habitId);
      fetchData();
    } catch (error) {
      Alert.alert('오류', '삭제 실패');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await api.deleteGoal(goalId);
      fetchData();
    } catch (error) {
      Alert.alert('오류', '삭제 실패');
    }
  };

  const handleToggleRoutineItem = async (routineId: string, itemIndex: number) => {
    try {
      await api.toggleRoutineItem(routineId, itemIndex);
      fetchData();
    } catch (error) {
      Alert.alert('오류', '업데이트 실패');
    }
  };

  const confirmDelete = (type: string, id: string, name: string) => {
    Alert.alert(
      '삭제',
      `"${name}"을(를) 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            if (type === 'task') handleDeleteTask(id);
            else if (type === 'habit') handleDeleteHabit(id);
            else if (type === 'goal') handleDeleteGoal(id);
          },
        },
      ]
    );
  };

  const completedHabitsToday = habits.filter(h => h.completedDates?.includes(today)).length;

  const cardStyle = (baseColor: string) => ({
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: colors.foreground }]}>
              {getGreeting()}, <Text style={{ color: colors.primary }}>{user?.name || '사용자'}</Text>님
            </Text>
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {format(new Date(), 'M월 d일 EEEE', { locale: ko })}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            delayPressIn={0}
            style={[styles.settingsBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder }]}
            onPress={() => navigation.navigate('Settings')}
          >
            <Settings size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* 미니 통계 */}
        <View style={styles.miniStats}>
          <View style={[styles.miniStatItem, { backgroundColor: '#3b82f610', borderWidth: 1, borderColor: '#3b82f630' }]}>
            <CheckCircle2 size={16} color="#3b82f6" />
            <Text style={[styles.miniStatText, { color: colors.foreground }]}>
              할일 {tasks.length}개
            </Text>
          </View>
          <View style={[styles.miniStatItem, { backgroundColor: '#22c55e10', borderWidth: 1, borderColor: '#22c55e30' }]}>
            <Repeat size={16} color="#22c55e" />
            <Text style={[styles.miniStatText, { color: colors.foreground }]}>
              습관 {completedHabitsToday}/{habits.length}
            </Text>
          </View>
          <View style={[styles.miniStatItem, { backgroundColor: '#8b5cf610', borderWidth: 1, borderColor: '#8b5cf630' }]}>
            <Target size={16} color="#8b5cf6" />
            <Text style={[styles.miniStatText, { color: colors.foreground }]}>
              목표 {goals.length}개
            </Text>
          </View>
        </View>

        {/* 오늘의 할일 섹션 */}
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.7}
            delayPressIn={0}
            style={styles.sectionHeader}
            onPress={() => navigation.navigate('Tasks')}
          >
            <View style={styles.sectionTitleRow}>
              <CheckCircle2 size={18} color="#3b82f6" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                오늘의 할 일
              </Text>
            </View>
            <ChevronRight size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {tasks.length === 0 ? (
            <View style={[styles.emptyBox, cardStyle('#3b82f6')]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                할 일이 없습니다
              </Text>
            </View>
          ) : (
            tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                activeOpacity={0.7}
                delayPressIn={0}
                style={[styles.itemCard, cardStyle('#3b82f6'), { borderLeftWidth: 3, borderLeftColor: '#3b82f6' }]}
                onPress={() => handleToggleTask(task)}
                onLongPress={() => confirmDelete('task', task.id, task.title)}
              >
                <View style={styles.itemCheckbox}>
                  {task.isCompleted ? (
                    <CheckCircle2 size={22} color="#22c55e" />
                  ) : (
                    <Circle
                      size={22}
                      color={
                        task.priority === 'URGENT'
                          ? '#ef4444'
                          : task.priority === 'HIGH'
                          ? '#f97316'
                          : colors.border
                      }
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.itemTitle,
                    {
                      color: task.isCompleted ? colors.mutedForeground : colors.foreground,
                      textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.6}
                  delayPressIn={0}
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete('task', task.id, task.title)}
                >
                  <Trash2 size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* 오늘의 습관 섹션 */}
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.7}
            delayPressIn={0}
            style={styles.sectionHeader}
            onPress={() => navigation.navigate('Habits')}
          >
            <View style={styles.sectionTitleRow}>
              <Repeat size={18} color="#22c55e" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                오늘의 습관
              </Text>
            </View>
            <ChevronRight size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {habits.length === 0 ? (
            <View style={[styles.emptyBox, cardStyle('#22c55e')]}>
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
                  activeOpacity={0.7}
                  delayPressIn={0}
                  style={[styles.itemCard, cardStyle('#22c55e'), { borderLeftWidth: 3, borderLeftColor: habit.color || '#22c55e' }]}
                  onPress={() => handleToggleHabit(habit)}
                  onLongPress={() => confirmDelete('habit', habit.id, habit.name)}
                >
                  <View style={styles.itemCheckbox}>
                    {isCompletedToday ? (
                      <CheckCircle2 size={22} color="#22c55e" />
                    ) : (
                      <Circle size={22} color={habit.color || colors.border} />
                    )}
                  </View>
                  <View style={styles.habitInfo}>
                    <Text
                      style={[
                        styles.itemTitle,
                        {
                          color: isCompletedToday ? colors.mutedForeground : colors.foreground,
                          textDecorationLine: isCompletedToday ? 'line-through' : 'none',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {habit.icon} {habit.name}
                    </Text>
                    <View style={styles.streakBadge}>
                      <Flame size={10} color="#f97316" />
                      <Text style={[styles.streakText, { color: colors.mutedForeground }]}>
                        {habit.currentStreak || 0}일
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.6}
                    delayPressIn={0}
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete('habit', habit.id, habit.name)}
                  >
                    <Trash2 size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* 진행 중인 목표 섹션 */}
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.7}
            delayPressIn={0}
            style={styles.sectionHeader}
            onPress={() => navigation.navigate('Goals')}
          >
            <View style={styles.sectionTitleRow}>
              <Target size={18} color="#8b5cf6" />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                진행 중인 목표
              </Text>
            </View>
            <ChevronRight size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          {goals.length === 0 ? (
            <View style={[styles.emptyBox, cardStyle('#8b5cf6')]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                목표를 설정해보세요
              </Text>
            </View>
          ) : (
            goals.map((goal) => (
              <TouchableOpacity
                key={goal.id}
                activeOpacity={0.7}
                delayPressIn={0}
                style={[styles.goalCard, cardStyle('#8b5cf6'), { borderLeftWidth: 3, borderLeftColor: goal.color || '#8b5cf6' }]}
                onLongPress={() => confirmDelete('goal', goal.id, goal.title)}
              >
                <View style={styles.goalHeader}>
                  <View style={[styles.goalIcon, { backgroundColor: (goal.color || '#8b5cf6') + '20' }]}>
                    <Text style={styles.goalEmoji}>
                      {goal.icon === 'target' ? '🎯' : goal.icon === 'star' ? '⭐' : goal.icon || '✨'}
                    </Text>
                  </View>
                  <View style={styles.goalContent}>
                    <Text style={[styles.goalTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <View style={styles.progressRow}>
                      <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${goal.progress || 0}%`,
                              backgroundColor: goal.color || '#8b5cf6',
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                        {goal.progress || 0}%
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.6}
                    delayPressIn={0}
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete('goal', goal.id, goal.title)}
                  >
                    <Trash2 size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* 루틴 섹션 - 항목 직접 표시 */}
        {routines.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.7}
              delayPressIn={0}
              style={styles.sectionHeader}
              onPress={() => navigation.navigate('Routines')}
            >
              <View style={styles.sectionTitleRow}>
                <Clock size={18} color="#f59e0b" />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  루틴
                </Text>
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            {routines.map((routine) => {
              const completedItems = routine.completedItemsToday || [];
              const totalItems = routine.items?.length || 0;

              return (
                <View
                  key={routine.id}
                  style={[styles.routineCard, cardStyle('#f59e0b'), { borderLeftWidth: 3, borderLeftColor: '#f59e0b' }]}
                >
                  {/* 루틴 항목들 직접 표시 */}
                  {routine.items && routine.items.length > 0 ? (
                    routine.items.map((item: RoutineItem, index: number) => {
                      const isCompleted = completedItems.includes(index);
                      return (
                        <TouchableOpacity
                          key={item.id || index}
                          activeOpacity={0.7}
                          delayPressIn={0}
                          style={[
                            styles.routineItemRow,
                            index < routine.items!.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                          ]}
                          onPress={() => handleToggleRoutineItem(routine.id, index)}
                        >
                          <View
                            style={[
                              styles.routineItemCheck,
                              {
                                backgroundColor: isCompleted ? '#22c55e' : colors.secondary,
                                borderColor: isCompleted ? '#22c55e' : colors.border,
                              },
                            ]}
                          >
                            {isCompleted && <Check size={12} color="#fff" />}
                          </View>
                          <Text
                            style={[
                              styles.routineItemName,
                              {
                                color: isCompleted ? colors.mutedForeground : colors.foreground,
                                textDecorationLine: isCompleted ? 'line-through' : 'none',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          {item.duration && (
                            <Text style={[styles.routineItemDuration, { color: colors.mutedForeground }]}>
                              {item.duration}분
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.mutedForeground, padding: 12 }]}>
                      항목이 없습니다
                    </Text>
                  )}

                  {/* 진행 상태 표시 */}
                  <View style={[styles.routineProgress, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.routineProgressText, { color: colors.mutedForeground }]}>
                      {completedItems.length}/{totalItems} 완료
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  dateText: {
    fontSize: 13,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniStats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  miniStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  miniStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  itemCheckbox: {
    marginRight: 12,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
  },
  habitInfo: {
    flex: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  streakText: {
    fontSize: 11,
  },
  deleteBtn: {
    padding: 8,
  },
  goalCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goalEmoji: {
    fontSize: 16,
  },
  goalContent: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    width: 32,
    textAlign: 'right',
  },
  routineCard: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  routineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  routineItemCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  routineItemName: {
    flex: 1,
    fontSize: 14,
  },
  routineItemDuration: {
    fontSize: 12,
    marginLeft: 8,
  },
  routineProgress: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  routineProgressText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
