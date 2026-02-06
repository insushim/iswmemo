import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Star } from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Goal } from '../types';

export default function PinnedGoals() {
  const { colors } = useTheme();
  const [lifeGoals, setLifeGoals] = useState<Goal[]>([]);

  useFocusEffect(
    useCallback(() => {
      const fetchGoals = async () => {
        try {
          const data = await api.getGoals();
          const life = (data || [])
            .filter((g: Goal) => g.type === 'LIFE' && g.status === 'IN_PROGRESS')
            .slice(0, 2);
          setLifeGoals(life);
        } catch (error) {
          // silent fail
        }
      };
      fetchGoals();
    }, [])
  );

  if (lifeGoals.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {lifeGoals.map((goal) => (
        <View key={goal.id} style={styles.goalRow}>
          <Star size={12} color="#f59e0b" fill="#f59e0b" />
          <Text style={[styles.goalText, { color: colors.foreground }]} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {goal.progress || 0}%
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  goalText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
