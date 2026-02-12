import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Target } from 'lucide-react-native';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme } from '../lib/theme';
import { useGoalStore } from '../store/goals';

export default function GoalBanner() {
  const { colors } = useTheme();
  const { pinnedGoals } = useGoalStore();
  const today = format(new Date(), 'M월 d일 EEEE', { locale: ko });

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{today}</Text>
      {pinnedGoals.length > 0 ? (
        <View style={styles.goalsGrid}>
          {pinnedGoals.map((goal) => (
            <View key={goal.id} style={[styles.goalCell, { backgroundColor: (goal.color || colors.primary) + '10' }]}>
              <View style={[styles.goalDot, { backgroundColor: goal.color || colors.primary }]} />
              <Text style={[styles.goalText, { color: colors.foreground }]} numberOfLines={1}>
                {goal.title}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyRow}>
          <Target size={14} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            목표 탭에서 원하는 목표를 고정해보세요
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
    marginLeft: 4,
  },
  goalsGrid: {
    gap: 4,
  },
  goalCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  goalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goalText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
  },
});
