import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, Keyboard, Animated, ScrollView } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable, TouchableOpacity as GHTouchable } from 'react-native-gesture-handler';
import { Plus, X, Calendar, Clock, AlertCircle, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { format, addDays, isBefore, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Task } from '../types';
import { useSettingsStore } from '../store/settings';
import { scheduleTaskAlarm, cancelTaskAlarm } from '../lib/taskAlarm';
import GoalBanner from '../components/GoalBanner';
import VoiceInput from '../components/VoiceInput';


const TASKS_CACHE_KEY = 'cached_tasks_v1';

type TaskType = 'simple' | 'deadline';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function SimpleHomeScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const { taskAlarmEnabled } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('simple');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [isAM, setIsAM] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  const to24Hour = (hour12: number, am: boolean): number => {
    if (am) return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const from24Hour = (hour24: number): { hour: number; am: boolean } => {
    if (hour24 === 0) return { hour: 12, am: true };
    if (hour24 < 12) return { hour: hour24, am: true };
    if (hour24 === 12) return { hour: 12, am: false };
    return { hour: hour24 - 12, am: false };
  };

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(TASKS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTasks(parsed);
          }
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const tasksRes = await api.getTasks();
      const filtered = (tasksRes || []).filter((t: Task) => !t.isCompleted);
      setTasks(filtered);
      // 캐시 저장
      SecureStore.setItemAsync(TASKS_CACHE_KEY, JSON.stringify(filtered)).catch(() => {});
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchData(); } }, [fetchData]));

  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, [fetchData]);

  const openAddModal = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setTaskType('simple');
    setSelectedDate(new Date());
    // 현재 시간으로 초기화
    const now = new Date();
    const { hour, am } = from24Hour(now.getHours());
    setSelectedHour(hour);
    setSelectedMinute(now.getMinutes());
    setIsAM(am);
    setCalendarMonth(new Date());
    setShowAddModal(true);
  };

  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setNewTaskTitle(t.title);
    if (t.dueDate) {
      setTaskType('deadline');
      const d = parseISO(t.dueDate);
      setSelectedDate(d);
      setCalendarMonth(d);
      if (t.dueTime) {
        const [h, m] = t.dueTime.split(':');
        const { hour, am } = from24Hour(parseInt(h));
        setSelectedHour(hour);
        setIsAM(am);
        setSelectedMinute(parseInt(m));
      } else {
        setSelectedHour(9);
        setSelectedMinute(0);
        setIsAM(true);
      }
    } else {
      setTaskType('simple');
    }
    setShowAddModal(true);
  };

  const handleSubmit = async () => {
    if (!newTaskTitle.trim()) return;
    const td: any = { title: newTaskTitle.trim() };
    if (taskType === 'deadline') {
      const hour24 = to24Hour(selectedHour, isAM);
      const dd = new Date(selectedDate);
      dd.setHours(hour24, selectedMinute, 0, 0);
      if (dd.getTime() < Date.now()) {
        Alert.alert('오류', '현재 시간보다 이전 시간은 설정할 수 없습니다');
        return;
      }
      td.dueDate = dd.toISOString();
      td.dueTime = `${String(hour24).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
    }
    const isEditing = !!editingTask;
    const editId = editingTask?.id;

    // 즉시 UI 업데이트 (Optimistic Update)
    setShowAddModal(false);
    Keyboard.dismiss();
    let tempId = '';
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempTask = { id: tempId, ...td, isCompleted: false, createdAt: new Date().toISOString() } as any;
      setTasks(prev => [tempTask, ...prev]);
    } else {
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...td } : t));
    }
    setNewTaskTitle('');
    setEditingTask(null);
    setTaskType('simple');

    // 백그라운드 API 호출
    try {
      if (isEditing && editId) {
        await api.updateTask(editId, td);
        // 알람은 별도 try/catch (실패해도 할일은 이미 저장됨)
        try {
          if (taskType === 'deadline' && td.dueDate && taskAlarmEnabled) {
            await scheduleTaskAlarm(editId, td.title, new Date(td.dueDate), 'task');
          } else {
            await cancelTaskAlarm(editId);
          }
        } catch {}
      } else {
        td.isCompleted = false;
        const created = await api.createTask(td) as any;
        if (created?.id && tempId) {
          setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: created.id } : t));
        }
        // 알람은 별도 try/catch (실패해도 할일은 이미 저장됨)
        try {
          if (taskType === 'deadline' && td.dueDate && taskAlarmEnabled && created?.id) {
            await scheduleTaskAlarm(created.id, td.title, new Date(td.dueDate), 'task');
          }
        } catch {}
      }
    } catch (e) {
      // 서버에 생성됐을 수 있으므로, 다시 불러와서 동기화
      try { await fetchData(); } catch {}
    }
  };

  const handleDelete = (t: Task) => {
    Alert.alert('삭제', `"${t.title}" 삭제할까요?`, [
      { text: '취소', style: 'cancel', onPress: () => {
        swipeableRefs.current.get(t.id)?.close();
      }},
      { text: '삭제', style: 'destructive', onPress: async () => {
        setTasks(prev => prev.filter(task => task.id !== t.id));
        await cancelTaskAlarm(t.id);
        try {
          await api.deleteTask(t.id);
        } catch (e) {
          fetchData();
          Alert.alert('오류', '삭제 실패');
        }
      }},
    ]);
  };


  const renderLeftActions = (t: Task) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeCopyBtn} onPress={() => {
          Clipboard.setStringAsync(t.title);
          swipeableRefs.current.get(t.id)?.close();
        }}>
          <Copy size={20} color="#fff" />
          <Text style={styles.swipeCopyText}>복사</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (t: Task) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => handleDelete(t)}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const isOverdue = (t: Task): boolean => {
    if (!t.dueDate) return false;
    return isBefore(parseISO(t.dueDate), new Date());
  };

  const getDueDateInfo = (t: Task): { text: string; isUrgent: boolean } | null => {
    if (!t.dueDate) return null;
    const d = parseISO(t.dueDate);
    const n = new Date();
    if (isSameDay(d, n)) return { text: `오늘 ${t.dueTime || ''}`, isUrgent: true };
    if (isSameDay(d, addDays(n, 1))) return { text: `내일 ${t.dueTime || ''}`, isUrgent: false };
    if (isBefore(d, n)) return { text: '기한 지남', isUrgent: true };
    return { text: format(d, 'M/d (E)', { locale: ko }) + (t.dueTime ? ` ${t.dueTime}` : ''), isUrgent: false };
  };

  const getCalendarDays = () => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start);
    const paddingDays = Array.from({ length: startDayOfWeek }, () => null);
    return [...paddingDays, ...days];
  };

  const closeAllSwipeables = () => {
    swipeableRefs.current.forEach((ref) => ref?.close());
  };

  const renderTaskItem = ({ item: t, drag, isActive }: RenderItemParams<Task>) => {
    const di = getDueDateInfo(t);
    const o = isOverdue(t);
    return (
      <ScaleDecorator>
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.current.set(t.id, ref); }}
          renderLeftActions={renderLeftActions(t)}
          renderRightActions={renderRightActions(t)}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={40}
          rightThreshold={40}
          friction={2}
          containerStyle={{ flex: 1 }}
        >
          <GHTouchable
            activeOpacity={0.7}
            style={[
              styles.taskItem,
              { backgroundColor: colors.card, paddingVertical: cardPadding, paddingHorizontal: cardPadding + 2, opacity: isActive ? 0.8 : 1 },
              o && { borderLeftColor: colors.mutedForeground, borderLeftWidth: 3, opacity: 0.6 },
            ]}
            onPress={() => openEditModal(t)}
            onLongPress={() => { closeAllSwipeables(); drag(); }}
            enabled={!isActive}
          >
            <View style={styles.taskContent}>
              <Text style={[styles.taskTitle, { color: o ? colors.mutedForeground : colors.foreground, fontSize: scaledFont(14), textAlign, textDecorationLine: o ? 'line-through' : 'none' }]}>{t.title}</Text>
              {di && (
                <View style={[styles.dueDateRow, textAlign === 'center' && { justifyContent: 'center' }]}>
                  {o ? <AlertCircle size={11} color={colors.mutedForeground} /> : <Clock size={11} color={di.isUrgent ? colors.primary : colors.mutedForeground} />}
                  <Text style={[styles.dueDateText, { color: o ? colors.mutedForeground : di.isUrgent ? colors.primary : colors.mutedForeground, fontSize: scaledFont(11) }]}>{di.text}</Text>
                </View>
              )}
            </View>
          </GHTouchable>
        </Swipeable>
      </ScaleDecorator>
    );
  };

  const ListHeader = () => (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Text style={[styles.countText, { color: colors.mutedForeground }]}>
        {tasks.length > 0 ? `할일 ${tasks.length}개 남음` : '모두 완료!'}
      </Text>
      <Text style={[styles.hintText, { color: colors.mutedForeground }]}>→ 복사 | ← 삭제 | 꾹 드래그</Text>
    </View>
  );

  const calendarDays = getCalendarDays();
  const today = new Date();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <GoalBanner />
      <DraggableFlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTaskItem}
        onDragEnd={({ data }: { data: Task[] }) => setTasks(data)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>할일이 없습니다</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAddModal}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingTask ? '할일 수정' : '할일 추가'}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 0, minHeight: 40, maxHeight: 100, textAlignVertical: 'center' }]}
                placeholder="할일을 입력하세요"
                placeholderTextColor={colors.mutedForeground}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                autoFocus
                multiline
                blurOnSubmit={false}
              />
              <VoiceInput color={colors.primary} onResult={(text) => setNewTaskTitle(prev => prev ? prev + ' ' + text : text)} />
            </View>

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
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {/* 캘린더 */}
                <View style={styles.calendarSection}>
                  <View style={styles.calendarHeader}>
                    <TouchableOpacity onPress={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                      <ChevronLeft size={20} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={[styles.calendarMonthText, { color: colors.foreground }]}>
                      {format(calendarMonth, 'yyyy년 M월', { locale: ko })}
                    </Text>
                    <TouchableOpacity onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                      <ChevronRight size={20} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.weekdayRow}>
                    {WEEKDAYS.map((d, i) => (
                      <Text key={i} style={[styles.weekdayText, { color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : colors.mutedForeground }]}>{d}</Text>
                    ))}
                  </View>

                  <View style={styles.calendarGrid}>
                    {calendarDays.map((day, i) => {
                      if (!day) return <View key={`pad-${i}`} style={styles.calendarCell} />;
                      const isSelected = isSameDay(day, selectedDate);
                      const isToday = isSameDay(day, today);
                      const dayOfWeek = getDay(day);
                      return (
                        <TouchableOpacity
                          key={day.toISOString()}
                          style={[
                            styles.calendarCell,
                            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                            isToday && !isSelected && { borderColor: colors.primary },
                          ]}
                          onPress={() => setSelectedDate(day)}
                        >
                          <Text style={[
                            styles.calendarDayText,
                            { color: isSelected ? '#fff' : dayOfWeek === 0 ? '#ef4444' : dayOfWeek === 6 ? '#3b82f6' : colors.foreground },
                          ]}>
                            {format(day, 'd')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 시간 선택 - 휠 방식 */}
                <View style={styles.timePickerSection}>
                  <View style={[styles.timeDisplay, { backgroundColor: colors.primary + '15' }]}>
                    <Clock size={16} color={colors.primary} />
                    <Text style={[styles.timeDisplayText, { color: colors.foreground }]}>
                      {isAM ? '오전' : '오후'} {selectedHour}:{String(selectedMinute).padStart(2, '0')}
                    </Text>
                  </View>

                  <View style={styles.wheelRow}>
                    {/* 오전/오후 */}
                    <View style={styles.wheelColumn}>
                      <Text style={[styles.wheelLabel, { color: colors.mutedForeground }]}>오전/오후</Text>
                      <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setIsAM(!isAM)}>
                          <ChevronUp size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                        <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                            {isAM ? '오전' : '오후'}
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setIsAM(!isAM)}>
                          <ChevronDown size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 시 */}
                    <View style={styles.wheelColumn}>
                      <Text style={[styles.wheelLabel, { color: colors.mutedForeground }]}>시</Text>
                      <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setSelectedHour(prev => prev === 12 ? 1 : prev + 1)}>
                          <ChevronUp size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                        <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                            {selectedHour}
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setSelectedHour(prev => prev === 1 ? 12 : prev - 1)}>
                          <ChevronDown size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={[styles.wheelColon, { color: colors.foreground }]}>:</Text>

                    {/* 분 */}
                    <View style={styles.wheelColumn}>
                      <Text style={[styles.wheelLabel, { color: colors.mutedForeground }]}>분</Text>
                      <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setSelectedMinute(prev => prev === 59 ? 0 : prev + 1)}>
                          <ChevronUp size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                        <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.wheelValueText, { color: colors.primary }]}>
                            {String(selectedMinute).padStart(2, '0')}
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.wheelArrow} onPress={() => setSelectedMinute(prev => prev === 0 ? 59 : prev - 1)}>
                          <ChevronDown size={22} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* 5분 단위 빠른 선택 */}
                  <View style={styles.quickMinuteRow}>
                    {[0, 5, 10, 15, 30, 45].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.quickMinuteBtn, { borderColor: colors.border }, selectedMinute === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => setSelectedMinute(m)}
                      >
                        <Text style={[styles.quickMinuteText, { color: selectedMinute === m ? '#fff' : colors.foreground }]}>
                          {String(m).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity style={[styles.addBtnModal, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
              <Text style={styles.addBtnText}>{editingTask ? '수정' : '추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 12 },
  header: { paddingVertical: 10, borderBottomWidth: 0.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  countText: { fontSize: 12 },
  hintText: { fontSize: 10 },
  emptyState: { padding: 24, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  emptyText: { fontSize: 13 },
  taskItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, marginBottom: 4 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  dueDateText: { fontSize: 11 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 4 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  swipeCopy: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 4 },
  swipeCopyBtn: { backgroundColor: '#3b82f6', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeCopyText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  typeSelector: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 8, borderWidth: 1 },
  typeBtnText: { fontSize: 13, fontWeight: '500' },
  // 캘린더
  calendarSection: { marginBottom: 12 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  calendarMonthText: { fontSize: 15, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '500' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, height: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 20 },
  calendarDayText: { fontSize: 13, fontWeight: '500' },
  // 시간 선택 - 휠
  timePickerSection: { marginBottom: 8 },
  timeDisplay: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  timeDisplayText: { fontSize: 16, fontWeight: '600' },
  wheelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 12 },
  wheelColumn: { alignItems: 'center' },
  wheelLabel: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
  wheelBox: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', alignItems: 'center', width: 80 },
  wheelArrow: { paddingVertical: 6, alignItems: 'center', width: '100%' },
  wheelValue: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  wheelValueText: { fontSize: 22, fontWeight: '700' },
  wheelColon: { fontSize: 24, fontWeight: '700', marginBottom: 36 },
  quickMinuteRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  quickMinuteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  quickMinuteText: { fontSize: 12, fontWeight: '500' },
  addBtnModal: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
