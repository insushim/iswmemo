import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 모든 업적 가져오기
    const allAchievements = await prisma.achievement.findMany({
      orderBy: [{ category: "asc" }, { points: "asc" }],
    })

    // 사용자가 달성한 업적
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: session.user.id },
      include: { achievement: true },
    })

    const unlockedIds = new Set(userAchievements.map((ua) => ua.achievementId))

    // 사용자 데이터 (진행도 계산용)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        currentStreak: true,
        longestStreak: true,
        level: true,
      },
    })

    // 각 카운트 가져오기
    const [noteCount, goalCount, completedGoalCount, habitCount, taskCount] =
      await Promise.all([
        prisma.note.count({ where: { userId: session.user.id } }),
        prisma.goal.count({ where: { userId: session.user.id } }),
        prisma.goal.count({
          where: { userId: session.user.id, status: "COMPLETED" },
        }),
        prisma.habit.count({
          where: { userId: session.user.id, isActive: true },
        }),
        prisma.task.count({
          where: { userId: session.user.id, isCompleted: true },
        }),
      ])

    // 습관 최대 스트릭 찾기
    const maxHabitStreak = await prisma.habit.findFirst({
      where: { userId: session.user.id },
      orderBy: { longestStreak: "desc" },
      select: { longestStreak: true },
    })

    // 업적에 진행도 추가
    const achievementsWithProgress = allAchievements.map((achievement) => {
      const isUnlocked = unlockedIds.has(achievement.id)
      const userAchievement = userAchievements.find(
        (ua) => ua.achievementId === achievement.id
      )

      let progress = 0
      let target = 1

      // condition JSON에서 target 추출
      const condition = achievement.condition as { type?: string; value?: number } | null

      if (condition && condition.value) {
        target = condition.value

        // 카테고리에 따른 진행도 계산
        switch (achievement.category) {
          case "STREAK":
            progress = user?.currentStreak || 0
            break
          case "NOTES":
            progress = noteCount
            break
          case "GOALS":
            if (condition.type === "complete") {
              progress = completedGoalCount
            } else {
              progress = goalCount
            }
            break
          case "HABITS":
            progress = maxHabitStreak?.longestStreak || 0
            break
          case "TASKS":
            progress = taskCount
            break
          case "LEVEL":
            progress = user?.level || 1
            break
          default:
            progress = isUnlocked ? target : 0
        }
      }

      return {
        id: achievement.id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        color: achievement.color,
        category: achievement.category,
        points: achievement.points,
        isUnlocked,
        unlockedAt: userAchievement?.unlockedAt?.toISOString(),
        progress: isUnlocked ? target : Math.min(progress, target),
        target,
      }
    })

    // 업적이 없으면 기본 업적 반환
    if (achievementsWithProgress.length === 0) {
      return NextResponse.json({
        achievements: getDefaultAchievements(user, {
          noteCount,
          goalCount,
          completedGoalCount,
          taskCount,
          maxHabitStreak: maxHabitStreak?.longestStreak || 0,
        }),
      })
    }

    return NextResponse.json({ achievements: achievementsWithProgress })
  } catch (error) {
    console.error("GET /api/achievements error:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}

// DB에 업적이 없을 때 기본 업적 목록 (진행도 포함)
function getDefaultAchievements(
  user: { currentStreak: number; longestStreak: number; level: number } | null,
  counts: {
    noteCount: number
    goalCount: number
    completedGoalCount: number
    taskCount: number
    maxHabitStreak: number
  }
) {
  const currentStreak = user?.currentStreak || 0
  const level = user?.level || 1

  return [
    // STREAK
    {
      id: "default_streak_7",
      code: "streak_7",
      name: "일주일 연속",
      description: "7일 연속 접속하기",
      icon: "flame",
      color: "#f97316",
      category: "STREAK",
      points: 50,
      isUnlocked: currentStreak >= 7,
      progress: Math.min(currentStreak, 7),
      target: 7,
    },
    {
      id: "default_streak_30",
      code: "streak_30",
      name: "한 달 연속",
      description: "30일 연속 접속하기",
      icon: "flame",
      color: "#f97316",
      category: "STREAK",
      points: 200,
      isUnlocked: currentStreak >= 30,
      progress: Math.min(currentStreak, 30),
      target: 30,
    },
    // NOTES
    {
      id: "default_notes_first",
      code: "notes_first",
      name: "첫 메모",
      description: "첫 번째 메모 작성하기",
      icon: "sticky-note",
      color: "#eab308",
      category: "NOTES",
      points: 10,
      isUnlocked: counts.noteCount >= 1,
      progress: Math.min(counts.noteCount, 1),
      target: 1,
    },
    {
      id: "default_notes_10",
      code: "notes_10",
      name: "메모 수집가",
      description: "메모 10개 작성하기",
      icon: "sticky-note",
      color: "#eab308",
      category: "NOTES",
      points: 50,
      isUnlocked: counts.noteCount >= 10,
      progress: Math.min(counts.noteCount, 10),
      target: 10,
    },
    // GOALS
    {
      id: "default_goals_first",
      code: "goals_first",
      name: "목표 설정",
      description: "첫 번째 목표 설정하기",
      icon: "target",
      color: "#8b5cf6",
      category: "GOALS",
      points: 15,
      isUnlocked: counts.goalCount >= 1,
      progress: Math.min(counts.goalCount, 1),
      target: 1,
    },
    {
      id: "default_goals_complete",
      code: "goals_complete",
      name: "목표 달성",
      description: "목표 하나 완료하기",
      icon: "target",
      color: "#8b5cf6",
      category: "GOALS",
      points: 100,
      isUnlocked: counts.completedGoalCount >= 1,
      progress: Math.min(counts.completedGoalCount, 1),
      target: 1,
    },
    // HABITS
    {
      id: "default_habits_streak_7",
      code: "habits_streak_7",
      name: "습관 마스터",
      description: "습관 7일 연속 달성하기",
      icon: "repeat",
      color: "#22c55e",
      category: "HABITS",
      points: 75,
      isUnlocked: counts.maxHabitStreak >= 7,
      progress: Math.min(counts.maxHabitStreak, 7),
      target: 7,
    },
    // TASKS
    {
      id: "default_tasks_10",
      code: "tasks_10",
      name: "할 일 정복자",
      description: "할 일 10개 완료하기",
      icon: "check-circle",
      color: "#3b82f6",
      category: "TASKS",
      points: 50,
      isUnlocked: counts.taskCount >= 10,
      progress: Math.min(counts.taskCount, 10),
      target: 10,
    },
    {
      id: "default_tasks_50",
      code: "tasks_50",
      name: "할 일 마스터",
      description: "할 일 50개 완료하기",
      icon: "check-circle",
      color: "#3b82f6",
      category: "TASKS",
      points: 150,
      isUnlocked: counts.taskCount >= 50,
      progress: Math.min(counts.taskCount, 50),
      target: 50,
    },
    // LEVEL
    {
      id: "default_level_5",
      code: "level_5",
      name: "새싹 성장",
      description: "레벨 5 달성하기",
      icon: "star",
      color: "#fbbf24",
      category: "LEVEL",
      points: 100,
      isUnlocked: level >= 5,
      progress: Math.min(level, 5),
      target: 5,
    },
    {
      id: "default_level_10",
      code: "level_10",
      name: "성장하는 나무",
      description: "레벨 10 달성하기",
      icon: "star",
      color: "#fbbf24",
      category: "LEVEL",
      points: 250,
      isUnlocked: level >= 10,
      progress: Math.min(level, 10),
      target: 10,
    },
    // SPECIAL
    {
      id: "default_special_first_day",
      code: "special_first_day",
      name: "새로운 시작",
      description: "GrowthPad 가입하기",
      icon: "zap",
      color: "#ec4899",
      category: "SPECIAL",
      points: 10,
      isUnlocked: true, // 가입하면 항상 달성
      progress: 1,
      target: 1,
    },
  ]
}
