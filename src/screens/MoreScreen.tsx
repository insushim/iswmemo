import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Target, Clock, StickyNote, Settings, LogOut, User, Star, ChevronRight } from 'lucide-react-native';
import { useTheme, levelSystem } from '../lib/theme';
import { useAuthStore } from '../store/auth';

export default function MoreScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();

  const level = user ? levelSystem.getLevel(user.experience || 0) : 1;
  const levelTitle = levelSystem.getLevelTitle(level);
  const levelColor = levelSystem.getLevelColor(level);

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: logout },
    ]);
  };

  const menuItems = [
    { icon: Target, color: '#8b5cf6', label: '목표', screen: 'Goals' },
    { icon: Clock, color: '#f59e0b', label: '루틴', screen: 'Routines' },
    { icon: StickyNote, color: '#ec4899', label: '메모', screen: 'Notes' },
    { icon: Settings, color: '#6366f1', label: '설정', screen: 'Settings' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>더보기</Text>
      </View>

      {/* 프로필 */}
      <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name || '사용자'}</Text>
          <View style={styles.levelRow}>
            <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
              <Star size={10} color="#fff" />
              <Text style={styles.levelText}>Lv.{level}</Text>
            </View>
            <Text style={[styles.levelTitle, { color: colors.mutedForeground }]}>{levelTitle}</Text>
          </View>
        </View>
      </View>

      {/* 메뉴 */}
      <View style={styles.menuSection}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={[styles.menuItem, { backgroundColor: colors.card }]}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
              <item.icon size={18} color={item.color} />
            </View>
            <Text style={[styles.menuText, { color: colors.foreground }]}>{item.label}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 로그아웃 */}
      <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: '#ef444415' }]} onPress={handleLogout}>
        <LogOut size={16} color="#ef4444" />
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>GrowthPad v1.3.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, padding: 14, borderRadius: 12, gap: 12, marginBottom: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 3 },
  levelText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  levelTitle: { fontSize: 11 },
  menuSection: { marginHorizontal: 12, gap: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, gap: 10 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 14, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 12, marginTop: 24, padding: 14, borderRadius: 10, gap: 8 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  version: { textAlign: 'center', fontSize: 11, marginTop: 16 },
});
