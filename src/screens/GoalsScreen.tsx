import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Target, X, Star } from 'lucide-react-native';
import { useTheme, getStatusColor } from '../lib/theme';
import { api } from '../lib/api';
import { Goal, GoalType, GoalStatus } from '../types';
import PinnedGoals from '../components/PinnedGoals';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function GoalsScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [progressGoal, setProgressGoal] = useState<Goal | null>(null);
  const [progressValue, setProgressValue] = useState('');
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalType, setNewGoalType] = useState<GoalType>('SHORT');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [filter, setFilter] = useState<'all' | GoalType>('all');

  const fetchGoals = async () => {
    try { const data = await api.getGoals(); setGoals(data || []); }
    catch (error) { console.error('Goals fetch error:', error); }
  };

  useEffect(() => { fetchGoals(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchGoals(); setRefreshing(false); };

  const openAddModal = () => {
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalType('SHORT');
    setSelectedColor(COLORS[0]);
    setShowModal(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setNewGoalTitle(goal.title);
    setNewGoalType(goal.type);
    setSelectedColor(goal.color || COLORS[0]);
    setShowModal(true);
  };

  const openProgressModal = (goal: Goal) => {
    setProgressGoal(goal);
    setProgressValue(String(goal.progress || 0));
    setShowProgressModal(true);
  };

  const handleSubmit = async () => {
    if (!newGoalTitle.trim()) { Alert.alert('오류', '목표 제목을 입력해주세요'); return; }
    try {
      if (editingGoal) {
        await api.updateGoal(editingGoal.id, { title: newGoalTitle, type: newGoalType, color: selectedColor });
      } else {
        await api.createGoal({ title: newGoalTitle, type: newGoalType, color: selectedColor, status: 'IN_PROGRESS' });
      }
      setShowModal(false);
      fetchGoals();
    } catch (error) { Alert.alert('오류', '저장에 실패했습니다'); }
  };

  const handleUpdateProgress = async () => {
    if (!progressGoal) return;
    const progress = parseInt(progressValue, 10);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      Alert.alert('오류', '0-100 사이의 숫자를 입력해주세요');
      return;
    }
    try {
      const updateData: any = { progress };
      if (progress >= 100) updateData.status = 'COMPLETED';
      await api.updateGoal(progressGoal.id, updateData);
      setShowProgressModal(false);
      fetchGoals();
    } catch (error) { Alert.alert('오류', '업데이트에 실패했습니다'); }
  };

  const handleLongPress = (goal: Goal) => {
    Alert.alert(goal.title, '어떤 작업을 하시겠습니까?', [
      { text: '수정', onPress: () => openEditModal(goal) },
      { text: '진행률 변경', onPress: () => openProgressModal(goal) },
      { text: '삭제', style: 'destructive', onPress: () => {
        Alert.alert('삭제', '이 목표를 삭제하시겠습니까?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
            try { await api.deleteGoal(goal.id); fetchGoals(); }
            catch (error) { Alert.alert('오류', '삭제에 실패했습니다'); }
          }},
        ]);
      }},
      { text: '취소', style: 'cancel' },
    ]);
  };

  const filteredGoals = goals.filter((g) => filter === 'all' || g.type === filter);
  const typeLabels: Partial<Record<GoalType, string>> = { LIFE: '인생', LONG: '장기', SHORT: '단기', DECADE: '10년', FIVE_YEAR: '5년', YEARLY: '연간', QUARTERLY: '분기', MONTHLY: '월간', WEEKLY: '주간', DAILY: '일간' };
  const statusLabels: Partial<Record<GoalStatus, string>> = { NOT_STARTED: '시작전', IN_PROGRESS: '진행중', COMPLETED: '완료', ON_HOLD: '보류', ABANDONED: '포기' };
  const inProgressCount = goals.filter(g => g.status === 'IN_PROGRESS').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>목표</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>진행중 {inProgressCount}개</Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'LIFE', 'LONG', 'SHORT'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, { backgroundColor: filter === f ? colors.primary : colors.card }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: filter === f ? '#fff' : colors.foreground }]}>
              {f === 'all' ? '전체' : typeLabels[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
      >
        {filteredGoals.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Target size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>목표를 추가해보세요</Text>
          </View>
        ) : (
          filteredGoals.map((goal) => (
            <TouchableOpacity
              key={goal.id}
              activeOpacity={0.7}
              style={[styles.goalItem, { backgroundColor: colors.card }]}
              onPress={() => openProgressModal(goal)}
              onLongPress={() => handleLongPress(goal)}
            >
              <View style={styles.goalTop}>
                <View style={styles.goalInfo}>
                  <Text style={[styles.goalTitle, { color: colors.foreground }]} numberOfLines={1}>{goal.title}</Text>
                  <View style={styles.goalMeta}>
                    <Text style={[styles.badge, { color: goal.color, backgroundColor: (goal.color || '#6366f1') + '15' }]}>{typeLabels[goal.type] || goal.type}</Text>
                    <Text style={[styles.badge, { color: getStatusColor(goal.status), backgroundColor: getStatusColor(goal.status) + '15' }]}>{statusLabels[goal.status] || goal.status}</Text>
                  </View>
                </View>
                <Text style={[styles.progressNum, { color: goal.color || colors.mutedForeground }]}>{goal.progress || 0}%</Text>
              </View>
              <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                <View style={[styles.progressFill, { width: `${goal.progress || 0}%`, backgroundColor: goal.color || '#6366f1' }]} />
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* 추가/수정 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingGoal ? '목표 수정' : '새 목표'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="목표를 입력하세요"
              placeholderTextColor={colors.mutedForeground}
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              autoFocus
            />

            <Text style={[styles.label, { color: colors.foreground }]}>유형</Text>
            <View style={styles.typeRow}>
              {(['LIFE', 'LONG', 'SHORT'] as GoalType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeBtn, { backgroundColor: newGoalType === type ? colors.primary : colors.background }]}
                  onPress={() => setNewGoalType(type)}
                >
                  <Text style={[styles.typeBtnText, { color: newGoalType === type ? '#fff' : colors.foreground }]}>{typeLabels[type]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>색상</Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorOption, { backgroundColor: c, borderWidth: selectedColor === c ? 2 : 0, borderColor: '#fff' }]} onPress={() => setSelectedColor(c)} />
              ))}
            </View>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
              <Text style={styles.submitText}>{editingGoal ? '수정' : '추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 진행률 모달 */}
      <Modal visible={showProgressModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.progressModalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 8 }]}>진행률 업데이트</Text>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{progressGoal?.title}</Text>

            <View style={styles.progressInputRow}>
              <TouchableOpacity
                style={[styles.progressAdjustBtn, { backgroundColor: colors.background }]}
                onPress={() => {
                  const v = Math.max(0, (parseInt(progressValue, 10) || 0) - 10);
                  setProgressValue(String(v));
                }}
              >
                <Text style={[styles.progressAdjustText, { color: colors.foreground }]}>-10</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.progressInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                keyboardType="number-pad"
                value={progressValue}
                onChangeText={setProgressValue}
                maxLength={3}
                textAlign="center"
              />
              <TouchableOpacity
                style={[styles.progressAdjustBtn, { backgroundColor: colors.background }]}
                onPress={() => {
                  const v = Math.min(100, (parseInt(progressValue, 10) || 0) + 10);
                  setProgressValue(String(v));
                }}
              >
                <Text style={[styles.progressAdjustText, { color: colors.foreground }]}>+10</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.progressBarPreview, { backgroundColor: colors.secondary }]}>
              <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, parseInt(progressValue, 10) || 0))}%`, backgroundColor: progressGoal?.color || '#6366f1' }]} />
            </View>

            <View style={styles.progressBtnRow}>
              <TouchableOpacity style={[styles.progressCancelBtn, { borderColor: colors.border }]} onPress={() => setShowProgressModal(false)}>
                <Text style={[styles.progressCancelText, { color: colors.foreground }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.progressConfirmBtn, { backgroundColor: colors.primary }]} onPress={handleUpdateProgress}>
                <Text style={styles.progressConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
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
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  filterText: { fontSize: 12, fontWeight: '500' },
  list: { paddingHorizontal: 12, paddingTop: 4 },
  empty: { padding: 32, borderRadius: 10, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  goalItem: { padding: 12, borderRadius: 10, marginBottom: 6 },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  goalInfo: { flex: 1 },
  goalTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  goalMeta: { flexDirection: 'row', gap: 6 },
  badge: { fontSize: 10, fontWeight: '500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  progressNum: { fontSize: 14, fontWeight: '700' },
  progressBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, position: 'absolute', bottom: 0, left: 0, right: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  typeBtnText: { fontSize: 13, fontWeight: '500' },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  colorOption: { width: 30, height: 30, borderRadius: 15 },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  progressModalContent: { width: '85%', borderRadius: 16, padding: 20 },
  progressLabel: { fontSize: 13, marginBottom: 16 },
  progressInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 },
  progressAdjustBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  progressAdjustText: { fontSize: 14, fontWeight: '600' },
  progressInput: { width: 80, height: 44, borderWidth: 1, borderRadius: 10, fontSize: 20, fontWeight: '700' },
  progressBarPreview: { height: 6, borderRadius: 3, marginBottom: 20, overflow: 'hidden' },
  progressBtnRow: { flexDirection: 'row', gap: 10 },
  progressCancelBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  progressCancelText: { fontSize: 14, fontWeight: '500' },
  progressConfirmBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  progressConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
