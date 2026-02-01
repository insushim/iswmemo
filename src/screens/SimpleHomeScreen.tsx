import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Alert, Modal, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Plus, Trash2, Settings, Bell, BellOff, Target, X, Calendar, Clock, Star, AlertCircle } from 'lucide-react-native';
import { format, addDays, startOfWeek, addWeeks, isToday, isBefore, parseISO, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { lockScreenService, formatTasksForNotification } from '../lib/lockscreen';
import { Task, Goal } from '../types';

type TaskType = 'simple' | 'deadline';
interface DateOption { label: string; value: Date; }
interface TimeOption { label: string; value: string; }

export default function SimpleHomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [lockscreenEnabled, setLockscreenEnabled] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('simple');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('09:00');

  const today = new Date();
  const dateOptions: DateOption[] = [
    { label: '오늘', value: today },
    { label: '내일', value: addDays(today, 1) },
    { label: '이번 주', value: addDays(startOfWeek(today, { weekStartsOn: 1 }), 6) },
    { label: '다음 주', value: addDays(startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 }), 6) },
  ];

  const timeOptions: TimeOption[] = [
    { label: '오전 9시', value: '09:00' },
    { label: '정오', value: '12:00' },
    { label: '오후 6시', value: '18:00' },
    { label: '밤 9시', value: '21:00' },
  ];

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, goalsRes] = await Promise.all([api.getTasks(), api.getGoals()]);
      setTasks(tasksRes || []);
      setGoals(goalsRes || []);
    } catch (e) { console.error(e); }
  }, []);

  const checkLockscreenStatus = useCallback(async () => {
    try {
      const enabled = await lockScreenService.isServiceRunning();
      setLockscreenEnabled(enabled);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); checkLockscreenStatus(); }, [fetchData, checkLockscreenStatus]));

  useEffect(() => {
    if (lockscreenEnabled && tasks.length > 0) {
      const inc = tasks.filter(t => !t.isCompleted);
      lockScreenService.updateNotification('오늘의 할일', formatTasksForNotification(inc));
    }
  }, [tasks, lockscreenEnabled]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, [fetchData]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const td: any = { title: newTaskTitle.trim(), completed: false };
      if (taskType === 'deadline') {
        const dd = new Date(selectedDate);
        const [h, m] = selectedTime.split(':');
        dd.setHours(parseInt(h), parseInt(m), 0, 0);
        td.dueDate = dd.toISOString();
        td.dueTime = selectedTime;
      }
      await api.createTask(td);
      setNewTaskTitle('');
      setTaskType('simple');
      setSelectedDate(new Date());
      setSelectedTime('09:00');
      setShowAddModal(false);
      Keyboard.dismiss();
      fetchData();
    } catch (e) {
      Alert.alert('오류', '할轫\�추가에 실패했습니다.');
    }
  };

  const handleToggleTask = async (t: Task) => {
    try {
      await api.updateTask(t.id, { isCompleted: !t.isCompleted });
      fetchData();
    } catch (e) {
      Alert.alert('오류', '상태 변경 실패');
    }
  };

  const handleDeleteTask = async (id: string) => {
    Alert.alert('삭제', '이 할일을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(id);
            fetchData();
          } catch (e) {
            Alert.alert('오류', '삭제 실패');
          }
        },
      },
    ]);
  };

  const toggleLockscreen = async () => {
    try {
      if (lockscreenEnabled) {
        await lockScreenService.stopService();
        setLockscreenEnabled(false);
      } else {
        await lockScreenService.startService('GrowthPad', '');
        const inc = tasks.filter(t => !t.isCompleted);
        await lockScreenService.updateNotification('오늘의 할일', formatTasksForNotification(inc));
        setLockscreenEnabled(true);
      }
    } catch (e) {
      Alert.alert('오류', '설정 변경 실패');
    }
  };

  const isOverdue = (t: Task): boolean => {
    if (!t.dueDate) return false;
    return isBefore(parseISO(t.dueDate), new Date()) && !t.isCompleted;
  };

  const getDueDateInfo = (t: Task): { text: string; isUrgent: boolean } | null => {
    if (!t.dueDate) return null;
    const d = parseISO(t.dueDate);
    const n = new Date();
    if (isSameDay(d, n)) return { text: `오늘 ${t.dueTime || ''}`, isUrgent: true };
    if (isSameDay(d, addDays(n, 1))) return { text: `내일 ${t.dueTime || ''}`, isUrgent: false };
    if (isBefore(d, n)) return { text: '기한 지남', isUrgent: true };
    return { text: format(d, 'M/d (E)', { locale: ko }), isUrgent: false };
  };

  const lifeGoal = goals.find(g => g.type === 'LIFE');
  const subGoals = goals.filter(g => g.type !== 'LIFE').slice(0, 2);
  const incompleteTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.appIcon, { backgroundColor: colors.primary }]}>
            <Target size={20} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>GrowthPad</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            {format(today, 'M월 d일 (E)', { locale: ko })}
          </Text>
          <TouchableOpacity style={styles.headerButton} onPress={toggleLockscreen}>
            {lockscreenEnabled ? <Bell size={20} color={colors.primary} /> : <BellOff size={20} color={colors.mutedForeground} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Settings')}>
            <Settings size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* 목표 섹션 */}
        {(lifeGoal || subGoals.length > 0) && (
          <View style={[styles.goalsSection, { backgroundColor: colors.card }]}>
            {lifeGoal && (
              <View style={styles.lifeGoalContainer}>
                <Star size={16} color={colors.primary} />
                <Text style={[styles.lifeGoalText, { color: colors.foreground }]} numberOfLines={1}>{lifeGoal.title}</Text>
              </View>
            )}
            {subGoals.map(g => (
              <View key={g.id} style={styles.subGoalContainer}>
                <Target size={14} color={colors.mutedForeground} />
                <Text style={[styles.subGoalText, { color: colors.mutedForeground }]} numberOfLines={1}>{g.title}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 할일 목록 */}
        <View style={styles.tasksSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            할일 {incompleteTasks.length > 0 ? `(${incompleteTasks.length})` : ''}
          </Text>

          {incompleteTasks.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>할일이 없습니다</Text>
            </View>
          ) : (
            incompleteTasks.map(t => {
              const di = getDueDateInfo(t);
              const o = isOverdue(t);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.taskItem, { backgroundColor: colors.card }, o && styles.taskItemOverdue]}
                  onPress={() => handleToggleTask(t)}
                  onLongPress={() => handleDeleteTask(t.id)}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }]}>
                    {t.isCompleted && <Check size={14} color={colors.primary} />}
                  </View>
                  <View style={styles.taskContent}>
                    <Text style={[styles.taskTitle, { color: colors.foreground }]}>{t.title}</Text>
                    {di && (
                      <View style={styles.dueDateRow}>
                        {o ? <AlertCircle size={12} color={colors.destructive} /> : <Clock size={12} color={di.isUrgent ? colors.primary : colors.mutedForeground} />}
                        <Text style={[styles.dueDateText, { color: o ? colors.destructive : di.isUrgent ? colors.primary : colors.mutedForeground }]}>{di.text}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteTask(t.id)}>
                    <Trash2 size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* 요료된 할일 */}
        {completedTasks.length > 0 && (
          <View style={styles.tasksSection}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>웄렌됨 ({completedTasks.length})</Text>
            {completedTasks.slice(0, 5).map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.taskItem, styles.taskItemCompleted, { backgroundColor: colors.card }]}
                onPress={() => handleToggleTask(t)}
                onLongPress={() => handleDeleteTask(t.id)}
              >
                <View style={[styles.checkbox, styles.checkboxCompleted, { borderColor: colors.primary, backgroundColor: colors.primary }]}>
                  <Check size={14} color="#fff" />
                </View>
                <Text style={[styles.taskTitle, styles.taskTitleCompleted, { color: colors.mutedForeground }]}>{t.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowAddModal(true)}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/*  할일 추가 모달 */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>초 할일</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="할일을 입력하세요"
              placeholderTextColor={colors.mutedForeground}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              autoFocus
            />

            {/* 할일 타입 선택 */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeButton, { borderColor: colors.border }, taskType === 'simple' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setTaskType('simple')}
              >
                <Text style={[styles.typeButtonText, { color: taskType === 'simple' ? '#fff' : colors.foreground }]}>단순 할일</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, { borderColor: colors.border }, taskType === 'deadline' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setTaskType('deadline')}
              >
                <Calendar size={16} color={taskType === 'deadline' ? '#fff' : colors.foreground} />
                <Text style={[styles.typeButtonText, { color: taskType === 'deadline' ? '#fff' : colors.foreground }]}>:諼한 설정</Text>
              </TouchableOpacity>
            </View>

            {/* �기한 설정 */}
            {taskType === 'deadline' && (
              <View style={styles.deadlineSection}>
                <Text style={[styles.deadlineLabel, { color: colors.foreground }]}>횄자</Text>
                <View style={styles.optionsRow}>
                  {dateOptions.map((o, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.optionButton, { borderColor: colors.border }, isSameDay(selectedDate, o.value) && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setSelectedDate(o.value)}
                    >
                      <Text style={[styles.optionText, { color: isSameDay(selectedDate, o.value) ? '#fff' : colors.foreground }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.deadlineLabel, { color: colors.foreground, marginTop: 16 }]}>시간</Text>
                <View style={styles.optionsRow}>
                  {timeOptions.map((o, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.optionButton, { borderColor: colors.border }, selectedTime === o.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setSelectedTime(o.value)}
                    >
                      <Text style={[styles.optionText, { color: selectedTime === o.value ? '#fff' : colors.foreground }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={handleAddTask}>
              <Text style={styles.addButtonText}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  appName: { fontSize: 20, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { fontSize: 14, marginRight: 8 },
  headerButton: { padding: 6 },
  content: { flex: 1 },
  goalsSection: { margin: 16, padding: 16, borderRadius: 12 },
  lifeGoalContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lifeGoalText: { fontSize: 16, fontWeight: '600', flex: 1 },
  subGoalContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  subGoalText: { fontSize: 14, flex: 1 },
  tasksSection: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  emptyState: { padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  taskItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8 },
  taskItemOverdue: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  taskItemCompleted: { opacity: 0.7 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkboxCompleted: { borderWidth: 0 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '500' },
  taskTitleCompleted: { textDecorationLine: 'line-through', flex: 1 },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  dueDateText: { fontSize: 12 },
  deleteButton: { padding: 8 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  typeButtonText: { fontSize: 14, fontWeight: '500' },
  deadlineSection: { marginBottom: 16 },
  deadlineLabel: { fontSize: 14, fontWeight: '500', marginBottom: 10 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  optionText: { fontSize: 13, fontWeight: '500' },
  addButton: { padding: 16, borderRadius: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});