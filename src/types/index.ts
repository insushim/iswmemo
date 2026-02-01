// 사용자
export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  level: number;
  experience: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
}

// 할일
export interface Task {
  id: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// 습관
export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: HabitFrequency;
  targetDays: number[];
  targetCount: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  isActive: boolean;
  logs: HabitLog[];
  completedDates?: string[]; // computed from logs
  createdAt: string;
}

export interface HabitLog {
  id: string;
  date: string;
  count: number;
  note: string | null;
}

// 목표
export interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: GoalType;
  status: GoalStatus;
  priority: Priority;
  progress: number;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  startDate: string;
  endDate: string | null;
  color: string;
  icon: string;
  children?: Goal[];
  createdAt: string;
}

// 메모
export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isArchived: boolean;
  isFavorite: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

// 루틴
export interface Routine {
  id: string;
  name: string;
  description: string | null;
  type: RoutineType;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
  items: RoutineItem[];
  todayLog?: RoutineLog | null;
  completedItemsToday?: number[];
  createdAt: string;
}

export interface RoutineItem {
  id: string;
  name: string;
  duration: number | null;
  order: number;
}

export interface RoutineLog {
  id: string;
  date: string;
  startedAt: string | null;
  completedAt: string | null;
  completedItems: number[];
}

// Enums
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type HabitFrequency = 'DAILY' | 'WEEKLY' | 'CUSTOM';

export type GoalType = 'LIFE' | 'LONG' | 'SHORT' | 'DECADE' | 'FIVE_YEAR' | 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY';

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'ABANDONED';

export type RoutineType = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' | 'CUSTOM';

// API 응답
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// 통계
export interface DashboardStats {
  todayTasksCount: number;
  completedTasksCount: number;
  todayHabitsCount: number;
  completedHabitsCount: number;
  activeGoalsCount: number;
  thisMonthNotesCount: number;
}
