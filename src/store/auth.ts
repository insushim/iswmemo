import { create } from "zustand";
import { Platform, NativeModules } from "react-native";
import { User } from "../types";
import { api } from "../lib/api";
import { API_URL } from "../lib/config";
import { persistentGet, persistentDelete } from "../lib/storage";
import { switchAccount, clearOnLogout } from "../lib/accountData";
import { useGoalStore } from "./goals";

const { AlarmModule } = NativeModules;

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

// SecureStore 키
const TOKEN_KEY = "auth_token";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),

  login: async (email, password) => {
    try {
      set({ isLoading: true });

      // 15초 타임아웃 — 네트워크 지연 시 무한 대기 방지
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${API_URL}/api/auth/mobile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data.success) {
        // 토큰 저장은 api.setToken 한 곳에서 전 레이어(SecureStore·SharedPreferences·파일)
        // + 네이티브 알람 토큰까지 일괄 처리한다. (중복 저장 제거)
        await api.setToken(data.token);

        // ⚠️ 다른 계정으로 바뀌었으면 이전 계정의 로컬 캐시를 **먼저** 지운다.
        //    안 지우면 헤더의 고정 목표·할일·습관 캐시가 남아, 새 계정 화면에 이전 사용자의
        //    데이터가 잠깐 떴다가 사라진다(2026-07-14 실제 발생).
        await switchAccount(data.user?.id);
        useGoalStore.getState().resetPinnedGoals();

        // 사용자 정보 설정
        set({ user: data.user, isAuthenticated: true });
        return true;
      } else {
        if (__DEV__) console.error("Login failed:", data.error);
        return false;
      }
    } catch (error) {
      if (__DEV__) console.error("Login error:", error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (name, email, password) => {
    try {
      set({ isLoading: true });

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        // 회원가입 성공 후 자동 로그인
        return await get().login(email, password);
      }
      return false;
    } catch (error) {
      if (__DEV__) console.error("Register error:", error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // 저장된 토큰 삭제
    await persistentDelete(TOKEN_KEY);

    // 네이티브 알람 토큰도 삭제
    if (Platform.OS === "android" && AlarmModule) {
      try {
        await AlarmModule.saveAuthToken("");
      } catch {}
    }

    // API 클라이언트 토큰도 삭제
    await api.clearToken();

    // 계정에 딸린 로컬 데이터(캐시·고정 목표·암호화 키)도 정리 — 다음 사용자에게 남기지 않는다.
    await clearOnLogout();
    useGoalStore.getState().resetPinnedGoals();

    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      // 저장된 JWT 토큰 확인 (SecureStore 로컬 읽기, 빠름)
      const token = await persistentGet(TOKEN_KEY);

      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // 토큰이 있으면 즉시 로그인 상태로 처리 (Optimistic)
      // 네트워크 verify는 백그라운드에서 수행하여 콜드 스타트 블로킹 제거
      await api.setToken(token);
      if (Platform.OS === "android" && AlarmModule) {
        AlarmModule.saveAuthToken(token).catch(() => {});
      }
      set({ isAuthenticated: true, isLoading: false });

      // 백그라운드 토큰 검증 — 사용자 정보 업데이트만 수행, 자동 로그아웃은 하지 않음.
      // 토큰이 실제로 invalid하면 이후 API 호출이 실패하면서 재로그인 유도됨.
      // 여기서 강제 로그아웃하면 서버 일시 오류/네트워크 불안정 시 사용자가 계속 튕겨나감.
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(`${API_URL}/api/auth/mobile/verify`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              set({ user: data.user });
            }
            // 슬라이딩 만료 — 서버가 만료 임박(잔여 15일 미만) 토큰을 감지하면 새 30일 토큰을
            // 함께 내려준다. 저장해 두면 앱을 계속 쓰는 한 재로그인이 영영 필요 없다.
            // (없으면 30일마다 강제 로그아웃 + 연동 끊김 — 실제 발생 2026-07-13)
            if (typeof data.token === "string" && data.token.length > 0) {
              await api.setToken(data.token);
            }
          }
        } catch {
          // 네트워크 오류는 조용히 무시 (오프라인에서도 앱 사용 가능)
        }
      })();
    } catch (error) {
      if (__DEV__) console.error("Auth check error:", error);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
