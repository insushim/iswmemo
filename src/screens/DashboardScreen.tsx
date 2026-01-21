import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Flame,
  CheckCircle2,
  Repeat,
  Target,
  StickyNote,
  Settings,
  Star,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme, levelSystem } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    todayTasks: 0,
    completedTasks: 0,
    todayHabits: 0,
    completedHabits: 0,
    activeGoals: 0,
    monthNotes: 0,
  });
  const [lifeGoals, setLifeGoals] = useState<any[]>([]);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      // API에서 데이터 가져오기
      const [tasksData, goalsData] = await Promise.all([
        api.getTasks().catch(() => []),
        api.getGoals().catch(() => []),
      ]);

      // 오늘 할일 필터링
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');

      const todayTasksList = (tasksData || []).filter((t: any) => {
        if (!t.dueDate) return !t.isCompleted;
        return t.dueDate.startsWith(todayStr);
      });

      const completedToday = todayTasksList.filter((t: any) => t.isCompleted).length;

      // 인생 목표 필터링
      const lifeGoalsList = (goalsData || []).filter(
        (g: any) => g.type === 'LIFE' && g.status === 'IN_PROGRESS'
      ).slice(0, 3);

      setTodayTasks(todayTasksList.slice(0, 5));
      setLifeGoals(lifeGoalsList);
      setStats({
        todayTasks: todayTasksList.length,
        completedTasks: completedToday,
        todayHabits: 0,
        completedHabits: 0,
        activeGoals: (goalsData || []).filter((g: any) => g.status === 'IN_PROGRESS').length,
        monthNotes: 0,
      });
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const level = user ? levelSystem.getLevel(user.experience || 0) : 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}
            </Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>
              {getGreeting()},{' '}
              <Text style={{ color: colors.primary }}>{user?.name || '사용자'}</Text>님!
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: colors.secondary }]}
            onPress={() => navigation.navigate('Settings')}
          >
            <Settings size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* 스트릭 & 레벨 */}
        <View style={[styles.card, { backgroundColor: colors.primary + '15' }]}>
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              <Flame size={24} color="#f97316" />
              <Text style={[styles.streakValue, { color: colors.foreground }]}>
                {user?.currentStreak || 0}일
              </Text>
              <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>연속</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.streakItem}>
              <View
                style={[styles.levelBadge, { backgroundColor: levelSystem.getLevelColor(level) }]}
              >
                <Text style={styles.levelText}>Lv.{level}</Text>
              </View>
              <Text style={[styles.streakValue, { color: colors.foreground }]}>
                {user?.totalPoints?.toLocaleString() || 0}P
              </Text>
              <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>포인트</Text>
            </View>
          </View>
        </View>

        {/* 인생 목표 */}
        {lifeGoals.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.primary + '10' }]}>
            <View style={styles.cardHeader}>
              <Star size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.primary }]}>나의 인생 목표</Text>
            </View>
            {lifeGoals.map((goal) => (
              <View key={goal.id} style={styles.goalItem}>
                <View style={[styles.goalIcon, { backgroundColor: goal.color }]}>
                  <Text style={styles.goalEmoji}>
                    {goal.icon === 'target' ? '🎯' : goal.icon === 'star' ? '⭐' : '✨'}
                  </Text>
                </View>
                <View style={styles.goalContent}>
                  <Text style={[styles.goalTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                      <View
                        style={[styles.progressFill, { width: `${goal.progress}%`, backgroundColor: goal.color }]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                      {goal.progress}%
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 통계 그리드 */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#3b82f620' }]}>
              <CheckCircle2 size={20} color="#3b82f6" />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {stats.completedTasks}/{stats.todayTasks}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>오늘 할 일</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#22c55e20' }]}>
              <Repeat size={20} color="#22c55e" />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {stats.completedHabits}/{stats.todayHabits}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>오늘 습관</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#8b5cf620' }]}>
              <Target size={20} color="#8b5cf6" />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {stats.activeGoals}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>진행중 목표</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#f59e0b20' }]}>
              <StickyNote size={20} color="#f59e0b" />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {stats.monthNotes}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>이번 달 메모</Text>
          </View>
        </View>

        {/* 오늘 할 일 */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <CheckCircle2 size={18} color="#3b82f6" />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>오늘의 할 일</Text>
          </View>
          {todayTasks.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              오늘 할 일이 없습니다
            </Text>
          ) : (
            todayTasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <View
                  style={[
                    styles.taskCheckbox,
                    {
                      backgroundColor: task.isCompleted ? '#22c55e' : 'transparent',
                      borderColor: task.isCompleted
                        ? '#22c55e'
                        : task.priority === 'URGENT'
                        ? '#ef4444'
                        : task.priority === 'HIGH'
                        ? '#f97316'
                        : colors.border,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.taskTitle,
                    {
                      color: task.isCompleted ? colors.mutedForeground : colors.foreground,
                      textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dateText: {
    fontSize: 13,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  streakItem: {
    alignItems: 'center',
    gap: 4,
  },
  streakValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  streakLabel: {
    fontSize: 12,
  },
  divider: {
    width: 1,
    height: 50,
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  goalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalEmoji: {
    fontSize: 16,
  },
  goalContent: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  progressContainer: {
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  taskTitle: {
    flex: 1,
    fontSize: 14,
  },
});
