import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'app_settings_v2';
const THEME_KEY = 'theme_dark_mode';

export type FontSizeOption = 'small' | 'medium' | 'large' | 'xlarge';
export type CardSizeOption = 'compact' | 'normal' | 'large';
export type TextAlignOption = 'left' | 'center';
export type ThemeColorOption = 'indigo' | 'blue' | 'green' | 'rose' | 'orange' | 'purple' | 'teal';

export const THEME_COLOR_OPTIONS: Record<ThemeColorOption, { label: string; primary: string; primaryDark: string }> = {
  indigo: { label: '인디고', primary: '#6366f1', primaryDark: '#818cf8' },
  blue: { label: '블루', primary: '#3b82f6', primaryDark: '#60a5fa' },
  green: { label: '그린', primary: '#22c55e', primaryDark: '#4ade80' },
  rose: { label: '로즈', primary: '#f43f5e', primaryDark: '#fb7185' },
  orange: { label: '오렌지', primary: '#f97316', primaryDark: '#fb923c' },
  purple: { label: '퍼플', primary: '#a855f7', primaryDark: '#c084fc' },
  teal: { label: '틸', primary: '#14b8a6', primaryDark: '#2dd4bf' },
};

export const FONT_SIZE_SCALE: Record<FontSizeOption, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.15,
  xlarge: 1.3,
};

export const FONT_SIZE_LABELS: Record<FontSizeOption, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
  xlarge: '아주 크게',
};

export const CARD_SIZE_LABELS: Record<CardSizeOption, string> = {
  compact: '좁게',
  normal: '보통',
  large: '넓게',
};

export const CARD_SIZE_PADDING: Record<CardSizeOption, number> = {
  compact: 8,
  normal: 12,
  large: 18,
};

export const TEXT_ALIGN_LABELS: Record<TextAlignOption, string> = {
  left: '왼쪽',
  center: '가운데',
};

interface SettingsState {
  darkMode: boolean;
  fontSize: FontSizeOption;
  cardSize: CardSizeOption;
  textAlign: TextAlignOption;
  themeColor: ThemeColorOption;
  taskAlarmEnabled: boolean;
  autoLaunchEnabled: boolean;
  isLoaded: boolean;
  setDarkMode: (value: boolean) => Promise<void>;
  setFontSize: (size: FontSizeOption) => Promise<void>;
  setCardSize: (size: CardSizeOption) => Promise<void>;
  setTextAlign: (align: TextAlignOption) => Promise<void>;
  setThemeColor: (color: ThemeColorOption) => Promise<void>;
  setTaskAlarmEnabled: (value: boolean) => Promise<void>;
  setAutoLaunchEnabled: (value: boolean) => Promise<void>;
  loadSettings: () => Promise<void>;
}

const saveDisplaySettings = async (partial: Record<string, any>) => {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const merged = { ...current, ...partial };
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save display settings:', e);
  }
};

export const useSettingsStore = create<SettingsState>((set) => ({
  darkMode: false,
  fontSize: 'medium',
  cardSize: 'normal',
  textAlign: 'left',
  themeColor: 'indigo',
  taskAlarmEnabled: true,
  autoLaunchEnabled: true,
  isLoaded: false,

  setDarkMode: async (value: boolean) => {
    await SecureStore.setItemAsync(THEME_KEY, value ? 'true' : 'false');
    set({ darkMode: value });
  },

  setFontSize: async (size: FontSizeOption) => {
    await saveDisplaySettings({ fontSize: size });
    set({ fontSize: size });
  },

  setCardSize: async (size: CardSizeOption) => {
    await saveDisplaySettings({ cardSize: size });
    set({ cardSize: size });
  },

  setTextAlign: async (align: TextAlignOption) => {
    await saveDisplaySettings({ textAlign: align });
    set({ textAlign: align });
  },

  setThemeColor: async (color: ThemeColorOption) => {
    await saveDisplaySettings({ themeColor: color });
    set({ themeColor: color });
  },

  setTaskAlarmEnabled: async (value: boolean) => {
    await saveDisplaySettings({ taskAlarmEnabled: value });
    set({ taskAlarmEnabled: value });
  },

  setAutoLaunchEnabled: async (value: boolean) => {
    await saveDisplaySettings({ autoLaunchEnabled: value });
    set({ autoLaunchEnabled: value });
  },

  loadSettings: async () => {
    try {
      const dark = await SecureStore.getItemAsync(THEME_KEY);
      const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
      const display = raw ? JSON.parse(raw) : {};

      set({
        darkMode: dark === 'true',
        fontSize: display.fontSize || 'medium',
        cardSize: display.cardSize || 'normal',
        textAlign: display.textAlign || 'left',
        themeColor: display.themeColor || 'indigo',
        taskAlarmEnabled: display.taskAlarmEnabled !== false,
        autoLaunchEnabled: display.autoLaunchEnabled !== false,
        isLoaded: true,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },
}));
