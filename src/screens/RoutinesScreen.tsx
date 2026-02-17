import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Modal, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, Clock, X, Check, Trash2 } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Routine, RoutineItem } from '../types';
import GoalBanner from '../components/GoalBanner';
import VoiceInput from '../components/VoiceInput';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

const ROUTINES_CACHE_KEY = 'cached_routines_v1';

const ROUTINE_TYPES = [
  { value: 'MORNING', label: '아침', color: '#f59e0b' },
  { value: 'AFTERNOON', label: '오후', color: '#3b82f6' },
  { value: 'EVENING', label: '저녁', color: '#f97316' },
  { value: 'NIGHT', label: '밤', color: '#8b5cf6' },
  { value: 'CUSTOM', label: '기타', color: '#6366f1' },
];

export default function RoutinesScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [selectedType, setSelectedType] = useState<string>('MORNING');
  const [newItems, setNewItems] = useState<string[]>(['']);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(ROUTINES_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRoutines(parsed);
          }
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchRoutines = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      setRoutines(data || []);
      SecureStore.setItemAsync(ROUTINES_CACHE_KEY, JSON.stringify(data || [])).catch(() => {});
    } catch (error) { console.error('Routines fetch error:', error); }
  };

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchRoutines(); } }, []));

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
    const isEditing = !!editingRoutine;
    const editId = editingRoutine?.id;
    const name = newRoutineName.trim();
    const items = newItems.filter((item) => item.trim()).map((n) => ({ name: n }));

    // 즉시 UI 업데이트 (Optimistic Update)
    resetModal();
    let tempId = '';
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const tempRoutine = { id: tempId, name, type: selectedType, items: items.length > 0 ? items : [], completedItemsToday: [], createdAt: new Date().toISOString() } as any;
      setRoutines(prev => [tempRoutine, ...prev]);
    } else {
      setRoutines(prev => prev.map(r => r.id === editId ? { ...r, name, type: selectedType, items: items.length > 0 ? items : r.items } : r));
    }

    try {
      if (isEditing && editId) {
        await api.updateRoutine(editId, { name, type: selectedType, items: items.length > 0 ? items : undefined });
      } else {
        const created = await api.createRoutine({ name, type: selectedType, items: items.length > 0 ? items : undefined }) as any;
        if (created?.id && tempId) {
          setRoutines(prev => prev.map(r => r.id === tempId ? { ...r, id: created.id } : r));
        }
      }
    } catch (error) {
      Alert.alert('오류', '저장에 실패했습니다');
      fetchRoutines();
    }
  };

  const renderRightActions = (routine: Routine) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => {
          Alert.alert('삭제', '이 루틴을 삭제하시겠습니까?', [
            { text: '취소', style: 'cancel', onPress: () => swipeableRefs.current.get(routine.id)?.close() },
            { text: '삭제', style: 'destructive', onPress: async () => {
              try { await api.deleteRoutine(routine.id); fetchRoutines(); }
              catch (error) { Alert.alert('오류', '삭제에 실패했습니다'); }
            }},
          ]);
        }}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
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

  const resetModal = () => { setShowModal(false); setEditingRoutine(null); setNewRoutineName(''); setSelectedType('MORNING'); setNewItems(['']); };
  const addItemField = () => { setNewItems([...newItems, '']); };
  const updateItemField = (index: number, value: string) => { const u = [...newItems]; u[index] = value; setNewItems(u); };
  const getTypeInfo = (type: string) => ROUTINE_TYPES.find((t) => t.value === type) || ROUTINE_TYPES[4];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <GoalBanner />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>루틴</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddModal}>
          <Plus size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={routines}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }: { data: Routine[] }) => setRoutines(data)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Clock size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>루틴을 추가해보세요</Text>
          </View>
        }
        ListHeaderComponent={
          routines.length > 0 ? <Text style={[styles.hintText, { color: colors.mutedForeground }]}>꾹 눌러 드래그 | ← 밀어서 삭제</Text> : null
        }
        ListFooterComponent={<View style={{ height: 20 }} />}
        renderItem={({ item: routine, drag, isActive }: RenderItemParams<Routine>) => {
          const completedItems = routine.completedItemsToday || [];
          const totalItems = routine.items?.length || 0;
          const progress = totalItems > 0 ? completedItems.length / totalItems : 0;
          return (
            <ScaleDecorator>
              <Swipeable
                ref={(ref) => { if (ref) swipeableRefs.current.set(routine.id, ref); }}
                renderRightActions={renderRightActions(routine)}
                overshootRight={false}
                rightThreshold={40}
              >
                <View style={[styles.routineCard, { backgroundColor: colors.card, padding: cardPadding, opacity: isActive ? 0.8 : 1 }]}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.routineHeader}
                    onLongPress={drag}
                    onPress={() => openEditModal(routine)}
                  >
                    <View style={styles.routineInfo}>
                      <Text style={[styles.routineName, { color: colors.foreground, fontSize: scaledFont(14), textAlign }]}>{routine.name}</Text>
                      <Text style={[styles.routineMeta, { color: colors.mutedForeground, fontSize: scaledFont(11) }]}>{completedItems.length}/{totalItems} 완료</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
                    <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` as any }]} />
                  </View>

                  {routine.items && routine.items.length > 0 && (
                    <View style={styles.itemsList}>
                      {routine.items.map((item: RoutineItem, index: number) => {
                        const isCompleted = completedItems.includes(index);
                        return (
                          <TouchableOpacity
                            key={item.id || `item-${index}`}
                            activeOpacity={0.7}
                            style={[styles.itemRow, { borderBottomWidth: index < routine.items!.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }]}
                            onPress={() => handleToggleItem(routine.id, index)}
                          >
                            <View style={[styles.itemCheck, { backgroundColor: isCompleted ? '#22c55e' : 'transparent', borderColor: isCompleted ? '#22c55e' : colors.border }]}>
                              {isCompleted && <Check size={10} color="#fff" />}
                            </View>
                            <Text style={[styles.itemName, { color: isCompleted ? colors.mutedForeground : colors.foreground, textDecorationLine: isCompleted ? 'line-through' : 'none', fontSize: scaledFont(13) }]}>{item.name}</Text>
                            {item.duration && <Text style={[styles.itemDuration, { color: colors.mutedForeground }]}>{item.duration}분</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </Swipeable>
            </ScaleDecorator>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingRoutine ? '루틴 수정' : '새 루틴'}</Text>
              <TouchableOpacity onPress={resetModal}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 0, minHeight: 40, maxHeight: 100, textAlignVertical: 'center' }]}
                placeholder="루틴 이름"
                placeholderTextColor={colors.mutedForeground}
                value={newRoutineName}
                onChangeText={setNewRoutineName}
                autoFocus
                multiline
                blurOnSubmit={false}
              />
              <VoiceInput color={colors.primary} onResult={(text) => setNewRoutineName(prev => prev ? prev + ' ' + text : text)} />
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
  hintText: { fontSize: 10, textAlign: 'right', paddingHorizontal: 4, marginBottom: 4 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 8 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
