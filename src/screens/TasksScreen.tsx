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
import { Plus, CheckCircle2, Circle, X, Calendar, Flag } from 'lucide-react-native';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme, getPriorityColor } from '../lib/theme';
import { api } from '../lib/api';
import { Task, Priority } from '../types';

export default function TasksScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('MEDIUM');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  const fetchTasks = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data || []);
    } catch (error) {
      console.error('Tasks fetch error:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

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

    try {
      await api.createTask({
        title: newTaskTitle,
        priority: newTaskPriority,
      });
      setNewTaskTitle('');
      setNewTaskPriority('MEDIUM');
      setShowModal(false);
      fetchTasks();
    } catch (error) {
      Alert.alert('오류', '할일 추가에 실패했습니다');
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      await api.updateTask(task.id, { isCompleted: !task.isCompleted });
      fetchTasks();
    } catch (error) {
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>할 일</Text>
        <TouchableOpacity
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
              {f === 'active' ? '진행중' : f === 'completed' ? '완료' : '전체'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 할일 목록 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
      >
        {filteredTasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle2 size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {filter === 'completed' ? '완료된 할일이 없습니다' : '할일이 없습니다'}
            </Text>
          </View>
        ) : (
          filteredTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.taskCard, { backgroundColor: colors.card }]}
              onPress={() => handleToggleTask(task)}
              onLongPress={() => handleDeleteTask(task.id)}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: task.isCompleted ? '#22c55e' : 'transparent',
                    borderColor: task.isCompleted
                      ? '#22c55e'
                      : getPriorityColor(task.priority),
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
                      color: task.isCompleted
                        ? colors.mutedForeground
                        : colors.foreground,
                      textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {task.title}
                </Text>
                <View style={styles.taskMeta}>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: getPriorityColor(task.priority) + '20' },
                    ]}
                  >
                    <Flag size={10} color={getPriorityColor(task.priority)} />
                    <Text
                      style={[
                        styles.priorityText,
                        { color: getPriorityColor(task.priority) },
                      ]}
                    >
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
          ))
        )}
      </ScrollView>

      {/* 추가 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                새 할일 추가
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
              placeholder="할일을 입력하세요"
              placeholderTextColor={colors.mutedForeground}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />

            <Text style={[styles.label, { color: colors.foreground }]}>우선순위</Text>
            <View style={styles.priorityRow}>
              {priorities.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityOption,
                    {
                      backgroundColor:
                        newTaskPriority === p
                          ? getPriorityColor(p)
                          : colors.secondary,
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
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleAddTask}
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
});
