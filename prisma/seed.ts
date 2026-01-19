import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const achievements = [
  // 스트릭 업적
  {
    code: 'STREAK_7',
    name: '일주일의 시작',
    description: '7일 연속으로 접속했습니다',
    icon: '🔥',
    color: '#f97316',
    category: 'STREAK' as const,
    points: 50,
    condition: { type: 'streak', value: 7 },
    isSecret: false,
  },
  {
    code: 'STREAK_30',
    name: '한 달의 약속',
    description: '30일 연속으로 접속했습니다',
    icon: '💪',
    color: '#ef4444',
    category: 'STREAK' as const,
    points: 200,
    condition: { type: 'streak', value: 30 },
    isSecret: false,
  },
  {
    code: 'STREAK_100',
    name: '백일의 기적',
    description: '100일 연속으로 접속했습니다',
    icon: '🏆',
    color: '#fbbf24',
    category: 'STREAK' as const,
    points: 500,
    condition: { type: 'streak', value: 100 },
    isSecret: false,
  },

  // 메모 업적
  {
    code: 'NOTES_1',
    name: '첫 기록',
    description: '첫 번째 메모를 작성했습니다',
    icon: '📝',
    color: '#6366f1',
    category: 'NOTES' as const,
    points: 10,
    condition: { type: 'notes_count', value: 1 },
    isSecret: false,
  },
  {
    code: 'NOTES_10',
    name: '기록의 시작',
    description: '10개의 메모를 작성했습니다',
    icon: '📒',
    color: '#8b5cf6',
    category: 'NOTES' as const,
    points: 30,
    condition: { type: 'notes_count', value: 10 },
    isSecret: false,
  },
  {
    code: 'NOTES_50',
    name: '생각의 정원',
    description: '50개의 메모를 작성했습니다',
    icon: '🌿',
    color: '#22c55e',
    category: 'NOTES' as const,
    points: 100,
    condition: { type: 'notes_count', value: 50 },
    isSecret: false,
  },

  // 목표 업적
  {
    code: 'GOALS_1',
    name: '꿈을 향해',
    description: '첫 번째 목표를 완료했습니다',
    icon: '🎯',
    color: '#3b82f6',
    category: 'GOALS' as const,
    points: 50,
    condition: { type: 'goals_completed', value: 1 },
    isSecret: false,
  },
  {
    code: 'GOALS_5',
    name: '목표 달성자',
    description: '5개의 목표를 완료했습니다',
    icon: '🏅',
    color: '#f59e0b',
    category: 'GOALS' as const,
    points: 150,
    condition: { type: 'goals_completed', value: 5 },
    isSecret: false,
  },

  // 습관 업적
  {
    code: 'HABIT_STREAK_7',
    name: '습관의 씨앗',
    description: '하나의 습관을 7일 연속 완료했습니다',
    icon: '🌱',
    color: '#22c55e',
    category: 'HABITS' as const,
    points: 50,
    condition: { type: 'habits_streak', value: 7 },
    isSecret: false,
  },
  {
    code: 'HABIT_STREAK_21',
    name: '습관 형성',
    description: '하나의 습관을 21일 연속 완료했습니다',
    icon: '🌿',
    color: '#16a34a',
    category: 'HABITS' as const,
    points: 150,
    condition: { type: 'habits_streak', value: 21 },
    isSecret: false,
  },

  // 태스크 업적
  {
    code: 'TASKS_10',
    name: '실행가',
    description: '10개의 할 일을 완료했습니다',
    icon: '✅',
    color: '#10b981',
    category: 'TASKS' as const,
    points: 20,
    condition: { type: 'tasks_completed', value: 10 },
    isSecret: false,
  },
  {
    code: 'TASKS_50',
    name: '생산성 향상',
    description: '50개의 할 일을 완료했습니다',
    icon: '🚀',
    color: '#3b82f6',
    category: 'TASKS' as const,
    points: 100,
    condition: { type: 'tasks_completed', value: 50 },
    isSecret: false,
  },

  // 레벨 업적
  {
    code: 'LEVEL_5',
    name: '성장 중',
    description: '레벨 5에 도달했습니다',
    icon: '📈',
    color: '#6366f1',
    category: 'LEVEL' as const,
    points: 30,
    condition: { type: 'level', value: 5 },
    isSecret: false,
  },
  {
    code: 'LEVEL_10',
    name: '두 자릿수',
    description: '레벨 10에 도달했습니다',
    icon: '🎉',
    color: '#8b5cf6',
    category: 'LEVEL' as const,
    points: 100,
    condition: { type: 'level', value: 10 },
    isSecret: false,
  },
]

const quotes = [
  { content: "작은 진전도 진전이다.", author: "무명", category: "motivation" },
  { content: "오늘 할 수 있는 일을 내일로 미루지 말라.", author: "벤저민 프랭클린", category: "motivation" },
  { content: "성공은 매일 반복한 작은 노력의 합이다.", author: "로버트 콜리어", category: "motivation" },
  { content: "시작이 반이다.", author: "아리스토텔레스", category: "motivation" },
  { content: "할 수 있다고 믿으면 이미 반은 이룬 것이다.", author: "시어도어 루스벨트", category: "motivation" },
  { content: "위대한 일은 작은 일들이 모여 이루어진다.", author: "빈센트 반 고흐", category: "motivation" },
  { content: "매일 조금씩 나아지면 결국 대단한 결과를 얻는다.", author: "존 우든", category: "growth" },
  { content: "실패는 성공의 어머니다.", author: "토마스 에디슨", category: "motivation" },
  { content: "습관이 바뀌면 인생이 바뀐다.", author: "무명", category: "habit" },
  { content: "1%의 개선이 모이면 37배의 성장이 된다.", author: "제임스 클리어", category: "growth" },
  { content: "지금 이 순간 최선을 다하라.", author: "오프라 윈프리", category: "motivation" },
  { content: "꿈을 이루는 유일한 방법은 행동하는 것이다.", author: "월트 디즈니", category: "goal" },
  { content: "어제보다 나은 오늘을 만들어라.", author: "무명", category: "growth" },
  { content: "작은 습관이 큰 변화를 만든다.", author: "BJ 포그", category: "habit" },
  { content: "포기하지 않는 것이 가장 큰 재능이다.", author: "무명", category: "motivation" },
]

async function main() {
  console.log('🌱 Seeding achievements...')

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: achievement,
      create: achievement,
    })
  }

  console.log('✅ Achievements seeded!')

  console.log('🌱 Seeding quotes...')

  // 기존 quotes 삭제 후 재생성
  await prisma.quote.deleteMany()

  for (const quote of quotes) {
    await prisma.quote.create({
      data: quote,
    })
  }

  console.log('✅ Quotes seeded!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
