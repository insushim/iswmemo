import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, Animated, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, X, Clock, MapPin, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Share2, Bell, BellOff, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { format, isSameDay, parseISO, addDays, subDays, isBefore, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { Routine } from '../types';
import { useSettingsStore } from '../store/settings';
import { scheduleTaskAlarm, cancelTaskAlarm } from '../lib/taskAlarm';
import GoalBanner from '../components/GoalBanner';
import VoiceInput from '../components/VoiceInput';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

const SCHEDULE_CACHE_KEY = 'cached_schedules_v1';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface ScheduleMeta {
  date: string; // YYYY-MM-DD
  place?: string;
  notify?: boolean;
}

function parseScheduleMeta(desc: string | null): ScheduleMeta | null {
  if (!desc) return null;
  try {
    const parsed = JSON.parse(desc);
    if (parsed && parsed.date) return parsed;
  } catch {}
  return null;
}

function getScheduleTime(routine: Routine): string {
  return routine.startTime || '00:00';
}

function getScheduleDate(routine: Routine): string {
  const meta = parseScheduleMeta(routine.description);
  return meta?.date || format(new Date(), 'yyyy-MM-dd');
}

export default function ScheduleScreen() {
  const { colors, scaledFont, cardPadding, textAlign } = useTheme();
  const { scheduleAlarmEnabled } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [schedules, setSchedules] = useState<Routine[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Routine | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventPlace, setEventPlace] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventHour, setEventHour] = useState(9);
  const [eventMinute, setEventMinute] = useState(0);
  const [eventIsAM, setEventIsAM] = useState(true);
  const [eventNotify, setEventNotify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventCalendarMonth, setEventCalendarMonth] = useState(new Date());
  const [showTopCalendar, setShowTopCalendar] = useState(false);
  const [topCalendarMonth, setTopCalendarMonth] = useState(new Date());
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
        const cached = await SecureStore.getItemAsync(SCHEDULE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setSchedules(parsed);
        }
      } catch {}
    };
    loadCached();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await api.getRoutines();
      const data = Array.isArray(response) ? response : response.routines;
      setSchedules(data || []);
      SecureStore.setItemAsync(SCHEDULE_CACHE_KEY, JSON.stringify(data || [])).catch(() => {});
    } catch (error) {
      console.error('Schedule fetch error:', error);
    }
  };

  useFocusEffect(useCallback(() => { if (!hasLoadedRef.current) { hasLoadedRef.current = true; fetchSchedules(); } }, []));
  const onRefresh = async () => { setRefreshing(true); await fetchSchedules(); setRefreshing(false); };

  // 선택된 날짜의 일정만 필터 + 시간순 정렬
  const todaySchedules = schedules
    .filter(s => {
      const meta = parseScheduleMeta(s.description);
      if (meta?.date) return meta.date === format(selectedDate, 'yyyy-MM-dd');
      return false;
    })
    .sort((a, b) => getScheduleTime(a).localeCompare(getScheduleTime(b)));

  // 날짜가 없는 일정 (레거시 루틴)
  const legacySchedules = schedules.filter(s => !parseScheduleMeta(s.description));

  const getCalendarDays = (month: Date) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start);
    const paddingDays = Array.from({ length: startDayOfWeek }, () => null);
    return [...paddingDays, ...days];
  };

  const openAddModal = () => {
    setEditingSchedule(null);
    setEventName('');
    setEventPlace('');
    setEventDate(selectedDate);
    setEventCalendarMonth(selectedDate);
    const now = new Date();
    const { hour, am } = from24Hour(now.getHours());
    setEventHour(hour);
    setEventMinute(now.getMinutes());
    setEventIsAM(am);
    setEventNotify(true);
    setShowModal(true);
  };

  const openEditModal = (schedule: Routine) => {
    setEditingSchedule(schedule);
    setEventName(schedule.name);
    const meta = parseScheduleMeta(schedule.description);
    setEventPlace(meta?.place || '');
    const ed = meta?.date ? parseISO(meta.date) : new Date();
    setEventDate(ed);
    setEventCalendarMonth(ed);
    setEventNotify(meta?.notify !== false);
    if (schedule.startTime) {
      const [h, m] = schedule.startTime.split(':');
      const { hour, am } = from24Hour(parseInt(h));
      setEventHour(hour);
      setEventMinute(parseInt(m));
      setEventIsAM(am);
    }
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!eventName.trim()) { Alert.alert('오류', '일정 이름을 입력해주세요'); return; }
    if (isSubmitting) return;
    setIsSubmitting(true);

    const hour24 = to24Hour(eventHour, eventIsAM);
    const startTime = `${String(hour24).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')}`;
    const dateStr = format(eventDate, 'yyyy-MM-dd');
    const meta: ScheduleMeta = { date: dateStr, place: eventPlace.trim() || undefined, notify: eventNotify };
    const payload = {
      name: eventName.trim(),
      description: JSON.stringify(meta),
      type: 'CUSTOM' as any,
      startTime,
    };

    const isEditing = !!editingSchedule;
    const editId = editingSchedule?.id;

    // Optimistic update
    setShowModal(false);
    let tempId = '';
    if (!isEditing) {
      tempId = `temp-${Date.now()}`;
      const temp = { id: tempId, ...payload, items: [], completedItemsToday: [], isActive: true, endTime: null, createdAt: new Date().toISOString() } as any;
      setSchedules(prev => [temp, ...prev]);
    } else {
      setSchedules(prev => prev.map(s => s.id === editId ? { ...s, ...payload } : s));
    }

    try {
      if (isEditing && editId) {
        await api.updateRoutine(editId, payload);
        // 알림 스케줄
        if (eventNotify && scheduleAlarmEnabled) {
          const alarmDate = new Date(`${dateStr}T${startTime}:00`);
          if (alarmDate.getTime() > Date.now()) {
            await scheduleTaskAlarm(editId, payload.name, alarmDate, 'schedule');
          }
        } else {
          await cancelTaskAlarm(editId);
        }
      } else {
        const created = await api.createRoutine(payload) as any;
        if (created?.id && tempId) {
          setSchedules(prev => prev.map(s => s.id === tempId ? { ...s, id: created.id } : s));
          // 알림 스케줄
          if (eventNotify && scheduleAlarmEnabled) {
            const alarmDate = new Date(`${dateStr}T${startTime}:00`);
            if (alarmDate.getTime() > Date.now()) {
              await scheduleTaskAlarm(created.id, payload.name, alarmDate, 'schedule');
            }
          }
        }
      }
    } catch {
      Alert.alert('오류', '저장에 실패했습니다');
      fetchSchedules();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (schedule: Routine) => {
    Alert.alert('삭제', `"${schedule.name}" 삭제할까요?`, [
      { text: '취소', style: 'cancel', onPress: () => swipeableRefs.current.get(schedule.id)?.close() },
      { text: '삭제', style: 'destructive', onPress: async () => {
        const prev = [...schedules];
        setSchedules(s => s.filter(x => x.id !== schedule.id));
        await cancelTaskAlarm(schedule.id);
        try { await api.deleteRoutine(schedule.id); }
        catch { setSchedules(prev); Alert.alert('오류', '삭제에 실패했습니다'); }
      }},
    ]);
  };

  const handleShare = (schedule: Routine) => {
    const meta = parseScheduleMeta(schedule.description);
    const dateStr = meta?.date ? format(parseISO(meta.date), 'yyyy년 M월 d일 (EEEE)', { locale: ko }) : '';
    const timeStr = schedule.startTime || '';
    const placeStr = meta?.place ? `장소: ${meta.place}\n` : '';
    const message = `📅 또박또박 일정 공유\n\n일정: ${schedule.name}\n날짜: ${dateStr}\n시간: ${timeStr}\n${placeStr}\n또박또박 앱에서 확인하세요!`;
    Share.share({ message });
  };

  const handleShareToday = () => {
    const dayStr = format(selectedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko });
    let message = `📅 또박또박 - ${dayStr} 일정\n`;

    if (allDisplayed.length > 0) {
      allDisplayed.forEach(s => {
        const meta = parseScheduleMeta(s.description);
        const time = s.startTime ? formatTime12(s.startTime) : '';
        const place = meta?.place ? ` @ ${meta.place}` : '';
        message += `\n• ${time ? time + ' ' : ''}${s.name}${place}`;
      });
    } else {
      message += `\n일정이 없습니다.`;
    }

    message += `\n\n또박또박 앱에서 확인하세요!`;
    Share.share({ message });
  };

  const renderLeftActions = (schedule: Routine) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.5, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeCopy, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeCopyBtn} onPress={() => {
          const meta = parseScheduleMeta(schedule.description);
          const time = schedule.startTime ? formatTime12(schedule.startTime) : '';
          const place = meta?.place ? ` (${meta.place})` : '';
          Clipboard.setStringAsync(`${time ? time + ' ' : ''}${schedule.name}${place}`);
          swipeableRefs.current.get(schedule.id)?.close();
        }}>
          <Copy size={20} color="#fff" />
          <Text style={styles.swipeCopyText}>복사</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (schedule: Routine) => (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
        <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => handleDelete(schedule)}>
          <Trash2 size={20} color="#fff" />
          <Text style={styles.swipeDeleteText}>삭제</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const formatTime12 = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const { hour, am } = from24Hour(h);
    return `${am ? '오전' : '오후'} ${hour}:${String(m).padStart(2, '0')}`;
  };

  const isPast = (schedule: Routine) => {
    const meta = parseScheduleMeta(schedule.description);
    if (!meta?.date || !schedule.startTime) return false;
    const dt = new Date(`${meta.date}T${schedule.startTime}:00`);
    return dt.getTime() < Date.now();
  };

  const allDisplayed = [...todaySchedules, ...(format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? legacySchedules : [])];

  const renderItem = ({ item: schedule, drag, isActive }: RenderItemParams<Routine>) => {
    const meta = parseScheduleMeta(schedule.description);
    const past = isPast(schedule);
    return (
      <ScaleDecorator>
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.current.set(schedule.id, ref); }}
          renderLeftActions={renderLeftActions(schedule)}
          renderRightActions={renderRightActions(schedule)}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={40}
          rightThreshold={40}
          friction={2}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.scheduleCard, { backgroundColor: colors.card, padding: cardPadding, opacity: isActive ? 0.8 : past ? 0.5 : 1 }]}
            onPress={() => openEditModal(schedule)}
            onLongPress={drag}
            disabled={isActive}
          >
            <View style={styles.scheduleCenter}>
              <Text style={[styles.scheduleName, { color: past ? colors.mutedForeground : colors.foreground, fontSize: scaledFont(14), textAlign, textDecorationLine: past ? 'line-through' : 'none' }]}>
                {schedule.name}
              </Text>
              {meta?.place && (
                <View style={[styles.placeRow, textAlign === 'center' && { justifyContent: 'center' }]}>
                  <MapPin size={11} color={colors.mutedForeground} />
                  <Text style={[styles.placeText, { color: colors.mutedForeground, fontSize: scaledFont(11) }]}>{meta.place}</Text>
                </View>
              )}
            </View>
            <View style={styles.scheduleRight}>
              {schedule.startTime && (
                <Text style={[styles.timeText, { color: past ? colors.mutedForeground : colors.primary, fontSize: scaledFont(12) }]}>
                  {formatTime12(schedule.startTime)}
                </Text>
              )}
              <TouchableOpacity onPress={() => handleShare(schedule)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 2 }}>
                <Share2 size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Swipeable>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <GoalBanner />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>일정</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary }]} onPress={handleShareToday}>
            <Share2 size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddModal}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 날짜 네비게이션 */}
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { setSelectedDate(subDays(selectedDate, 1)); setShowTopCalendar(false); }}>
          <ChevronLeft size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setShowTopCalendar(!showTopCalendar); setTopCalendarMonth(selectedDate); }}>
          <Text style={[styles.dateNavText, { color: colors.foreground }]}>
            {isSameDay(selectedDate, new Date()) ? '오늘' : format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}
            {showTopCalendar ? ' ▲' : ' ▼'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSelectedDate(addDays(selectedDate, 1)); setShowTopCalendar(false); }}>
          <ChevronRight size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* 펼침 달력 */}
      {showTopCalendar && (
        <View style={[styles.topCalendar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => setTopCalendarMonth(subMonths(topCalendarMonth, 1))}>
              <ChevronLeft size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setSelectedDate(new Date()); setTopCalendarMonth(new Date()); }}>
              <Text style={[styles.calendarMonthText, { color: colors.foreground, fontSize: 14 }]}>
                {format(topCalendarMonth, 'yyyy년 M월', { locale: ko })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTopCalendarMonth(addMonths(topCalendarMonth, 1))}>
              <ChevronRight size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={[styles.weekdayText, { color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : colors.mutedForeground }]}>{d}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {getCalendarDays(topCalendarMonth).map((day, i) => {
              if (!day) return <View key={`pad-${i}`} style={styles.calendarCell} />;
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              const dayOfWeek = getDay(day);
              // 해당 날짜에 일정 있는지 확인
              const hasEvent = schedules.some(s => {
                const m = parseScheduleMeta(s.description);
                return m?.date === format(day, 'yyyy-MM-dd');
              });
              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={[
                    styles.calendarCell,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { borderColor: colors.primary },
                  ]}
                  onPress={() => { setSelectedDate(day); setShowTopCalendar(false); }}
                >
                  <Text style={[
                    styles.calendarDayText,
                    { color: isSelected ? '#fff' : dayOfWeek === 0 ? '#ef4444' : dayOfWeek === 6 ? '#3b82f6' : colors.foreground },
                  ]}>
                    {format(day, 'd')}
                  </Text>
                  {hasEvent && !isSelected && <View style={[styles.eventDot, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <DraggableFlatList
        data={allDisplayed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }: { data: Routine[] }) => {
          // Merge reordered items back
          const ids = new Set(data.map(d => d.id));
          setSchedules(prev => [...data, ...prev.filter(s => !ids.has(s.id))]);
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          allDisplayed.length > 0 ? <Text style={[styles.hintText, { color: colors.mutedForeground }]}>→ 복사 | ← 삭제 | 꾹 드래그</Text> : null
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Clock size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>이 날 일정이 없습니다</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 20 }} />}
      />

      {/* 추가/수정 모달 */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingSchedule ? '일정 수정' : '새 일정'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><X size={22} color={colors.mutedForeground} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* 일정 이름 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 0 }]}
                  placeholder="일정 이름"
                  placeholderTextColor={colors.mutedForeground}
                  value={eventName}
                  onChangeText={setEventName}
                  autoFocus
                />
                <VoiceInput color={colors.primary} onResult={(text) => setEventName(prev => prev ? prev + ' ' + text : text)} />
              </View>

              {/* 장소 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MapPin size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, marginBottom: 0 }]}
                  placeholder="장소 (선택)"
                  placeholderTextColor={colors.mutedForeground}
                  value={eventPlace}
                  onChangeText={setEventPlace}
                />
              </View>

              {/* 달력으로 날짜 선택 */}
              <Text style={[styles.label, { color: colors.foreground }]}>날짜</Text>
              <View style={styles.calendarSection}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => setEventCalendarMonth(subMonths(eventCalendarMonth, 1))}>
                    <ChevronLeft size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={[styles.calendarMonthText, { color: colors.foreground }]}>
                    {format(eventCalendarMonth, 'yyyy년 M월', { locale: ko })}
                  </Text>
                  <TouchableOpacity onPress={() => setEventCalendarMonth(addMonths(eventCalendarMonth, 1))}>
                    <ChevronRight size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map((d, i) => (
                    <Text key={i} style={[styles.weekdayText, { color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : colors.mutedForeground }]}>{d}</Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {getCalendarDays(eventCalendarMonth).map((day, i) => {
                    if (!day) return <View key={`pad-${i}`} style={styles.calendarCell} />;
                    const isSelected = isSameDay(day, eventDate);
                    const isToday = isSameDay(day, new Date());
                    const dayOfWeek = getDay(day);
                    return (
                      <TouchableOpacity
                        key={day.toISOString()}
                        style={[
                          styles.calendarCell,
                          isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                          isToday && !isSelected && { borderColor: colors.primary },
                        ]}
                        onPress={() => setEventDate(day)}
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
              <Text style={[styles.label, { color: colors.foreground, marginTop: 12 }]}>시간</Text>
              <View style={styles.wheelRow}>
                {/* 오전/오후 */}
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventIsAM(!eventIsAM)}>
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.wheelValueText, { color: colors.primary }]}>{eventIsAM ? '오전' : '오후'}</Text>
                    </View>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventIsAM(!eventIsAM)}>
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
                {/* 시 */}
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventHour(prev => prev === 12 ? 1 : prev + 1)}>
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.wheelValueText, { color: colors.primary }]}>{eventHour}</Text>
                    </View>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventHour(prev => prev === 1 ? 12 : prev - 1)}>
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[styles.wheelColon, { color: colors.foreground }]}>:</Text>
                {/* 분 */}
                <View style={styles.wheelColumn}>
                  <View style={[styles.wheelBox, { borderColor: colors.border }]}>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventMinute(prev => prev === 59 ? 0 : prev + 1)}>
                      <ChevronUp size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <View style={[styles.wheelValue, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.wheelValueText, { color: colors.primary }]}>{String(eventMinute).padStart(2, '0')}</Text>
                    </View>
                    <TouchableOpacity style={styles.wheelArrow} onPress={() => setEventMinute(prev => prev === 0 ? 59 : prev - 1)}>
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 빠른 분 선택 */}
              <View style={styles.quickMinuteRow}>
                {[0, 5, 10, 15, 30, 45].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.quickMinuteBtn, { borderColor: colors.border }, eventMinute === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setEventMinute(m)}
                  >
                    <Text style={[styles.quickMinuteText, { color: eventMinute === m ? '#fff' : colors.foreground }]}>{String(m).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 알림 토글 */}
              <TouchableOpacity
                style={[styles.notifyToggle, { backgroundColor: eventNotify ? colors.primary + '15' : colors.secondary, borderColor: eventNotify ? colors.primary : colors.border }]}
                onPress={() => setEventNotify(!eventNotify)}
              >
                {eventNotify ? <Bell size={16} color={colors.primary} /> : <BellOff size={16} color={colors.mutedForeground} />}
                <Text style={[styles.notifyText, { color: eventNotify ? colors.primary : colors.mutedForeground }]}>
                  {eventNotify ? '시간에 알림 받기' : '알림 없음'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!editingSchedule && (
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1, backgroundColor: isSubmitting ? colors.mutedForeground : colors.secondary, borderWidth: 1, borderColor: colors.primary }]}
                  onPress={async () => {
                    await handleSubmit();
                    // 모달을 다시 열고 이름만 초기화 (날짜/시간 유지)
                    setTimeout(() => {
                      setEditingSchedule(null);
                      setEventName('');
                      setEventPlace('');
                      setShowModal(true);
                    }, 200);
                  }}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.submitText, { color: colors.primary }]}>추가 후 계속</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, backgroundColor: isSubmitting ? colors.mutedForeground : colors.primary }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                <Text style={styles.submitText}>{isSubmitting ? '저장 중...' : editingSchedule ? '수정' : '추가'}</Text>
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
  addBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 0.5 },
  dateNavText: { fontSize: 16, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  empty: { padding: 32, borderRadius: 10, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6, gap: 10 },
  scheduleRight: { alignItems: 'flex-end', gap: 4, minWidth: 60 },
  timeText: { fontSize: 12, fontWeight: '600' },
  scheduleCenter: { flex: 1 },
  scheduleName: { fontSize: 14, fontWeight: '600' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  placeText: { fontSize: 11 },
  hintText: { fontSize: 10, textAlign: 'right', paddingHorizontal: 4, marginBottom: 4 },
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 6 },
  swipeDeleteBtn: { backgroundColor: '#ef4444', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeDeleteText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  swipeCopy: { justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 6 },
  swipeCopyBtn: { backgroundColor: '#3b82f6', borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' },
  swipeCopyText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  calendarSection: { marginBottom: 8 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  calendarMonthText: { fontSize: 15, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '500' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: `${100 / 7}%`, height: 36, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 18 },
  calendarDayText: { fontSize: 13, fontWeight: '500' },
  topCalendar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  eventDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  wheelColumn: { alignItems: 'center' },
  wheelBox: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', alignItems: 'center', width: 72 },
  wheelArrow: { paddingVertical: 5, alignItems: 'center', width: '100%' },
  wheelValue: { paddingVertical: 10, alignItems: 'center', width: '100%' },
  wheelValueText: { fontSize: 20, fontWeight: '700' },
  wheelColon: { fontSize: 22, fontWeight: '700', marginBottom: 0 },
  quickMinuteRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },
  quickMinuteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  quickMinuteText: { fontSize: 12, fontWeight: '500' },
  notifyToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  notifyText: { fontSize: 14, fontWeight: '500' },
  submitBtn: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
