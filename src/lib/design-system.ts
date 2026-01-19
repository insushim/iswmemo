export const colors = {
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    950: '#1e1b4b',
  },
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  accent: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  levels: {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    diamond: '#b9f2ff',
    master: '#9966cc',
    legend: '#ff6b6b',
  }
}

export const levelSystem = {
  getLevel: (exp: number) => Math.floor(Math.sqrt(exp / 100)) + 1,
  getExpForLevel: (level: number) => Math.pow(level - 1, 2) * 100,
  getExpProgress: (exp: number) => {
    const currentLevel = Math.floor(Math.sqrt(exp / 100)) + 1
    const currentLevelExp = Math.pow(currentLevel - 1, 2) * 100
    const nextLevelExp = Math.pow(currentLevel, 2) * 100
    return ((exp - currentLevelExp) / (nextLevelExp - currentLevelExp)) * 100
  },
  getLevelTitle: (level: number): string => {
    if (level < 5) return '새싹'
    if (level < 10) return '성장하는 나무'
    if (level < 20) return '꽃피는 정원'
    if (level < 30) return '풍성한 숲'
    if (level < 50) return '지혜의 산'
    if (level < 75) return '빛나는 별'
    if (level < 100) return '은하수'
    return '우주의 주인'
  },
  getLevelColor: (level: number): string => {
    if (level < 10) return colors.levels.bronze
    if (level < 25) return colors.levels.silver
    if (level < 50) return colors.levels.gold
    if (level < 75) return colors.levels.platinum
    if (level < 100) return colors.levels.diamond
    if (level < 150) return colors.levels.master
    return colors.levels.legend
  }
}

export const pointSystem = {
  NOTE_CREATE: 5,
  NOTE_DAILY: 10,
  TASK_COMPLETE: 10,
  HABIT_COMPLETE: 15,
  HABIT_STREAK_7: 50,
  HABIT_STREAK_30: 200,
  HABIT_STREAK_100: 500,
  GOAL_MILESTONE: 25,
  GOAL_COMPLETE: 100,
  ROUTINE_COMPLETE: 20,
  DAILY_LOGIN: 5,
  STREAK_BONUS: (days: number) => Math.min(days * 2, 50),
}
