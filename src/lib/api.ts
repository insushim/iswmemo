import * as SecureStore from 'expo-secure-store';

// 프로덕션 URL 사용 (auth.ts와 동일)
const API_URL = 'https://growthpad.vercel.app';

interface FetchOptions extends RequestInit {
  body?: any;
}

class ApiClient {
  private token: string | null = null;

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  async getToken() {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync('auth_token');
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync('auth_token');
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const token = await this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // 인증
  async login(email: string, password: string) {
    // NextAuth credentials 로그인은 쿠키 기반이므로 별도 처리 필요
    const response = await fetch(`${API_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return response;
  }

  async register(name: string, email: string, password: string) {
    return this.fetch('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
  }

  // 사용자
  async getUser() {
    return this.fetch<{ user: any }>('/api/user');
  }

  async updateUser(data: any) {
    return this.fetch('/api/user', {
      method: 'PATCH',
      body: data,
    });
  }

  // 할일
  async getTasks() {
    return this.fetch<any[]>('/api/tasks');
  }

  async createTask(data: any) {
    return this.fetch('/api/tasks', {
      method: 'POST',
      body: data,
    });
  }

  async updateTask(id: string, data: any) {
    return this.fetch(`/api/tasks?id=${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteTask(id: string) {
    return this.fetch(`/api/tasks?id=${id}`, {
      method: 'DELETE',
    });
  }

  // 습관
  async getHabits() {
    return this.fetch<any[]>('/api/habits');
  }

  async createHabit(data: any) {
    return this.fetch('/api/habits', {
      method: 'POST',
      body: data,
    });
  }

  async completeHabit(id: string, date: string) {
    return this.fetch(`/api/habits/${id}/complete`, {
      method: 'POST',
      body: { date },
    });
  }

  async uncompleteHabit(id: string, date: string) {
    return this.fetch(`/api/habits/${id}/complete`, {
      method: 'DELETE',
      body: { date },
    });
  }

  async updateHabit(id: string, data: any) {
    return this.fetch(`/api/habits/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteHabit(id: string) {
    return this.fetch(`/api/habits/${id}`, {
      method: 'DELETE',
    });
  }

  // 목표
  async getGoals() {
    return this.fetch<any[]>('/api/goals');
  }

  async createGoal(data: any) {
    return this.fetch('/api/goals', {
      method: 'POST',
      body: data,
    });
  }

  async updateGoal(id: string, data: any) {
    return this.fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteGoal(id: string) {
    return this.fetch(`/api/goals/${id}`, {
      method: 'DELETE',
    });
  }

  // 메모
  async getNotes() {
    return this.fetch<any[]>('/api/notes');
  }

  async createNote(data: any) {
    return this.fetch('/api/notes', {
      method: 'POST',
      body: data,
    });
  }

  async updateNote(id: string, data: any) {
    return this.fetch(`/api/notes/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteNote(id: string) {
    return this.fetch(`/api/notes/${id}`, {
      method: 'DELETE',
    });
  }

  // 루틴
  async getRoutines() {
    return this.fetch<any[]>('/api/routines');
  }

  async createRoutine(data: any) {
    return this.fetch('/api/routines', {
      method: 'POST',
      body: data,
    });
  }

  // 통계
  async getStats() {
    return this.fetch<any>('/api/stats');
  }
}

export const api = new ApiClient();
