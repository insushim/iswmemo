import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '../types';

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

const API_URL = 'https://growthpad-b7ojapdtv-insu-shims-projects.vercel.app';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),

  login: async (email, password) => {
    try {
      set({ isLoading: true });

      // 로그인 요청
      const response = await fetch(`${API_URL}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          csrfToken: '',
          callbackUrl: '/',
          json: true
        }),
      });

      if (response.ok) {
        // 세션 쿠키 저장 (모바일에서는 토큰 방식으로 저장)
        await SecureStore.setItemAsync('user_email', email);
        await SecureStore.setItemAsync('user_password', password);

        // 사용자 정보 가져오기
        await get().checkAuth();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
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
        // 자동 로그인
        return await get().login(email, password);
      }
      return false;
    } catch (error) {
      console.error('Register error:', error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('user_email');
    await SecureStore.deleteItemAsync('user_password');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      set({ isLoading: true });

      const email = await SecureStore.getItemAsync('user_email');
      const password = await SecureStore.getItemAsync('user_password');

      if (email && password) {
        // 저장된 자격 증명으로 사용자 정보 요청
        const response = await fetch(`${API_URL}/api/user`, {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': email,
          },
        });

        if (response.ok) {
          const data = await response.json();
          set({ user: data.user, isAuthenticated: true });
        } else {
          set({ user: null, isAuthenticated: false });
        }
      } else {
        set({ user: null, isAuthenticated: false });
      }
    } catch (error) {
      console.error('Auth check error:', error);
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },
}));
