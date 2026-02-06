import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Alert, Modal, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Plus, Trash2, Bell, BellOff, X, Calendar, Clock, AlertCircle } from 'lucide-react-native';
import { format, addDays, startOfWeek, addWeeks, isToday, isBefore, parseISO, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { lockScreenService, formatTasksForNotification } from '../lib/lockscreen';
import { Task } from '../types';
import PinnedGoals from '../components/PinnedGoals';

type TaskType = 'simple' | 'deadline';
interface DateOption { label: string; value: Date; }
interface TimeOption { label: string; value: string; }

export default function SimpleHomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
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
      const tasksRes = await api.getTasks();
      setTasks(tasksRes || []);
    } catch (e) { console.error(e); }
  }, []);

  const checkAndStartLockscreen = useCallback(async () => {
    try {
      const running = await lockScreenService.isServiceRunning();
      setLockscreenEnabled(running);
      // 이전에 활성화했었다면 자동으로 서비스 시작
      if (!running) {
        await lockScreenService.startService('오늘의 할일', '할일을 불러오는 중...');
        setLockscreenEnabled(true);
      }
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); checkAndStartLockscreen(); }, [fetchData, checkAndStartLockscreen]));

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
      Alert.alert('오류', '할일 추가에 실패했습니다.');
    }
  };

  const handleToggleTask = async (t: Task) => {
    // 즉시 UI 업데이트 (Optimistic Update)
    const prevTasks = [...tasks];
    setTasks(tasks.map(task => task.id === t.id ? { ...task, isCompleted: !task.isCompleted } : task));
    try {
      await api.updateTask(t.id, { isCompleted: !t.isCompleted });
    } catch (e) {
      setTasks(prevTasks); // 실패 시 원복
      Alert.alert('오류', '상태 변경 실패');
    }
  };

  const handleLongPress = (t: Task) => {
    Alert.alert(t.title, '어떤 작업을 하시겠습니까?', [
      { text: '삭제', style: 'destructive', onPress: () => {
        Alert.alert('삭제', '이 할일을 삭제할까요?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
            try { await api.deleteTask(t.id); fetchData(); } catch (e) { Alert.alert('오류', '삭제 실패'); }
          }},
        ]);
      }},
      { text: '취소', style: 'cancel' },
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

  const incompleteTasks = tasks.filter(t => !t.isCompleted);
  const completedTasks = tasks.filter(t => t.isCompleted);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.dateText, { color: colors.foreground }]}>
            {format(today, 'M월 d일 EEEE', { locale: ko })}
          </Text>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {incompleteTasks.length > 0 ? `${incompleteTasks.length}개 남음` : '모두 완료!'}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={toggleLockscreen}>
          {lockscreenEnabled ? <Bell size={18} color={colors.primary} /> : <BellOff size={18} color={colors.mutedForeground} />}
        </TouchableOpacity>
      </View>

      <PinnedGoals />

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
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
                activeOpacity={0.7}
                style={[styles.taskItem, { backgroundColor: colors.card, borderLeftColor: o ? '#ef4444' : 'transparent', borderLeftWidth: o ? 3 : 0 }]}
                onPress={() => handleToggleTask(t)}
                onLongPress={() => handleLongPress(t)}
              >
                <View style={[styles.checkbox, { borderColor: o ? '#ef4444' : colors.border }]} />
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, { color: colors.foreground }]}>{t.title}</Text>
                  {di && (
                    <View style={styles.dueDateRow}>
                      {o ? <AlertCircle size={11} color="#ef4444" /> : <Clock size={11} color={di.isUrgent ? colors.primary : colors.mutedForeground} />}
                      <Text style={[styles.dueDateText, { color: o ? '#ef4444' : di.isUrgent ? colors.primary : colors.mutedForeground }]}>{di.text}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {completedTasks.length > 0 && (
          <View style={styles.completedSection}>
            <Text style={[styles.completedTitle, { color: colors.mutedForeground }]}>완료 ({completedTasks.length})</Text>
            {completedTasks.slice(0, 5).map(t => (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.7}
                style={[styles.taskItem, styles.taskDone, { backgroundColor: colors.card }]}
                onPress={() => handleToggleTask(t)}
                onLongPress={() => handleLongPress(t)}
              >
                <View style={[styles.checkbox, styles.checkboxDone, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Check size={12} color="#fff" />
                </View>
                <Text style={[styles.taskTitle, styles.taskTitleDone, { color: colors.mutedForeground }]}>{t.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowAddModal(true)}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>할일 추가</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={22} color={colors.mutedForeground} />
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

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, taskType === 'simple' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setTaskType('simple')}
              >
                <Text style={[styles.typeBtnText, { color: taskType === 'simple' ? '#fff' : colors.foreground }]}>단순</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, taskType === 'deadline' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setTaskType('deadline')}
              >
                <Calendar size={14} color={taskType === 'deadline' ? '#fff' : colors.foreground} />
                <Text style={[styles.typeBtnText, { color: taskType === 'deadline' ? '#fff' : colors.foreground }]}>기한</Text>
              </TouchableOpacity>
            </View>

            {taskType === 'deadline' && (
              <View style={styles.deadlineSection}>
                <Text style={[styles.deadlineLabel, { color: colors.foreground }]}>날짜</Text>
                <View style={styles.optionsRow}>
                  {dateOptions.map((o, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.optionBtn, { borderColor: colors.border }, isSameDay(selectedDate, o.value) && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setSelectedDate(o.value)}
                    >
                      <Text style={[styles.optionText, { color: isSameDay(selectedDate, o.value) ? '#fff' : colors.foreground }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.deadlineLabel, { color: colors.foreground, marginTop: 12 }]}>시간</Text>
                <View style={styles.optionsRow}>
                  {timeOptions.map((o, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.optionBtn, { borderColor: colors.border }, selectedTime === o.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setSelectedTime(o.value)}
                    >
                      <Text style={[styles.optionText, { color: selectedTime === o.value ? '#fff' : colors.foreground }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleAddTask}>
              <Text style={styles.addBtnText}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 16, fontWeight: '700' },
  countText: { fontSize: 12, marginTop: 2 },
  headerBtn: { padding: 8 },
  content: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  emptyState: { padding: 24, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  emptyText: { fontSize: 13 },
  taskItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  taskDone: { opacity: 0.6 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxDone: { borderWidth: 0 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskTitleDone: { textDecorationLine: 'line-through' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  dueDateText: { fontSize: 11 },
  completedSection: { marginTop: 12 },
  completedTitle: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 8, borderWidth: 1 },
  typeBtnText: { fontSize: 13, fontWeight: '500' },
  deadlineSection: { marginBottom: 12 },
  deadlineLabel: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  optionText: { fontSize: 12, fontWeight: '500' },
  addBtn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
