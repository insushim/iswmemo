import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startOfWeek, endOfWeek, eachDayOfInterval, format, startOfDay, endOfDay } from "date-fns"
import { ko } from "date-fns/locale"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // 월요일 시작
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

    // 이번 주의 각 날짜
    const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd })

    // 이번 주 일별 완료된 할 일 수
    const weeklyTasksPromises = daysOfWeek.map(async (day) => {
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)

      const count = await prisma.task.count({
        where: {
          userId,
          isCompleted: true,
          completedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      })

      return {
        day: format(day, "E", { locale: ko }), // 월, 화, 수...
        date: format(day, "yyyy-MM-dd"),
        tasks: count,
      }
    })

    // 이번 주 일별 완료된 습관 수
    const weeklyHabitsPromises = daysOfWeek.map(async (day) => {
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)

      const count = await prisma.habitLog.count({
        where: {
          userId,
          date: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      })

      return {
        date: format(day, "yyyy-MM-dd"),
        habits: count,
      }
    })

    const [weeklyTasks, weeklyHabits] = await Promise.all([
      Promise.all(weeklyTasksPromises),
      Promise.all(weeklyHabitsPromises),
    ])

    // 주간 데이터 합치기
    const weeklyData = weeklyTasks.map((taskData) => {
      const habitData = weeklyHabits.find((h) => h.date === taskData.date)
      return {
        day: taskData.day,
        tasks: taskData.tasks,
        habits: habitData?.habits || 0,
      }
    })

    // 이번 주 총 완료 할 일 수
    const weeklyTasksCompleted = await prisma.task.count({
      where: {
        userId,
        isCompleted: true,
        completedAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    })

    // 이번 주 총 습관 달성 수
    const weeklyHabitsCompleted = await prisma.habitLog.count({
      where: {
        userId,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    })

    // 이번 주 작성된 메모 수
    const weeklyNotesCreated = await prisma.note.count({
      where: {
        userId,
        createdAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    })

    // 이번 주 달성된 목표 수
    const weeklyGoalsCompleted = await prisma.goal.count({
      where: {
        userId,
        status: "COMPLETED",
        updatedAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    })

    return NextResponse.json({
      weeklyData,
      summary: {
        tasks: weeklyTasksCompleted,
        habits: weeklyHabitsCompleted,
        notes: weeklyNotesCreated,
        goals: weeklyGoalsCompleted,
      },
    })
  } catch (error) {
    console.error("GET /api/stats error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
