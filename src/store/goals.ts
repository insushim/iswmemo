import { create } from 'zustand';
import { Goal } from '../types';
import { persistentGet, persistentSet } from '../lib/storage';

const PINNED_GOALS_KEY = 'pinned_goals';

interface GoalStoreState {
  pinnedGoals: Goal[];
  isLoaded: boolean;
  togglePinGoal: (goal: Goal) => Promise<void>;
  removePinGoal: (goalId: string) => Promise<void>;
  updatePinnedGoal: (goal: Goal, oldTitle?: string) => Promise<void>;
  syncPinnedGoals: (allGoals: Goal[]) => void;
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

  updatePinnedGoal: async (goal: Goal, oldTitle?: string) => {
    const { pinnedGoals } = get();
    // id 매칭 우선, fallback으로 old title 매칭
    // (pinnedGoals가 stale id를 가진 경우 복구)
    const next = pinnedGoals.map(g => {
      if (g.id === goal.id) return goal;
      if (oldTitle && g.title === oldTitle) return goal;
      return g;
    });
    // UI 즉시 반영 (storage I/O에 블록되지 않도록)
    set({ pinnedGoals: next });
    persistAsync(next);
  },

  // 서버에서 받아온 최신 goals 목록으로 pinnedGoals 동기화
  syncPinnedGoals: (allGoals: Goal[]) => {
    const { pinnedGoals } = get();
    if (pinnedGoals.length === 0) return;
    const byId = new Map(allGoals.map(g => [g.id, g]));
    const byTitle = new Map(allGoals.map(g => [g.title, g]));
    let changed = false;
    const next = pinnedGoals.map(p => {
      const latest = byId.get(p.id) || byTitle.get(p.title);
      if (latest && latest !== p) {
        changed = true;
        return latest;
      }
      return p;
    });
    if (changed) {
      set({ pinnedGoals: next });
      persistAsync(next);
    }
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
