import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import type {
  Task,
  Habit,
  Goal,
  Note,
  Routine,
  RoutineLog,
  Priority,
  HabitFrequency,
  GoalType,
  GoalStatus,
  RoutineType,
} from '../types';

// --- Request payload types ---

interface CreateTaskPayload {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
}

interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  isCompleted?: boolean;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
}

interface CreateHabitPayload {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  frequency?: HabitFrequency;
  targetDays?: number[];
  targetCount?: number;
}

interface UpdateHabitPayload {
  name?: string;
  description?: string | null;
  icon?: string;
  color?: string;
  frequency?: HabitFrequency;
  targetDays?: number[];
  targetCount?: number;
  isActive?: boolean;
}

interface CreateGoalPayload {
  title: string;
  description?: string | null;
  type?: GoalType;
  priority?: Priority;
  status?: GoalStatus;
  targetValue?: number | null;
  unit?: string | null;
  startDate?: string;
  endDate?: string | null;
  color?: string;
  icon?: string;
}

interface UpdateGoalPayload {
  title?: string;
  description?: string | null;
  type?: GoalType;
  status?: GoalStatus;
  priority?: Priority;
  progress?: number;
  targetValue?: number | null;
  currentValue?: number;
  unit?: string | null;
  endDate?: string | null;
  color?: string;
  icon?: string;
}

interface CreateNotePayload {
  title: string;
  content?: string;
  contentType?: 'text' | 'markdown' | 'rich';
  color?: string | null;
}

interface UpdateNotePayload {
  title?: string;
  content?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  color?: string | null;
}

interface CreateRoutinePayload {
  name: string;
  description?: string | null;
  type?: RoutineType;
  startTime?: string | null;
  endTime?: string | null;
  items?: { name: string; duration?: number | null; order?: number }[];
}

interface UpdateRoutinePayload {
  name?: string;
  description?: string | null;
  type?: RoutineType;
  startTime?: string | null;
  endTime?: string | null;
  isActive?: boolean;
  items?: { name: string; duration?: number | null; order?: number }[];
}

interface RoutinesResponse {
  routines: Routine[];
}

// --- Fetch options ---

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown>;
}

// --- Timeout ---

const REQUEST_TIMEOUT_MS = 30_000;

// --- API Client ---

class ApiClient {
  private token: string | null = null;

  async setToken(token: string): Promise<void> {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync('auth_token');
    }
    return this.token;
  }

  async clearToken(): Promise<void> {
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const config: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Request to ${endpoint} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Tasks ---

  async getTasks(): Promise<Task[]> {
    return this.fetch<Task[]>('/api/tasks');
  }

  async createTask(data: CreateTaskPayload): Promise<Task> {
    return this.fetch<Task>('/api/tasks', {
      method: 'POST',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateTask(id: string, data: UpdateTaskPayload): Promise<Task> {
    return this.fetch<Task>(`/api/tasks?id=${id}`, {
      method: 'PATCH',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteTask(id: string): Promise<void> {
    return this.fetch<void>(`/api/tasks?id=${id}`, {
      method: 'DELETE',
    });
  }

  // --- Habits ---

  async getHabits(): Promise<Habit[]> {
    return this.fetch<Habit[]>('/api/habits');
  }

  async createHabit(data: CreateHabitPayload): Promise<Habit> {
    return this.fetch<Habit>('/api/habits', {
      method: 'POST',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async completeHabit(id: string, date: string): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}/complete`, {
      method: 'POST',
      body: { date },
    });
  }

  async uncompleteHabit(id: string, date: string): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}/complete`, {
      method: 'DELETE',
      body: { date },
    });
  }

  async updateHabit(id: string, data: UpdateHabitPayload): Promise<Habit> {
    return this.fetch<Habit>(`/api/habits/${id}`, {
      method: 'PATCH',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteHabit(id: string): Promise<void> {
    return this.fetch<void>(`/api/habits/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Goals ---

  async getGoals(): Promise<Goal[]> {
    return this.fetch<Goal[]>('/api/goals');
  }

  async createGoal(data: CreateGoalPayload): Promise<Goal> {
    return this.fetch<Goal>('/api/goals', {
      method: 'POST',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateGoal(id: string, data: UpdateGoalPayload): Promise<Goal> {
    return this.fetch<Goal>(`/api/goals/${id}`, {
      method: 'PATCH',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteGoal(id: string): Promise<void> {
    return this.fetch<void>(`/api/goals/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Notes ---

  async getNotes(): Promise<Note[]> {
    return this.fetch<Note[]>('/api/notes');
  }

  async createNote(data: CreateNotePayload): Promise<Note> {
    return this.fetch<Note>('/api/notes', {
      method: 'POST',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateNote(id: string, data: UpdateNotePayload): Promise<Note> {
    return this.fetch<Note>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteNote(id: string): Promise<void> {
    return this.fetch<void>(`/api/notes/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Routines ---

  async getRoutines(): Promise<RoutinesResponse | Routine[]> {
    return this.fetch<RoutinesResponse | Routine[]>('/api/routines');
  }

  async createRoutine(data: CreateRoutinePayload): Promise<Routine> {
    return this.fetch<Routine>('/api/routines', {
      method: 'POST',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async updateRoutine(id: string, data: UpdateRoutinePayload): Promise<Routine> {
    return this.fetch<Routine>(`/api/routines/${id}`, {
      method: 'PATCH',
      body: data as unknown as Record<string, unknown>,
    });
  }

  async deleteRoutine(id: string): Promise<void> {
    return this.fetch<void>(`/api/routines/${id}`, {
      method: 'DELETE',
    });
  }

  async toggleRoutineItem(routineId: string, itemIndex: number): Promise<RoutineLog> {
    return this.fetch<RoutineLog>(`/api/routines/${routineId}/log`, {
      method: 'POST',
      body: { itemIndex },
    });
  }
}

export const api = new ApiClient();
