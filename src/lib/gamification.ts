import { prisma } from "@/lib/prisma"
import { pointSystem, levelSystem } from "@/lib/design-system"

export type PointType = keyof typeof pointSystem

export async function awardPoints(userId: string, type: PointType, multiplier: number = 1) {
  try {
    const basePoints = typeof pointSystem[type] === 'function'
      ? (pointSystem[type] as (n: number) => number)(multiplier)
      : pointSystem[type] as number

    const points = Math.floor(basePoints * multiplier)

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        totalPoints: { increment: points },
        experience: { increment: points },
      },
      select: {
        experience: true,
        level: true,
      }
    })

    const newLevel = levelSystem.getLevel(user.experience)
    if (newLevel > user.level) {
      await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel }
      })

      await checkLevelAchievements(userId, newLevel)

      return { points, levelUp: true, newLevel }
    }

    return { points, levelUp: false }
  } catch (error) {
    console.error('awardPoints error:', error)
    return { points: 0, levelUp: false }
  }
}

export async function checkAchievements(
  userId: string,
  category: 'STREAK' | 'NOTES' | 'GOALS' | 'HABITS' | 'TASKS' | 'ROUTINE' | 'LEVEL' | 'SPECIAL'
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        achievements: true,
        notes: true,
        goals: true,
        habits: true,
        tasks: true,
      }
    })

    if (!user) return []

    const unlockedAchievementIds = user.achievements.map(a => a.achievementId)

    const achievements = await prisma.achievement.findMany({
      where: {
        category,
        id: { notIn: unlockedAchievementIds }
      }
    })

    if (!achievements || achievements.length === 0) return []

    const newAchievements: string[] = []

    for (const achievement of achievements) {
      const condition = achievement.condition as { type: string; value: number | string } | null
      if (!condition) continue

      let unlocked = false

      switch (condition.type) {
        case 'streak':
          unlocked = user.currentStreak >= (condition.value as number)
          break
        case 'notes_count':
          unlocked = user.notes.length >= (condition.value as number)
          break
        case 'goals_completed':
          const completedGoals = user.goals.filter(g => g.status === 'COMPLETED').length
          unlocked = completedGoals >= (condition.value as number)
          break
        case 'habits_streak':
          const maxHabitStreak = Math.max(...user.habits.map(h => h.currentStreak), 0)
          unlocked = maxHabitStreak >= (condition.value as number)
          break
        case 'tasks_completed':
          const completedTasks = user.tasks.filter(t => t.isCompleted).length
          unlocked = completedTasks >= (condition.value as number)
          break
        case 'level':
          unlocked = user.level >= (condition.value as number)
          break
        case 'total_points':
          unlocked = user.totalPoints >= (condition.value as number)
          break
      }

      if (unlocked) {
        await prisma.userAchievement.create({
          data: {
            userId,
            achievementId: achievement.id,
          }
        })

        await prisma.user.update({
          where: { id: userId },
          data: {
            totalPoints: { increment: achievement.points },
            experience: { increment: achievement.points },
          }
        })

        newAchievements.push(achievement.id)
      }
    }

    return newAchievements
  } catch (error) {
    console.error('checkAchievements error:', error)
    return []
  }
}

async function checkLevelAchievements(userId: string, level: number) {
  const levelMilestones = [5, 10, 25, 50, 100]

  if (levelMilestones.includes(level)) {
    await checkAchievements(userId, 'LEVEL')
  }
}
