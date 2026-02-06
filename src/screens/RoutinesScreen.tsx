import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Clock, X, Check } from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Routine, RoutineItem } from '../types';
import PinnedGoals from '../components/PinnedGoals';

const ROUTINE_TYPES = [
  { value: 'MORNING', label: '아침', color: '#f59e0b' },
  { value: 'AFTERNOON', label: '오후', color: '#3b82f6' },
  { value: 'EVENING', label: '저녁', color: '#f97316' },
  { value: 'NIGHT', label: '밤', color: '#8b5cf6' },
  { value: 'CUSTOM', label: '커스텀', color: '#6366f1' },
];

export default function RoutinesScreen() {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [selectedType, setSelectedType] = useState('MORNING');
  const [newItems, setNewItems] = useState<string[]>(['']);

  const fetchRoutines = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      setRoutines(data || []);
    } catch (error) { console.error('Routines fetch error:', error); }
  };

  useEffect(() => { fetchRoutines(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchRoutines(); setRefreshing(false); };

  const openAddModal = () => {
    setEditingRoutine(null);
    setNewRoutineName('');
    setSelectedType('MORNING');
    setNewItems(['']);
    setShowModal(true);
  };

  const openEditModal = (routine: Routine) => {
    setEditingRoutine(routine);
    setNewRoutineName(routine.name);
    setSelectedType(routine.type);
    setNewItems(routine.items?.map((item) => item.name) || ['']);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!newRoutineName.trim()) { Alert.alert('오류', '루틴 이름을 입력해주세요'); return; }
    try {
      const items = newItems.filter((item) => item.trim()).map((name) => ({ name }));
      if (editingRoutine) {
        await api.updateRoutine(editingRoutine.id, { name: newRoutineName, type: selectedType, items: items.length > 0 ? items : undefined });
      } else {
        await api.createRoutine({ name: newRoutineName, type: selectedType, items: items.length > 0 ? items : undefined });
      }
      resetModal();
      fetchRoutines();
    } catch (error) { Alert.alert('오류', '저장에 실패했습니다'); }
  };

  const handleToggleItem = async (routineId: string, itemIndex: number) => {
    // 즉시 UI 업데이트 (Optimistic Update)
    const prevRoutines = [...routines];
    setRoutines(routines.map(r => {
      if (r.id !== routineId) return r;
      const completed = r.completedItemsToday || [];
      const newCompleted = completed.includes(itemIndex)
        ? completed.filter(i => i !== itemIndex)
        : [...completed, itemIndex];
      return { ...r, completedItemsToday: newCompleted };
    }));
    try { await api.toggleRoutineItem(routineId, itemIndex); }
    catch (error) {
      setRoutines(prevRoutines); // 실패 시 원복
      Alert.alert('오류', '업데이트에 실패했습니다');
    }
  };

  const handleLongPress = (routine: Routine) => {
    Alert.alert(routine.name, '어떤 작업을 하시겠습니까?', [
      { text: '수정', onPress: () => openEditModal(routine) },
      { text: '삭제', style: 'destructive', onPress: () => {
        Alert.alert('삭제', '이 루틴을 삭제하시겠습니까?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
            try { await api.deleteRoutine(routine.id); fetchRoutines(); }
            catch (error) { Alert.alert('오류', '삭제에 실패했습니다'); }
          }},
        ]);
      }},
      { text: '취소', style: 'cancel' },
    ]);
  };

  const resetModal = () => { setShowModal(false); setEditingRoutine(null); setNewRoutineName(''); setSelectedType('MORNING'); setNewItems(['']); };
  const addItemField = () => { setNewItems([...newItems, '']); };
  const updateItemField = (index: number, value: string) => { const u = [...newItems]; u[index] = value; setNewItems(u); };
  const getTypeInfo = (type: string) => ROUTINE_TYPES.find((t) => t.value === type) || ROUTINE_TYPES[4];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>루틴</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <PinnedGoals />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
      >
        {routines.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Clock size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>루틴을 추가해보세요</Text>
          </View>
        ) : (
          routines.map((routine) => {
            const typeInfo = getTypeInfo(routine.type);
            const completedItems = routine.completedItemsToday || [];
            const totalItems = routine.items?.length || 0;
            const progress = totalItems > 0 ? completedItems.length / totalItems : 0;

            return (
              <View key={routine.id} style={[styles.routineCard, { backgroundColor: colors.card }]}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.routineHeader}
                  onLongPress={() => handleLongPress(routine)}
                >
                  <View style={styles.routineInfo}>
                    <Text style={[styles.routineName, { color: colors.foreground }]}>{routine.name}</Text>
                    <Text style={[styles.routineMeta, { color: colors.mutedForeground }]}>{typeInfo.label} · {completedItems.length}/{totalItems}</Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                  <View style={[styles.progressFill, { backgroundColor: typeInfo.color, width: `${progress * 100}%` }]} />
                </View>

                {routine.items && routine.items.length > 0 && (
                  <View style={styles.itemsList}>
                    {routine.items.map((item: RoutineItem, index: number) => {
                      const isCompleted = completedItems.includes(index);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.7}
                          style={[styles.itemRow, { borderBottomWidth: index < routine.items!.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }]}
                          onPress={() => handleToggleItem(routine.id, index)}
                        >
                          <View style={[styles.itemCheck, { backgroundColor: isCompleted ? '#22c55e' : 'transparent', borderColor: isCompleted ? '#22c55e' : colors.border }]}>
                            {isCompleted && <Check size={10} color="#fff" />}
                          </View>
                          <Text style={[styles.itemName, { color: isCompleted ? colors.mutedForeground : colors.foreground, textDecorationLine: isCompleted ? 'line-through' : 'none' }]}>{item.name}</Text>
                          {item.duration && <Text style={[styles.itemDuration, { color: colors.mutedForeground }]}>{item.duration}분</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingRoutine ? '루틴 수정' : '새 루틴'}</Text>
              <TouchableOpacity onPress={resetModal}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="루틴 이름"
              placeholderTextColor={colors.mutedForeground}
              value={newRoutineName}
              onChangeText={setNewRoutineName}
              autoFocus
            />

            <Text style={[styles.label, { color: colors.foreground }]}>유형</Text>
            <View style={styles.typeRow}>
              {ROUTINE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.typeOption, { backgroundColor: selectedType === type.value ? type.color + '15' : colors.background, borderColor: selectedType === type.value ? type.color : colors.border }]}
                  onPress={() => setSelectedType(type.value)}
                >
                  <Text style={[styles.typeLabel, { color: selectedType === type.value ? type.color : colors.foreground }]}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>항목</Text>
            <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={false}>
              {newItems.map((item, index) => (
                <TextInput
                  key={index}
                  style={[styles.itemInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                  placeholder={`항목 ${index + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                  value={item}
                  onChangeText={(v) => updateItemField(index, v)}
                />
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.addItemBtn, { borderColor: colors.border }]} onPress={addItemField}>
              <Plus size={14} color={colors.primary} />
              <Text style={[styles.addItemText, { color: colors.primary }]}>항목 추가</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit}>
              <Text style={styles.submitText}>{editingRoutine ? '수정' : '추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  empty: { padding: 32, borderRadius: 10, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  routineCard: { padding: 12, borderRadius: 10, marginBottom: 8 },
  routineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  routineInfo: { flex: 1 },
  routineName: { fontSize: 14, fontWeight: '600' },
  routineMeta: { fontSize: 11, marginTop: 2 },
  progressBg: { height: 4, borderRadius: 2, marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 2 },
  itemsList: {},
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  itemCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  itemName: { flex: 1, fontSize: 13 },
  itemDuration: { fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  typeLabel: { fontSize: 12, fontWeight: '500' },
  itemInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 6 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', marginBottom: 12, gap: 4 },
  addItemText: { fontSize: 13, fontWeight: '500' },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
