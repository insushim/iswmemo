import { create } from 'zustand';
import { Goal } from '../types';
import { persistentGet, persistentSet } from '../lib/storage';

const PINNED_GOALS_KEY = 'pinned_goals';

interface GoalStoreState {
  pinnedGoals: Goal[];
  isLoaded: boolean;
  togglePinGoal: (goal: Goal) => Promise<void>;
  removePinGoal: (goalId: string) => Promise<void>;
  updatePinnedGoal: (goal: Goal) => Promise<void>;
  loadPinnedGoals: () => Promise<void>;
}

// set 먼저, persist는 백그라운드 — UI가 storage I/O에 블록되지 않도록
const persistAsync = (value: Goal[]) => {
  persistentSet(PINNED_GOALS_KEY, JSON.stringify(value)).catch((e) => {
    console.error('Failed to persist pinned goals:', e);
  });
};

export const useGoalStore = create<GoalStoreState>((set, get) => ({
  pinnedGoals: [],
  isLoaded: false,

  togglePinGoal: async (goal: Goal) => {
    const { pinnedGoals } = get();
    const exists = pinnedGoals.find(g => g.id === goal.id);
    const next: Goal[] = exists
      ? pinnedGoals.filter(g => g.id !== goal.id)
      : [...pinnedGoals, goal];
    set({ pinnedGoals: next });
    persistAsync(next);
  },

  removePinGoal: async (goalId: string) => {
    const next = get().pinnedGoals.filter(g => g.id !== goalId);
    set({ pinnedGoals: next });
    persistAsync(next);
  },

  updatePinnedGoal: async (goal: Goal) => {
    const { pinnedGoals } = get();
    const next = pinnedGoals.map(g => g.id === goal.id ? goal : g);
    // UI 즉시 반영 (SecureStore 느릴 때도 GoalBanner 바로 갱신)
    set({ pinnedGoals: next });
    persistAsync(next);
  },

  loadPinnedGoals: async () => {
    try {
      const data = await persistentGet(PINNED_GOALS_KEY);
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
