import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  NativeModules,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Moon,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Star,
  X,
  Type,
  LayoutGrid,
  AlignLeft,
  Check,
  Bell,
  Smartphone,
  Palette,
} from 'lucide-react-native';
import { useTheme, levelSystem } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import {
  useSettingsStore,
  FontSizeOption, FONT_SIZE_LABELS,
  CardSizeOption, CARD_SIZE_LABELS,
  TextAlignOption, TEXT_ALIGN_LABELS,
  ThemeColorOption, THEME_COLOR_OPTIONS,
} from '../store/settings';
import GoalBanner from '../components/GoalBanner';

const { AutoLaunchModule } = NativeModules;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuthStore();
  const {
    darkMode, setDarkMode,
    fontSize, setFontSize,
    cardSize, setCardSize,
    textAlign, setTextAlign,
    themeColor, setThemeColor,
    taskAlarmEnabled, setTaskAlarmEnabled,
    autoLaunchEnabled, setAutoLaunchEnabled,
  } = useSettingsStore();
  const [showHelp, setShowHelp] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showCardSize, setShowCardSize] = useState(false);
  const [showTextAlign, setShowTextAlign] = useState(false);
  const [showThemeColor, setShowThemeColor] = useState(false);
  const [overlayGranted, setOverlayGranted] = useState(false);

  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== 'android' || !AutoLaunchModule) return;
    try {
      const overlay = await AutoLaunchModule.checkOverlayPermission();
      setOverlayGranted(overlay);
    } catch {}
  }, []);

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);

  const handleAutoLaunchToggle = async (value: boolean) => {
    if (Platform.OS !== 'android' || !AutoLaunchModule) return;
    if (value) {
      const overlay = await AutoLaunchModule.checkOverlayPermission();
      if (!overlay) {
        Alert.alert(
          '권한 필요',
          '화면 켤 때 앱을 자동 실행하려면 "다른 앱 위에 표시" 권한이 필요합니다.\n\n설정 화면에서 또박또박을 찾아 권한을 켜주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정 열기', onPress: () => AutoLaunchModule.requestOverlayPermission() },
          ]
        );
        return;
      }
      AutoLaunchModule.startService();
      setAutoLaunchEnabled(true);
    } else {
      AutoLaunchModule.stopService();
      setAutoLaunchEnabled(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: logout },
    ]);
  };

  const level = user ? levelSystem.getLevel(user.experience || 0) : 1;
  const levelTitle = levelSystem.getLevelTitle(level);
  const levelColor = levelSystem.getLevelColor(level);

  const SettingItem = ({
    icon: Icon, iconColor, title, subtitle, onPress, rightElement,
  }: {
    icon: any; iconColor: string; title: string; subtitle?: string;
    onPress?: () => void; rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: colors.card }]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
        <Icon size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        )}
      </View>
      {rightElement || (onPress && <ChevronRight size={20} color={colors.mutedForeground} />)}
    </TouchableOpacity>
  );

  const OptionItem = ({
    label, isSelected, onPress, preview,
  }: {
    label: string; isSelected: boolean; onPress: () => void; preview?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[
        styles.optionItem,
        {
          backgroundColor: isSelected ? colors.primary + '15' : colors.background,
          borderColor: isSelected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.optionLeft}>
        <Text style={[styles.optionLabel, { color: isSelected ? colors.primary : colors.foreground }]}>
          {label}
        </Text>
        {preview}
      </View>
      {isSelected && <Check size={18} color={colors.primary} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <GoalBanner />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>설정</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 프로필 카드 */}
        <View style={[styles.profileCard, { backgroundColor: colors.primary + '15' }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.name || '사용자'}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
              {user?.email || '이메일 없음'}
            </Text>
            <View style={styles.levelRow}>
              <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
                <Star size={12} color="#fff" />
                <Text style={styles.levelText}>Lv.{level}</Text>
              </View>
              <Text style={[styles.levelTitle, { color: colors.mutedForeground }]}>
                {levelTitle}
              </Text>
            </View>
          </View>
        </View>

        {/* 화면 설정 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>화면</Text>
          <SettingItem
            icon={Moon}
            iconColor="#8b5cf6"
            title="다크 모드"
            subtitle={darkMode ? '켜짐' : '꺼짐 (시스템 설정 따름)'}
            rightElement={
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: colors.secondary, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <SettingItem
            icon={Palette}
            iconColor={THEME_COLOR_OPTIONS[themeColor]?.primary || '#6366f1'}
            title="테마 색상"
            subtitle={THEME_COLOR_OPTIONS[themeColor]?.label || '인디고'}
            onPress={() => setShowThemeColor(true)}
          />
          <SettingItem
            icon={Type}
            iconColor="#3b82f6"
            title="글씨 크기"
            subtitle={FONT_SIZE_LABELS[fontSize]}
            onPress={() => setShowFontSize(true)}
          />
          <SettingItem
            icon={LayoutGrid}
            iconColor="#f97316"
            title="칸 크기"
            subtitle={CARD_SIZE_LABELS[cardSize]}
            onPress={() => setShowCardSize(true)}
          />
          <SettingItem
            icon={AlignLeft}
            iconColor="#06b6d4"
            title="글자 정렬"
            subtitle={TEXT_ALIGN_LABELS[textAlign]}
            onPress={() => setShowTextAlign(true)}
          />
        </View>

        {/* 자동 실행 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>자동 실행</Text>
          <SettingItem
            icon={Smartphone}
            iconColor="#10b981"
            title="화면 켜면 앱 자동실행"
            subtitle={
              autoLaunchEnabled
                ? overlayGranted
                  ? '화면 켤 때 할일 탭 자동 표시'
                  : '권한 설정 필요 - 탭하여 설정'
                : '꺼짐'
            }
            onPress={autoLaunchEnabled && !overlayGranted ? () => {
              if (AutoLaunchModule) AutoLaunchModule.requestOverlayPermission();
            } : undefined}
            rightElement={
              <Switch
                value={autoLaunchEnabled}
                onValueChange={handleAutoLaunchToggle}
                trackColor={{ false: colors.secondary, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          {autoLaunchEnabled && !overlayGranted && (
            <TouchableOpacity
              style={[styles.permissionWarning, { backgroundColor: '#f59e0b20' }]}
              onPress={() => { if (AutoLaunchModule) AutoLaunchModule.requestOverlayPermission(); }}
            >
              <Text style={[styles.permissionWarningText, { color: '#f59e0b' }]}>
                ⚠ "다른 앱 위에 표시" 권한을 켜주세요
              </Text>
              <ChevronRight size={16} color="#f59e0b" />
            </TouchableOpacity>
          )}
        </View>

        {/* 알림 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>알림</Text>
          <SettingItem
            icon={Bell}
            iconColor="#f59e0b"
            title="할일 기한 알람"
            subtitle={taskAlarmEnabled ? '기한에 알람 소리로 알림' : '꺼짐'}
            rightElement={
              <Switch
                value={taskAlarmEnabled}
                onValueChange={setTaskAlarmEnabled}
                trackColor={{ false: colors.secondary, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* 지원 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>지원</Text>
          <SettingItem
            icon={HelpCircle}
            iconColor="#22c55e"
            title="도움말"
            subtitle="자주 묻는 질문, 사용 가이드"
            onPress={() => setShowHelp(true)}
          />
          <SettingItem
            icon={Shield}
            iconColor="#ef4444"
            title="개인정보 처리방침"
            onPress={() => setShowPrivacy(true)}
          />
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.destructive + '20' }]}
            onPress={handleLogout}
          >
            <LogOut size={20} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: colors.mutedForeground }]}>또박또박</Text>
          <Text style={[styles.appVersion, { color: colors.mutedForeground }]}>버전 2.1.0</Text>
        </View>
      </ScrollView>

      {/* 도움말 모달 */}
      <Modal visible={showHelp} animationType="slide" transparent onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>도움말</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>📋 할일</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                + 버튼으로 할일을 추가하세요.{'\n'}
                할일을 탭하면 수정할 수 있습니다.{'\n'}
                왼쪽으로 밀어서 삭제할 수 있습니다.
              </Text>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>⚡ 습관</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                매일 반복하는 습관을 등록하고 체크하세요.{'\n'}
                꾸준히 하면 연속 달성 기록이 쌓입니다.
              </Text>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>🔄 루틴</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                아침, 저녁 등 일상 루틴을 관리하세요.{'\n'}
                루틴 안에 여러 단계를 추가할 수 있습니다.
              </Text>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>🎯 목표</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                장기 목표를 설정하고 진행률을 추적하세요.{'\n'}
                원하는 만큼 목표를 상단에 고정할 수 있습니다.
              </Text>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>📝 메모</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                자유롭게 메모를 작성하세요.{'\n'}
                제목 없이 내용만 바로 저장 가능합니다.{'\n'}
                왼쪽으로 밀어서 삭제할 수 있습니다.{'\n'}
                꾹 눌러서 드래그하면 순서를 바꿀 수 있습니다.{'\n'}
                검색으로 단어를 찾을 수 있습니다.
              </Text>
              <Text style={[styles.helpSection, { color: colors.foreground }]}>📱 자동 실행</Text>
              <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                화면을 켤 때마다 앱이 자동으로 실행됩니다.{'\n'}
                할일 탭이 먼저 표시되어 할일을 확인할 수 있습니다.{'\n'}
                일부 기기에서는 설정 {'>'} 앱 {'>'} 또박또박 {'>'}{'\n'}
                자동 시작 허용을 켜야 할 수 있습니다.
              </Text>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 개인정보 처리방침 모달 */}
      <Modal visible={showPrivacy} animationType="slide" transparent onRequestClose={() => setShowPrivacy(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>개인정보 처리방침</Text>
              <TouchableOpacity onPress={() => setShowPrivacy(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.privacyTitle, { color: colors.foreground }]}>또박또박 개인정보 처리방침</Text>
              <Text style={[styles.privacySection, { color: colors.foreground }]}>1. 수집하는 개인정보</Text>
              <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                이메일 주소, 이름(닉네임)을 수집합니다.{'\n'}
                서비스 이용 과정에서 할일, 습관, 목표, 메모 등의 데이터가 저장됩니다.
              </Text>
              <Text style={[styles.privacySection, { color: colors.foreground }]}>2. 개인정보의 이용 목적</Text>
              <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                회원 식별 및 서비스 제공{'\n'}
                사용자 데이터 동기화{'\n'}
                서비스 개선 및 통계 분석
              </Text>
              <Text style={[styles.privacySection, { color: colors.foreground }]}>3. 개인정보의 보관 및 파기</Text>
              <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                회원 탈퇴 시 모든 개인정보를 즉시 파기합니다.{'\n'}
                인증 정보는 암호화되어 안전하게 저장됩니다.
              </Text>
              <Text style={[styles.privacySection, { color: colors.foreground }]}>4. 개인정보의 제3자 제공</Text>
              <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                수집된 개인정보는 제3자에게 제공되지 않습니다.
              </Text>
              <Text style={[styles.privacySection, { color: colors.foreground }]}>5. 문의</Text>
              <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                개인정보 관련 문의는 앱 내 설정에서 연락해주세요.
              </Text>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 글씨 크기 모달 */}
      <Modal visible={showFontSize} animationType="slide" transparent onRequestClose={() => setShowFontSize(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>글씨 크기</Text>
              <TouchableOpacity onPress={() => setShowFontSize(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {(['small', 'medium', 'large', 'xlarge'] as FontSizeOption[]).map((size) => {
                const previewSize = size === 'small' ? 13 : size === 'medium' ? 15 : size === 'large' ? 17 : 20;
                return (
                  <OptionItem
                    key={size}
                    label={FONT_SIZE_LABELS[size]}
                    isSelected={fontSize === size}
                    onPress={() => setFontSize(size)}
                    preview={
                      <Text style={{ fontSize: previewSize, color: colors.mutedForeground, marginTop: 2 }}>
                        가나다라 ABC
                      </Text>
                    }
                  />
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* 칸 크기 모달 */}
      <Modal visible={showCardSize} animationType="slide" transparent onRequestClose={() => setShowCardSize(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>칸 크기</Text>
              <TouchableOpacity onPress={() => setShowCardSize(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {(['compact', 'normal', 'large'] as CardSizeOption[]).map((size) => {
                const pad = size === 'compact' ? 8 : size === 'normal' ? 12 : 18;
                return (
                  <OptionItem
                    key={size}
                    label={CARD_SIZE_LABELS[size]}
                    isSelected={cardSize === size}
                    onPress={() => setCardSize(size)}
                    preview={
                      <View style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: pad, marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>미리보기 텍스트</Text>
                      </View>
                    }
                  />
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* 글자 정렬 모달 */}
      <Modal visible={showTextAlign} animationType="slide" transparent onRequestClose={() => setShowTextAlign(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>글자 정렬</Text>
              <TouchableOpacity onPress={() => setShowTextAlign(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {(['left', 'center'] as TextAlignOption[]).map((align) => (
                <OptionItem
                  key={align}
                  label={TEXT_ALIGN_LABELS[align]}
                  isSelected={textAlign === align}
                  onPress={() => setTextAlign(align)}
                  preview={
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: align, marginTop: 2, width: '100%' }}>
                      예시 텍스트입니다
                    </Text>
                  }
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* 테마 색상 모달 */}
      <Modal visible={showThemeColor} animationType="slide" transparent onRequestClose={() => setShowThemeColor(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>테마 색상</Text>
              <TouchableOpacity onPress={() => setShowThemeColor(false)}>
                <X size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.themeColorGrid}>
              {(Object.keys(THEME_COLOR_OPTIONS) as ThemeColorOption[]).map((key) => {
                const opt = THEME_COLOR_OPTIONS[key];
                const isSelected = themeColor === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.themeColorItem,
                      {
                        borderColor: isSelected ? opt.primary : colors.border,
                        borderWidth: isSelected ? 2.5 : 1,
                        backgroundColor: isSelected ? opt.primary + '15' : colors.background,
                      },
                    ]}
                    onPress={() => setThemeColor(key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.themeColorDot, { backgroundColor: opt.primary }]} />
                    <Text style={[styles.themeColorLabel, { color: isSelected ? opt.primary : colors.foreground }]}>
                      {opt.label}
                    </Text>
                    {isSelected && <Check size={16} color={opt.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20,
    padding: 16, borderRadius: 16, gap: 16, marginBottom: 24,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  profileEmail: { fontSize: 13, marginBottom: 8 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  levelText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  levelTitle: { fontSize: 12 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginLeft: 4 },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, gap: 12 },
  iconContainer: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingContent: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '500' },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  logoutText: { fontSize: 15, fontWeight: '600' },
  appInfo: { alignItems: 'center', paddingVertical: 24 },
  appName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  appVersion: { fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalScroll: { paddingHorizontal: 4 },
  helpSection: { fontSize: 15, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  helpText: { fontSize: 13, lineHeight: 20 },
  privacyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  privacySection: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  privacyText: { fontSize: 13, lineHeight: 20 },
  optionList: { gap: 8, paddingBottom: 16 },
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5 },
  optionLeft: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  permissionWarning: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, marginTop: 4, marginBottom: 4 },
  permissionWarningText: { fontSize: 13, fontWeight: '500', flex: 1 },
  themeColorGrid: { gap: 8, paddingBottom: 16 },
  themeColorItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 },
  themeColorDot: { width: 24, height: 24, borderRadius: 12 },
  themeColorLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
});
