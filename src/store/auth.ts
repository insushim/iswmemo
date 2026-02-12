import { create } from 'zustand';
import { Platform, NativeModules } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { User } from '../types';
import { api } from '../lib/api';
import { API_URL } from '../lib/config';

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
const TOKEN_KEY = 'auth_token';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),

  login: async (email, password) => {
    try {
      set({ isLoading: true });

      // 새로운 모바일 전용 JWT 인증 API 사용
      const response = await fetch(`${API_URL}/api/auth/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // JWT 토큰 안전하게 저장
        await SecureStore.setItemAsync(TOKEN_KEY, data.token);

        // 네이티브 알람에서 사용할 토큰 저장
        if (Platform.OS === 'android' && AlarmModule) {
          try { await AlarmModule.saveAuthToken(data.token); } catch {}
        }

        // API 클라이언트에도 토큰 동기화
        await api.setToken(data.token);

        // 사용자 정보 설정
        set({ user: data.user, isAuthenticated: true });
        return true;
      } else {
        if (__DEV__) console.error('Login failed:', data.error);
        return false;
      }
    } catch (error) {
      if (__DEV__) console.error('Login error:', error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (name, email, password) => {
    try {
      set({ isLoading: true });

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        // 회원가입 성공 후 자동 로그인
        return await get().login(email, password);
      }
      return false;
    } catch (error) {
      if (__DEV__) console.error('Register error:', error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // 저장된 토큰 삭제
    await SecureStore.deleteItemAsync(TOKEN_KEY);

    // 네이티브 알람 토큰도 삭제
    if (Platform.OS === 'android' && AlarmModule) {
      try { await AlarmModule.saveAuthToken(''); } catch {}
    }

    // API 클라이언트 토큰도 삭제
    await api.clearToken();

    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      set({ isLoading: true });

      // 저장된 JWT 토큰 확인
      const token = await SecureStore.getItemAsync(TOKEN_KEY);

      if (token) {
        // 토큰으로 사용자 정보 검증
        const response = await fetch(`${API_URL}/api/auth/mobile/verify`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            // 네이티브 알람에서 사용할 토큰 동기화
            if (Platform.OS === 'android' && AlarmModule) {
              try { await AlarmModule.saveAuthToken(token); } catch {}
            }
            set({ user: data.user, isAuthenticated: true });
            return;
          }
        }

        // 토큰이 유효하지 않으면 삭제
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }

      set({ user: null, isAuthenticated: false });
    } catch (error) {
      if (__DEV__) console.error('Auth check error:', error);
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },
}));
