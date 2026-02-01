import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

type StartScreen = 'Dashboard' | 'Tasks' | 'Habits' | 'Goals' | 'Routines' | 'Notes';

interface SettingsState {
  startScreen: StartScreen;
  isLoaded: boolean;
  setStartScreen: (screen: StartScreen) => Promise<void>;
  loadSettings: () => Promise<void>;
}

const SETTINGS_KEY = 'app_settings';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  startScreen: 'Dashboard',
  isLoaded: false,

  setStartScreen: async (screen: StartScreen) => {
    try {
      const settings = { startScreen: screen };
      await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
      set({ startScreen: screen });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  loadSettings: async () => {
    try {
      const data = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (data) {
        const settings = JSON.parse(data);
        set({ startScreen: settings.startScreen || 'Dashboard', isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },
}));
