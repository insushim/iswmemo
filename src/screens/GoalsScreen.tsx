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
import { Plus, Target, X, Star, ChevronRight } from 'lucide-react-native';
import { useTheme, getStatusColor } from '../lib/theme';
import { api } from '../lib/api';
import { Goal, GoalType, GoalStatus } from '../types';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function GoalsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalType, setNewGoalType] = useState<GoalType>('SHORT');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [filter, setFilter] = useState<'all' | GoalType>('all');

  const fetchGoals = async () => {
    try {
      const data = await api.getGoals();
      setGoals(data || []);
    } catch (error) {
      console.error('Goals fetch error:', error);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals();
    setRefreshing(false);
  };

  const handleAddGoal = async () => {
    if (!newGoalTitle.trim()) {
      Alert.alert('오류', '목표 제목을 입력해주세요');
      return;
    }

    try {
      await api.createGoal({
        title: newGoalTitle,
        type: newGoalType,
        color: selectedColor,
        status: 'IN_PROGRESS',
      });
      setNewGoalTitle('');
      setNewGoalType('SHORT');
      setSelectedColor(COLORS[0]);
      setShowModal(false);
      fetchGoals();
    } catch (error) {
      Alert.alert('오류', '목표 추가에 실패했습니다');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    Alert.alert('삭제', '이 목표를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteGoal(goalId);
            fetchGoals();
          } catch (error) {
            Alert.alert('오류', '삭제에 실패했습니다');
          }
        },
      },
    ]);
  };

  const handleUpdateProgress = async (goal: Goal) => {
    Alert.prompt(
      '진행률 업데이트',
      '진행률을 입력하세요 (0-100)',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: async (value?: string) => {
            const progress = parseInt(value || '0', 10);
            if (isNaN(progress) || progress < 0 || progress > 100) {
              Alert.alert('오류', '0-100 사이의 숫자를 입력해주세요');
              return;
            }
            try {
              await api.updateGoal(goal.id, { progress });
              fetchGoals();
            } catch (error) {
              Alert.alert('오류', '업데이트에 실패했습니다');
            }
          },
        },
      ],
      'plain-text',
      String(goal.progress || 0)
    );
  };

  const filteredGoals = goals.filter((goal) => {
    if (filter === 'all') return true;
    return goal.type === filter;
  });

  const typeLabels: Record<GoalType, string> = {
    LIFE: '인생',
    LONG: '장기',
    SHORT: '단기',
  };

  const statusLabels: Record<GoalStatus, string> = {
    IN_PROGRESS: '진행중',
    COMPLETED: '완료',
    ON_HOLD: '보류',
    ABANDONED: '포기',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>목표</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {(['all', 'LIFE', 'LONG', 'SHORT'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterButton,
              {
                backgroundColor: filter === f ? colors.primary : colors.secondary,
              },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? '#fff' : colors.foreground },
              ]}
            >
              {f === 'all' ? '전체' : typeLabels[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 목표 목록 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
      >
        {filteredGoals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Target size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              목표를 추가해보세요
            </Text>
          </View>
        ) : (
          filteredGoals.map((goal) => (
            <TouchableOpacity
              key={goal.id}
              style={[styles.goalCard, { backgroundColor: colors.card }]}
              onPress={() => handleUpdateProgress(goal)}
              onLongPress={() => handleDeleteGoal(goal.id)}
            >
              <View style={styles.goalHeader}>
                <View style={[styles.goalIcon, { backgroundColor: goal.color + '20' }]}>
                  {goal.type === 'LIFE' ? (
                    <Star size={18} color={goal.color} />
                  ) : (
                    <Target size={18} color={goal.color} />
                  )}
                </View>
                <View style={styles.goalInfo}>
                  <View style={styles.goalTitleRow}>
                    <Text
                      style={[styles.goalTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {goal.title}
                    </Text>
                    <ChevronRight size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.goalMeta}>
                    <View
                      style={[styles.typeBadge, { backgroundColor: goal.color + '20' }]}
                    >
                      <Text style={[styles.typeText, { color: goal.color }]}>
                        {typeLabels[goal.type]}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(goal.status) + '20' },
                      ]}
                    >
                      <Text
                        style={[styles.statusText, { color: getStatusColor(goal.status) }]}
                      >
                        {statusLabels[goal.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${goal.progress || 0}%`, backgroundColor: goal.color },
                    ]}
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                  {goal.progress || 0}%
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* 추가 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                새 목표 추가
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
              placeholder="목표를 입력하세요"
              placeholderTextColor={colors.mutedForeground}
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
            />

            <Text style={[styles.label, { color: colors.foreground }]}>목표 유형</Text>
            <View style={styles.typeRow}>
              {(['LIFE', 'LONG', 'SHORT'] as GoalType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor:
                        newGoalType === type ? colors.primary : colors.secondary,
                    },
                  ]}
                  onPress={() => setNewGoalType(type)}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      { color: newGoalType === type ? '#fff' : colors.foreground },
                    ]}
                  >
                    {typeLabels[type]}
                  </Text>
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
              onPress={handleAddGoal}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
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
  goalCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalInfo: {
    flex: 1,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
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
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: '500',
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
