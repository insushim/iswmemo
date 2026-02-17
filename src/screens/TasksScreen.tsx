import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, CheckCircle2, Circle, X, Calendar, Flag, Trash2, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, getPriorityColor } from '../lib/theme';

import { Swipeable } from 'react-native-gesture-handler';
import VoiceInput from '../components/VoiceInput';
import { api } from '../lib/api';
import { Task, Priority } from '../types';

export default function TasksScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('MEDIUM');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchTasks = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data || []);
    } catch (error) {
      console.error('Tasks fetch error:', error);
    }
  };

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchTasks(); } }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('오류', '할일 제목을 입력해주세요');
      return;
    }

    if (editingTask) {
      await handleSubmitEdit();
      return;
    }

    const title = newTaskTitle.trim();
    const priority = newTaskPriority;

    const tempId = `temp-${Date.now()}`;
    const tempTask = { id: tempId, title, priority, isCompleted: false, createdAt: new Date().toISOString() } as any;
    setTasks(prev => [tempTask, ...prev]);
    setNewTaskTitle('');
    setNewTaskPriority('MEDIUM');
    setShowModal(false);

    try {
      const created = await api.createTask({ title, priority }) as any;
      if (created?.id) {
        setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: created.id } : t));
      }
    } catch (error) {
      // 서버에 생성됐을 수 있으므로, 다시 불러와서 동기화
      try { await fetchTasks(); } catch {}
    }
  };

  const handleToggleTask = async (task: Task) => {
    const prevTasks = [...tasks];
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t));
    try {
      await api.updateTask(task.id, { isCompleted: !task.isCompleted });
    } catch (error) {
      setTasks(prevTasks);
      Alert.alert('오류', '할일 업데이트에 실패했습니다');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    Alert.alert('삭제', '이 할일을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(taskId);
            fetchTasks();
          } catch (error) {
            Alert.alert('오류', '삭제에 실패했습니다');
          }
        },
      },
    ]);
  };


  const renderLeftActions = (task: Task) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeCopyBtn} onPress={() => {
          Clipboard.setStringAsync(task.title);
          swipeableRefs.current.get(task.id)?.close();
        }}>
          <Copy size={20} color="#fff" />
          <Text style={styles.swipeCopyText}>복사</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (task: Task) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => handleDeleteTask(task.id)}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setNewTaskPriority(task.priority || 'MEDIUM');
    setShowModal(true);
  };

  const handleSubmitEdit = async () => {
    if (!editingTask || !newTaskTitle.trim()) return;
    const title = newTaskTitle.trim();
    const editId = editingTask.id;
    setTasks(prev => prev.map(t => t.id === editId ? { ...t, title, priority: newTaskPriority } : t));
    setEditingTask(null);
    setShowModal(false);
    setNewTaskTitle('');
    try {
      await api.updateTask(editId, { title, priority: newTaskPriority });
    } catch (error) {
      Alert.alert('오류', '수정에 실패했습니다');
      fetchTasks();
    }
  };


  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return !task.isCompleted;
    if (filter === 'completed') return task.isCompleted;
    return true;
  });

  const priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const priorityLabels: Record<Priority, string> = {
    LOW: '낮음',
    MEDIUM: '보통',
    HIGH: '높음',
    URGENT: '긴급',
  };

  const cardStyle = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>할 일</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          delayPressIn={0}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {(['active', 'all', 'completed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            activeOpacity={0.7}
            delayPressIn={0}
            style={[
              styles.filterButton,
              {
                backgroundColor: filter === f ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: filter === f ? colors.primary : colors.cardBorder,
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
              {f === 'active' ? '진행중' : f === 'completed' ? '완료' : '전체'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 할일 목록 */}
      <DraggableFlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }: { data: Task[] }) => setTasks(data)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          filteredTasks.length > 0 ? (
            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>꾹 눌러 드래그 | ← 밀어서 삭제</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, cardStyle]}>
            <CheckCircle2 size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {filter === 'completed' ? '완료된 할일이 없습니다' : '할일이 없습니다'}
            </Text>
          </View>
        }
        renderItem={({ item: task, drag, isActive }: RenderItemParams<Task>) => (
          <ScaleDecorator>
            <Swipeable
              ref={(ref) => { if (ref) swipeableRefs.current.set(task.id, ref); }}
              renderLeftActions={renderLeftActions(task)}
              renderRightActions={renderRightActions(task)}
              overshootLeft={false}
              overshootRight={false}
              leftThreshold={15}
              rightThreshold={40}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                delayPressIn={0}
                style={[
                  styles.taskCard,
                  cardStyle,
                  { borderLeftWidth: 3, borderLeftColor: getPriorityColor(task.priority), opacity: isActive ? 0.8 : 1 }
                ]}
                onPress={() => handleToggleTask(task)}
                onLongPress={drag}
                disabled={isActive}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: task.isCompleted ? '#22c55e' : 'transparent',
                      borderColor: task.isCompleted ? '#22c55e' : getPriorityColor(task.priority),
                    },
                  ]}
                >
                  {task.isCompleted && <CheckCircle2 size={14} color="#fff" />}
                </View>
                <View style={styles.taskContent}>
                  <Text
                    style={[
                      styles.taskTitle,
                      {
                        color: task.isCompleted ? colors.mutedForeground : colors.foreground,
                        textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                        fontSize: scaledFont(15),
                        textAlign,
                      },
                    ]}
                  >
                    {task.title}
                  </Text>
                  <View style={styles.taskMeta}>
                    <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) + '20' }]}>
                      <Flag size={10} color={getPriorityColor(task.priority)} />
                      <Text style={[styles.priorityText, { color: getPriorityColor(task.priority) }]}>
                        {priorityLabels[task.priority]}
                      </Text>
                    </View>
                    {task.dueDate && (
                      <View style={styles.dueDateContainer}>
                        <Calendar size={10} color={colors.mutedForeground} />
                        <Text style={[styles.dueDate, { color: colors.mutedForeground }]}>
                          {format(new Date(task.dueDate), 'M/d', { locale: ko })}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </Swipeable>
          </ScaleDecorator>
        )}
      />

      {/* 추가 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingTask ? '할일 수정' : '새 할일 추가'}
              </Text>
              <TouchableOpacity activeOpacity={0.7} delayPressIn={0} onPress={() => { setShowModal(false); setEditingTask(null); }}>
                <X size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    flex: 1,
                    backgroundColor: colors.secondary,
                    color: colors.foreground,
                    borderColor: colors.border,
                    marginBottom: 0,
                    minHeight: 50,
                    maxHeight: 100,
                    textAlignVertical: 'center',
                  },
                ]}
                placeholder="할일을 입력하세요"
                placeholderTextColor={colors.mutedForeground}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                multiline
                blurOnSubmit={false}
                autoFocus
              />
              <VoiceInput color={colors.primary} onResult={(text) => setNewTaskTitle(prev => prev ? prev + ' ' + text : text)} />
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>우선순위</Text>
            <View style={styles.priorityRow}>
              {priorities.map((p) => (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.7}
                  delayPressIn={0}
                  style={[
                    styles.priorityOption,
                    {
                      backgroundColor:
                        newTaskPriority === p
                          ? getPriorityColor(p)
                          : colors.secondary,
                      borderWidth: 1,
                      borderColor: newTaskPriority === p ? getPriorityColor(p) : colors.border,
                    },
                  ]}
                  onPress={() => setNewTaskPriority(p)}
                >
                  <Text
                    style={[
                      styles.priorityOptionText,
                      { color: newTaskPriority === p ? '#fff' : colors.foreground },
                    ]}
                  >
                    {priorityLabels[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              delayPressIn={0}
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleAddTask}
            >
              <Text style={styles.submitText}>{editingTask ? '수정' : '추가'}</Text>
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
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueDate: {
    fontSize: 11,
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
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  priorityOptionText: {
    fontSize: 13,
    fontWeight: '500',
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
  hintRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 4, marginBottom: 4 },
  hintText: { fontSize: 10 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 10 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  swipeCopy: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 10 },
  swipeCopyBtn: { backgroundColor: '#3b82f6', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeCopyText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
