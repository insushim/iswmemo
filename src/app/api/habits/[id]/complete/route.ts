import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { awardPoints, checkAchievements } from "@/lib/gamification"
import { startOfDay } from "date-fns"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { date } = await req.json()
    const habitDate = startOfDay(new Date(date))

    const habit = await prisma.habit.findFirst({
      where: {
        id,
        userId,
      }
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // 기존 로그 확인
    const existingLog = await prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: id,
          date: habitDate,
        }
      }
    })

    let log
    if (existingLog) {
      // 카운트 증가
      log = await prisma.habitLog.update({
        where: { id: existingLog.id },
        data: { count: { increment: 1 } }
      })
    } else {
      // 새 로그 생성
      log = await prisma.habitLog.create({
        data: {
          habitId: id,
          userId,
          date: habitDate,
          count: 1,
        }
      })

      // 스트릭 업데이트
      const yesterday = startOfDay(new Date(habitDate))
      yesterday.setDate(yesterday.getDate() - 1)

      const yesterdayLog = await prisma.habitLog.findUnique({
        where: {
          habitId_date: {
            habitId: id,
            date: yesterday,
          }
        }
      })

      let newStreak = 1
      if (yesterdayLog) {
        newStreak = habit.currentStreak + 1
      }

      const newLongestStreak = Math.max(newStreak, habit.longestStreak)

      await prisma.habit.update({
        where: { id },
        data: {
          currentStreak: newStreak,
          longestStreak: newLongestStreak,
          totalCompletions: { increment: 1 },
        }
      })

      // 포인트 지급
      await awardPoints(userId, 'HABIT_COMPLETE')

      // 스트릭 보너스
      if (newStreak === 7) await awardPoints(userId, 'HABIT_STREAK_7')
      if (newStreak === 30) await awardPoints(userId, 'HABIT_STREAK_30')
      if (newStreak === 100) await awardPoints(userId, 'HABIT_STREAK_100')

      // 업적 체크
      await checkAchievements(userId, 'HABITS')
    }

    return NextResponse.json(log)
  } catch (error) {
    console.error('POST /api/habits/[id]/complete error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { date } = await req.json()
    const habitDate = startOfDay(new Date(date))

    const habit = await prisma.habit.findFirst({
      where: { id, userId }
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const existingLog = await prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId: id,
          date: habitDate,
        }
      }
    })

    if (existingLog) {
      await prisma.habitLog.delete({
        where: { id: existingLog.id }
      })

      await prisma.habit.update({
        where: { id },
        data: {
          currentStreak: Math.max(0, habit.currentStreak - 1),
          totalCompletions: Math.max(0, habit.totalCompletions - 1),
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/habits/[id]/complete error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
