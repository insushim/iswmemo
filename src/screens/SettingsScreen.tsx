import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  User,
  Bell,
  Moon,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Star,
} from 'lucide-react-native';
import { useTheme, levelSystem } from '../lib/theme';
import { useAuthStore } from '../store/auth';

export default function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  const level = user ? levelSystem.getLevel(user.experience || 0) : 1;
  const levelTitle = levelSystem.getLevelTitle(level);
  const levelColor = levelSystem.getLevelColor(level);

  const SettingItem = ({
    icon: Icon,
    iconColor,
    title,
    subtitle,
    onPress,
    rightElement,
  }: {
    icon: any;
    iconColor: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: colors.card }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
        <Icon size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement || (onPress && <ChevronRight size={20} color={colors.mutedForeground} />)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>설정</Text>
        <View style={{ width: 24 }} />
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

        {/* 설정 섹션 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            계정
          </Text>
          <SettingItem
            icon={User}
            iconColor="#6366f1"
            title="프로필 편집"
            subtitle="이름, 프로필 사진 변경"
            onPress={() => Alert.alert('안내', '준비중인 기능입니다')}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            앱 설정
          </Text>
          <SettingItem
            icon={Bell}
            iconColor="#f59e0b"
            title="알림 설정"
            subtitle="푸시 알림, 리마인더"
            onPress={() => Alert.alert('안내', '준비중인 기능입니다')}
          />
          <SettingItem
            icon={Moon}
            iconColor="#8b5cf6"
            title="다크 모드"
            subtitle={isDark ? '켜짐' : '꺼짐 (시스템 설정 따름)'}
            rightElement={
              <Switch
                value={isDark}
                disabled
                trackColor={{ false: colors.secondary, true: colors.primary }}
              />
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            지원
          </Text>
          <SettingItem
            icon={HelpCircle}
            iconColor="#22c55e"
            title="도움말"
            subtitle="자주 묻는 질문, 사용 가이드"
            onPress={() => Alert.alert('안내', '준비중인 기능입니다')}
          />
          <SettingItem
            icon={Shield}
            iconColor="#ef4444"
            title="개인정보 처리방침"
            onPress={() => Alert.alert('안내', '준비중인 기능입니다')}
          />
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.destructive + '20' }]}
            onPress={handleLogout}
          >
            <LogOut size={20} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>
              로그아웃
            </Text>
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: colors.mutedForeground }]}>
            GrowthPad
          </Text>
          <Text style={[styles.appVersion, { color: colors.mutedForeground }]}>
            버전 1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    marginBottom: 8,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  levelTitle: {
    fontSize: 12,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 12,
  },
});
