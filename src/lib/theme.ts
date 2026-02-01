import { useColorScheme } from 'react-native';

export const colors = {
  light: {
    background: '#f8fafc',
    foreground: '#0f172a',
    card: '#ffffff',
    cardForeground: '#0f172a',
    primary: '#6366f1',
    primaryForeground: '#f8fafc',
    secondary: '#f1f5f9',
    secondaryForeground: '#1e293b',
    muted: '#f1f5f9',
    mutedForeground: '#64748b',
    accent: '#f1f5f9',
    accentForeground: '#1e293b',
    destructive: '#ef4444',
    destructiveForeground: '#f8fafc',
    border: '#e2e8f0',
    input: '#e2e8f0',
    ring: '#6366f1',
    cardBorder: '#e2e8f0',
    shadow: 'rgba(0,0,0,0.08)',
  },
  dark: {
    background: '#0f172a',
    foreground: '#f8fafc',
    card: '#1e293b',
    cardForeground: '#f8fafc',
    primary: '#818cf8',
    primaryForeground: '#1e293b',
    secondary: '#334155',
    secondaryForeground: '#f8fafc',
    muted: '#334155',
    mutedForeground: '#94a3b8',
    accent: '#334155',
    accentForeground: '#f8fafc',
    destructive: '#7f1d1d',
    destructiveForeground: '#f8fafc',
    border: '#334155',
    input: '#334155',
    ring: '#818cf8',
    cardBorder: '#475569',
    shadow: 'rgba(0,0,0,0.3)',
  },
};

export const useTheme = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    colors: isDark ? colors.dark : colors.light,
    isDark,
  };
};

// 색상 유틸리티
export const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
    case 'COMPLETED':
      return '#22c55e';
    case 'in_progress':
    case 'IN_PROGRESS':
      return '#6366f1';
    case 'on_hold':
    case 'ON_HOLD':
      return '#f59e0b';
    case 'abandoned':
    case 'ABANDONED':
      return '#ef4444';
    default:
      return '#64748b';
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'URGENT':
      return '#ef4444';
    case 'HIGH':
      return '#f97316';
    case 'MEDIUM':
      return '#eab308';
    case 'LOW':
      return '#22c55e';
    default:
      return '#64748b';
  }
};

// 레벨 시스템
export const levelSystem = {
  getLevel: (exp: number): number => {
    if (exp < 100) return 1;
    if (exp < 300) return 2;
    if (exp < 600) return 3;
    if (exp < 1000) return 4;
    if (exp < 1500) return 5;
    if (exp < 2100) return 6;
    if (exp < 2800) return 7;
    if (exp < 3600) return 8;
    if (exp < 4500) return 9;
    return Math.min(10 + Math.floor((exp - 4500) / 1000), 99);
  },

  getExpForLevel: (level: number): number => {
    const thresholds = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];
    if (level <= 10) return thresholds[level - 1] || 0;
    return 4500 + (level - 10) * 1000;
  },

  getExpProgress: (exp: number): number => {
    const level = levelSystem.getLevel(exp);
    const currentLevelExp = levelSystem.getExpForLevel(level);
    const nextLevelExp = levelSystem.getExpForLevel(level + 1);
    return ((exp - currentLevelExp) / (nextLevelExp - currentLevelExp)) * 100;
  },

  getLevelColor: (level: number): string => {
    if (level < 5) return '#6366f1';
    if (level < 10) return '#8b5cf6';
    if (level < 20) return '#a855f7';
    if (level < 30) return '#d946ef';
    if (level < 50) return '#ec4899';
    return '#f43f5e';
  },

  getLevelTitle: (level: number): string => {
    if (level < 5) return '초보 성장러';
    if (level < 10) return '열정 성장러';
    if (level < 20) return '숙련 성장러';
    if (level < 30) return '전문 성장러';
    if (level < 50) return '마스터 성장러';
    return '레전드 성장러';
  },
};
