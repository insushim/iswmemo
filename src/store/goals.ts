import { create } from 'zustand';
import { Goal } from '../types';
import { persistentGet, persistentSet } from '../lib/storage';
import { api } from '../lib/api';

/**
 * 홈 헤더에 고정한 목표.
 *
 * ⚠️ 예전엔 이 목록이 **폰에만** 저장됐다. 그래서 계정을 바꾸거나 앱을 다시 깔면 고정이 통째로
 *    사라졌다(2026-07-14: 다른 계정에 들어갔다 오니 고정이 전부 풀림 — 실제 발생).
 *    이제 고정 여부는 **서버(Goal.isPinned)** 가 진실이고, 로컬은 화면을 즉시 그리기 위한 캐시일 뿐이다.
 *    목록을 받아올 때마다 서버 값으로 다시 맞춘다 → 어느 기기·어느 계정에서도 자기 고정이 유지된다.
 */
const PINNED_GOALS_CACHE_KEY = 'pinned_goals';

interface GoalStoreState {
  pinnedGoals: Goal[];
  isLoaded: boolean;
  togglePinGoal: (goal: Goal) => Promise<void>;
  removePinGoal: (goalId: string) => Promise<void>;
  updatePinnedGoal: (goal: Goal, oldTitle?: string) => Promise<void>;
  syncPinnedGoals: (allGoals: Goal[]) => void;
  loadPinnedGoals: () => Promise<void>;
  /** 계정 전환·로그아웃 시 헤더를 즉시 비운다(이전 사용자의 목표가 남지 않도록). */
  resetPinnedGoals: () => void;
}

// set 먼저, persist는 백그라운드 — UI가 storage I/O에 블록되지 않도록
const cacheAsync = (value: Goal[]) => {
  persistentSet(PINNED_GOALS_CACHE_KEY, JSON.stringify(value)).catch((e) => {
    console.error('Failed to cache pinned goals:', e);
  });
};

/** 서버에 고정 여부를 저장. 실패해도 화면은 그대로 두고(낙관적), 다음 목록 조회 때 바로잡힌다. */
const persistPinToServer = (goalId: string, isPinned: boolean) => {
  api.updateGoal(goalId, { isPinned }).catch((e) => {
    console.error('Failed to persist pin to server:', e);
  });
};

export const useGoalStore = create<GoalStoreState>((set, get) => ({
  pinnedGoals: [],
  isLoaded: false,

  togglePinGoal: async (goal: Goal) => {
    const { pinnedGoals } = get();
    const exists = pinnedGoals.find((g) => g.id === goal.id);
    const next: Goal[] = exists
      ? pinnedGoals.filter((g) => g.id !== goal.id)
      : [...pinnedGoals, { ...goal, isPinned: true }];
    set({ pinnedGoals: next });
    cacheAsync(next);
    persistPinToServer(goal.id, !exists); // 서버가 진실 — 기기·계정이 바뀌어도 유지된다
  },

  removePinGoal: async (goalId: string) => {
    const next = get().pinnedGoals.filter((g) => g.id !== goalId);
    set({ pinnedGoals: next });
    cacheAsync(next);
    persistPinToServer(goalId, false);
  },

  updatePinnedGoal: async (goal: Goal, oldTitle?: string) => {
    const { pinnedGoals } = get();
    // id 매칭 우선, fallback으로 old title 매칭 (stale id 복구)
    const next = pinnedGoals.map((g) => {
      if (g.id === goal.id) return goal;
      if (oldTitle && g.title === oldTitle) return goal;
      return g;
    });
    set({ pinnedGoals: next });
    cacheAsync(next);
  },

  /**
   * 서버에서 받아온 목표 목록으로 헤더를 다시 맞춘다.
   * **서버의 isPinned 가 기준**이다 — 로컬 캐시는 참고하지 않는다(그게 계정 간 오염의 원인이었다).
   *
   * 단, 아직 isPinned 를 모르는 예전 서버(필드 없음)라면 로컬 캐시를 유지한다 —
   * 업데이트 직후 고정이 잠깐 사라져 보이는 일을 막기 위한 하위호환.
   */
  syncPinnedGoals: (allGoals: Goal[]) => {
    if (!Array.isArray(allGoals) || allGoals.length === 0) return;

    const serverKnowsPin = allGoals.some((g) => typeof g.isPinned === 'boolean');
    if (!serverKnowsPin) {
      // 예전 서버 — 로컬 캐시 기준으로 최신 내용만 갱신(기존 동작 유지)
      const { pinnedGoals } = get();
      if (pinnedGoals.length === 0) return;
      const byId = new Map(allGoals.map((g) => [g.id, g]));
      const byTitle = new Map(allGoals.map((g) => [g.title, g]));
      const next = pinnedGoals.map((p) => byId.get(p.id) || byTitle.get(p.title) || p);
      set({ pinnedGoals: next });
      cacheAsync(next);
      return;
    }

    const next = allGoals.filter((g) => g.isPinned === true);
    const prev = get().pinnedGoals;
    const same =
      prev.length === next.length && prev.every((p, i) => p.id === next[i].id);
    if (same) return;
    set({ pinnedGoals: next, isLoaded: true });
    cacheAsync(next);
  },

  resetPinnedGoals: () => {
    set({ pinnedGoals: [], isLoaded: false });
  },

  /** 앱 시작 시 캐시로 헤더를 즉시 그린다. 곧 목록 조회가 서버 값으로 덮어쓴다. */
  loadPinnedGoals: async () => {
    try {
      const data = await persistentGet(PINNED_GOALS_CACHE_KEY);
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
