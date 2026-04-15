import { create } from "zustand";
import { Platform, NativeModules } from "react-native";
import * as SecureStore from "expo-secure-store";
import { User } from "../types";
import { api } from "../lib/api";
import { API_URL } from "../lib/config";

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
        // JWT 토큰 안전하게 저장
        await SecureStore.setItemAsync(TOKEN_KEY, data.token);

        // 네이티브 알람에서 사용할 토큰 저장
        if (Platform.OS === "android" && AlarmModule) {
          try {
            await AlarmModule.saveAuthToken(data.token);
          } catch {}
        }

        // API 클라이언트에도 토큰 동기화
        await api.setToken(data.token);

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
    await SecureStore.deleteItemAsync(TOKEN_KEY);

    // 네이티브 알람 토큰도 삭제
    if (Platform.OS === "android" && AlarmModule) {
      try {
        await AlarmModule.saveAuthToken("");
      } catch {}
    }

    // API 클라이언트 토큰도 삭제
    await api.clearToken();

    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      // 저장된 JWT 토큰 확인 (SecureStore 로컬 읽기, 빠름)
      const token = await SecureStore.getItemAsync(TOKEN_KEY);

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
