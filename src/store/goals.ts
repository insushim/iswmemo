import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Goal } from '../types';

const PINNED_GOALS_KEY = 'pinned_goals';

interface GoalStoreState {
  pinnedGoals: Goal[];
  isLoaded: boolean;
  togglePinGoal: (goal: Goal) => Promise<void>;
  removePinGoal: (goalId: string) => Promise<void>;
  updatePinnedGoal: (goal: Goal) => Promise<void>;
  loadPinnedGoals: () => Promise<void>;
}

export const useGoalStore = create<GoalStoreState>((set, get) => ({
  pinnedGoals: [],
  isLoaded: false,

  togglePinGoal: async (goal: Goal) => {
    const { pinnedGoals } = get();
    const exists = pinnedGoals.find(g => g.id === goal.id);
    let next: Goal[];
    if (exists) {
      next = pinnedGoals.filter(g => g.id !== goal.id);
    } else {
      next = [...pinnedGoals, goal];
    }
    try {
      await SecureStore.setItemAsync(PINNED_GOALS_KEY, JSON.stringify(next));
      set({ pinnedGoals: next });
    } catch (error) {
      console.error('Failed to save pinned goals:', error);
    }
  },

  removePinGoal: async (goalId: string) => {
    const next = get().pinnedGoals.filter(g => g.id !== goalId);
    try {
      await SecureStore.setItemAsync(PINNED_GOALS_KEY, JSON.stringify(next));
      set({ pinnedGoals: next });
    } catch (error) {
      console.error('Failed to remove pinned goal:', error);
    }
  },

  updatePinnedGoal: async (goal: Goal) => {
    const { pinnedGoals } = get();
    const next = pinnedGoals.map(g => g.id === goal.id ? goal : g);
    try {
      await SecureStore.setItemAsync(PINNED_GOALS_KEY, JSON.stringify(next));
      set({ pinnedGoals: next });
    } catch (error) {
      console.error('Failed to update pinned goal:', error);
    }
  },

  loadPinnedGoals: async () => {
    try {
      const data = await SecureStore.getItemAsync(PINNED_GOALS_KEY);
      if (data) {
        set({ pinnedGoals: JSON.parse(data), isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load pinned goals:', error);
      set({ isLoaded: true });
    }
  },
}));
