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
import { Plus, Clock, X, Check, Sun, Moon, Sunset, Coffee } from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Routine, RoutineItem } from '../types';

const ROUTINE_TYPES = [
  { value: 'MORNING', label: '아침', icon: Sun, color: '#f59e0b' },
  { value: 'AFTERNOON', label: '오후', icon: Coffee, color: '#3b82f6' },
  { value: 'EVENING', label: '저녁', icon: Sunset, color: '#f97316' },
  { value: 'NIGHT', label: '밤', icon: Moon, color: '#8b5cf6' },
  { value: 'CUSTOM', label: '커스텀', icon: Clock, color: '#6366f1' },
];

export default function RoutinesScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [selectedType, setSelectedType] = useState('MORNING');
  const [newItems, setNewItems] = useState<string[]>(['']);

  const fetchRoutines = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      setRoutines(data || []);
    } catch (error) {
      console.error('Routines fetch error:', error);
    }
  };

  useEffect(() => {
    fetchRoutines();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRoutines();
    setRefreshing(false);
  };

  const handleAddRoutine = async () => {
    if (!newRoutineName.trim()) {
      Alert.alert('오류', '루틴 이름을 입력해주세요');
      return;
    }

    try {
      const items = newItems
        .filter((item) => item.trim())
        .map((name) => ({ name }));

      await api.createRoutine({
        name: newRoutineName,
        type: selectedType,
        items: items.length > 0 ? items : undefined,
      });
      resetModal();
      fetchRoutines();
    } catch (error) {
      Alert.alert('오류', '루틴 추가에 실패했습니다');
    }
  };

  const handleToggleItem = async (routineId: string, itemIndex: number) => {
    try {
      await api.toggleRoutineItem(routineId, itemIndex);
      fetchRoutines();
    } catch (error) {
      Alert.alert('오류', '업데이트에 실패했습니다');
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    Alert.alert('삭제', '이 루틴을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteRoutine(routineId);
            fetchRoutines();
          } catch (error) {
            Alert.alert('오류', '삭제에 실패했습니다');
          }
        },
      },
    ]);
  };

  const resetModal = () => {
    setShowModal(false);
    setNewRoutineName('');
    setSelectedType('MORNING');
    setNewItems(['']);
  };

  const addItemField = () => {
    setNewItems([...newItems, '']);
  };

  const updateItemField = (index: number, value: string) => {
    const updated = [...newItems];
    updated[index] = value;
    setNewItems(updated);
  };

  const getTypeInfo = (type: string) => {
    return ROUTINE_TYPES.find((t) => t.value === type) || ROUTINE_TYPES[4];
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
        <Text style={[styles.title, { color: colors.foreground }]}>루틴</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          delayPressIn={0}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 루틴 목록 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
      >
        {routines.length === 0 ? (
          <View style={[styles.emptyContainer, cardStyle]}>
            <Clock size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              루틴을 추가해보세요
            </Text>
          </View>
        ) : (
          routines.map((routine) => {
            const typeInfo = getTypeInfo(routine.type);
            const TypeIcon = typeInfo.icon;
            const completedItems = routine.completedItemsToday || [];
            const totalItems = routine.items?.length || 0;
            const progress = totalItems > 0 ? completedItems.length / totalItems : 0;

            return (
              <View
                key={routine.id}
                style={[
                  styles.routineCard,
                  cardStyle,
                  { borderLeftWidth: 3, borderLeftColor: typeInfo.color }
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  delayPressIn={0}
                  style={styles.routineHeader}
                  onLongPress={() => handleDeleteRoutine(routine.id)}
                >
                  <View style={[styles.typeIcon, { backgroundColor: typeInfo.color + '20' }]}>
                    <TypeIcon size={20} color={typeInfo.color} />
                  </View>
                  <View style={styles.routineInfo}>
                    <Text style={[styles.routineName, { color: colors.foreground }]}>
                      {routine.name}
                    </Text>
                    <Text style={[styles.routineType, { color: colors.mutedForeground }]}>
                      {typeInfo.label} · {completedItems.length}/{totalItems}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* 진행률 바 */}
                <View style={[styles.progressBar, { backgroundColor: colors.secondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: typeInfo.color, width: `${progress * 100}%` },
                    ]}
                  />
                </View>

                {/* 아이템 목록 */}
                {routine.items && routine.items.length > 0 && (
                  <View style={styles.itemsList}>
                    {routine.items.map((item: RoutineItem, index: number) => {
                      const isCompleted = completedItems.includes(index);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.7}
                          delayPressIn={0}
                          style={[
                            styles.itemRow,
                            { borderBottomWidth: index < routine.items!.length - 1 ? 1 : 0, borderBottomColor: colors.border }
                          ]}
                          onPress={() => handleToggleItem(routine.id, index)}
                        >
                          <View
                            style={[
                              styles.itemCheck,
                              {
                                backgroundColor: isCompleted ? '#22c55e' : colors.secondary,
                                borderColor: isCompleted ? '#22c55e' : colors.border,
                              },
                            ]}
                          >
                            {isCompleted && <Check size={12} color="#fff" />}
                          </View>
                          <Text
                            style={[
                              styles.itemName,
                              {
                                color: isCompleted ? colors.mutedForeground : colors.foreground,
                                textDecorationLine: isCompleted ? 'line-through' : 'none',
                              },
                            ]}
                          >
                            {item.name}
                          </Text>
                          {item.duration && (
                            <Text style={[styles.itemDuration, { color: colors.mutedForeground }]}>
                              {item.duration}분
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 추가 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                새 루틴 추가
              </Text>
              <TouchableOpacity activeOpacity={0.7} delayPressIn={0} onPress={resetModal}>
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
              placeholder="루틴 이름"
              placeholderTextColor={colors.mutedForeground}
              value={newRoutineName}
              onChangeText={setNewRoutineName}
            />

            <Text style={[styles.label, { color: colors.foreground }]}>유형</Text>
            <View style={styles.typeRow}>
              {ROUTINE_TYPES.map((type) => {
                const TypeIcon = type.icon;
                return (
                  <TouchableOpacity
                    key={type.value}
                    activeOpacity={0.7}
                    delayPressIn={0}
                    style={[
                      styles.typeOption,
                      {
                        backgroundColor:
                          selectedType === type.value ? type.color + '20' : colors.secondary,
                        borderColor: selectedType === type.value ? type.color : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedType(type.value)}
                  >
                    <TypeIcon size={18} color={type.color} />
                    <Text
                      style={[
                        styles.typeLabel,
                        { color: selectedType === type.value ? type.color : colors.foreground },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>항목</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              {newItems.map((item, index) => (
                <TextInput
                  key={index}
                  style={[
                    styles.itemInput,
                    {
                      backgroundColor: colors.secondary,
                      color: colors.foreground,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder={`항목 ${index + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                  value={item}
                  onChangeText={(value) => updateItemField(index, value)}
                />
              ))}
            </ScrollView>
            <TouchableOpacity
              activeOpacity={0.7}
              delayPressIn={0}
              style={[styles.addItemButton, { borderColor: colors.border }]}
              onPress={addItemField}
            >
              <Plus size={16} color={colors.primary} />
              <Text style={[styles.addItemText, { color: colors.primary }]}>항목 추가</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              delayPressIn={0}
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleAddRoutine}
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
  routineCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  routineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  routineInfo: {
    flex: 1,
  },
  routineName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  routineType: {
    fontSize: 13,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  itemsList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
  },
  itemDuration: {
    fontSize: 12,
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
    maxHeight: '85%',
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    gap: 6,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  itemInput: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 8,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 6,
  },
  addItemText: {
    fontSize: 14,
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
