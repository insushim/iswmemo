import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, StickyNote, X, Search, Trash2, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Note } from '../types';
import GoalBanner from '../components/GoalBanner';
import VoiceInput from '../components/VoiceInput';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

const COLORS = ['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#f3e8ff', '#fed7aa'];
const NOTES_CACHE_KEY = 'cached_notes_v1';

export default function NotesScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const hasLoadedRef = useRef(false);

  // 캐시에서 즉시 로드
  useEffect(() => {
    const loadCached = async () => {
      try {
        const cached = await SecureStore.getItemAsync(NOTES_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNotes(parsed);
          }
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchNotes = async () => {
    try {
      const response = await api.getNotes();
      // API가 { notes, pagination } 형식으로 응답할 수 있음
      const data = Array.isArray(response) ? response : (response as any).notes;
      setNotes(data || []);
      SecureStore.setItemAsync(NOTES_CACHE_KEY, JSON.stringify(data || [])).catch(() => {});
    } catch (error) {
      console.error('Notes fetch error:', error);
    }
  };

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchNotes(); } }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotes();
    setRefreshing(false);
  };

  const handleSaveNote = async () => {
    if (saving) return;
    if (!noteContent.trim()) {
      Alert.alert('오류', '메모 내용을 입력해주세요');
      return;
    }
    setSaving(true);

    const autoTitle = noteContent.trim().split('\n')[0].slice(0, 20) || '메모';
    const isEditing = !!editingNote;
    const editId = editingNote?.id;
    const content = noteContent;
    const color = selectedColor;

    // 모달 즉시 닫기
    resetModal();

    // 낙관적 업데이트 - UI 즉시 반영
    let tempId = '';
    if (isEditing && editId) {
      setNotes(prev => prev.map(n => n.id === editId ? { ...n, title: autoTitle, content, color, updatedAt: new Date().toISOString() } : n));
    } else {
      tempId = `temp-${Date.now()}`;
      const tempNote: Note = {
        id: tempId,
        title: autoTitle,
        content,
        isPinned: false,
        isArchived: false,
        isFavorite: false,
        color,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setNotes(prev => [...prev, tempNote]);
    }

    // 백그라운드에서 서버 동기화
    try {
      if (isEditing && editId) {
        await api.updateNote(editId, { title: autoTitle, content, color });
      } else {
        const created = await api.createNote({ title: autoTitle, content, color }) as any;
        if (created?.id && tempId) {
          setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: created.id } : n));
        }
      }
    } catch (error) {
      Alert.alert('오류', '메모 저장에 실패했습니다');
      fetchNotes();
    } finally {
      setSaving(false);
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setNoteContent(note.content || '');
    setSelectedColor(note.color || COLORS[0]);
    setShowModal(true);
  };

  const handleDeleteNote = async (noteId: string) => {
    Alert.alert('삭제', '이 메모를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setNotes(prev => prev.filter(n => n.id !== noteId));
          try {
            await api.deleteNote(noteId);
          } catch (error) {
            Alert.alert('오류', '삭제에 실패했습니다');
            fetchNotes();
          }
        },
      },
    ]);
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingNote(null);
    setNoteContent('');
    setSelectedColor(COLORS[0]);
  };

  const renderLeftActions = (note: Note) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeCopyBtn} onPress={() => {
          Clipboard.setStringAsync(note.content || note.title);
          swipeableRefs.current.get(note.id)?.close();
        }}>
          <Copy size={20} color="#fff" />
          <Text style={styles.swipeCopyText}>복사</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (note: Note) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => handleDeleteNote(note.id)}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <GoalBanner />
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>메모</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowModal(true)}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 검색 */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="메모 검색..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* 메모 목록 */}
      <DraggableFlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onDragEnd={({ data }: { data: Note[] }) => setNotes(data)}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          filteredNotes.length > 0 ? (
            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>꾹 눌러 드래그 | ← 밀어서 삭제</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <StickyNote size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {searchQuery ? '검색 결과가 없습니다' : '메모를 추가해보세요'}
            </Text>
          </View>
        }
        renderItem={({ item: note, drag, isActive }: RenderItemParams<Note>) => (
          <ScaleDecorator>
            <Swipeable
              ref={(ref) => { if (ref) swipeableRefs.current.set(note.id, ref); }}
              renderLeftActions={renderLeftActions(note)}
              renderRightActions={renderRightActions(note)}
              overshootLeft={false}
              overshootRight={false}
              leftThreshold={15}
              rightThreshold={15}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.noteCard,
                  { backgroundColor: note.color || COLORS[0], padding: cardPadding + 2, opacity: isActive ? 0.8 : 1 },
                ]}
                onPress={() => handleEditNote(note)}
                onLongPress={drag}
                disabled={isActive}
              >
                <Text style={[styles.noteContent, { fontSize: scaledFont(13), textAlign }]}>
                  {note.content || note.title}
                </Text>
                <Text style={styles.noteDate}>
                  {format(new Date(note.updatedAt), 'M월 d일', { locale: ko })}
                </Text>
              </TouchableOpacity>
            </Swipeable>
          </ScaleDecorator>
        )}
      />

      {/* 추가/수정 모달 */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingNote ? '메모 수정' : '새 메모'}
              </Text>
              <TouchableOpacity onPress={resetModal}>
                <X size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    flex: 1,
                    backgroundColor: colors.secondary,
                    color: colors.foreground,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="내용을 입력하세요..."
                placeholderTextColor={colors.mutedForeground}
                value={noteContent}
                onChangeText={setNoteContent}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <View style={{ paddingTop: 4 }}>
                <VoiceInput
                  color={colors.primary}
                  onResult={(text) => setNoteContent(prev => prev ? prev + ' ' + text : text)}
                />
              </View>
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
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}
              onPress={handleSaveNote}
              disabled={saving}
            >
              <Text style={styles.submitText}>
                {editingNote ? '수정' : '저장'}
              </Text>
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
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
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
  noteCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 0,
  },
  noteContent: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: 19,
    flex: 1,
  },
  noteDate: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 8,
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
    maxHeight: '80%',
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
    marginBottom: 12,
  },
  textArea: {
    height: 150,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
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
  hintRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 4, marginBottom: 6 },
  hintText: { fontSize: 10 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 8 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  swipeCopy: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 8 },
  swipeCopyBtn: { backgroundColor: '#3b82f6', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeCopyText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
