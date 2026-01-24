import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns"
import { awardPoints, checkAchievements } from "@/lib/gamification"

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const today = searchParams.get('today') === 'true'
    const completed = searchParams.get('completed')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      userId,
    }

    if (completed !== null) {
      where.isCompleted = completed === 'true'
    }

    // 월별 조회 (캘린더용)
    if (year && month) {
      const targetDate = new Date(parseInt(year), parseInt(month) - 1, 1)
      const monthStart = startOfMonth(targetDate)
      const monthEnd = endOfMonth(targetDate)
      where.dueDate = {
        gte: monthStart,
        lte: monthEnd,
      }
    } else if (today) {
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())
      where.OR = [
        { dueDate: { gte: todayStart, lte: todayEnd } },
        { dueDate: null, isCompleted: false }
      ]
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        goal: {
          select: { id: true, title: true, color: true }
        }
      },
      orderBy: [
        { isCompleted: 'asc' },
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    // 월별 조회시 tasks 객체로 반환
    if (year && month) {
      return NextResponse.json({ tasks })
    }

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = createTaskSchema.parse(body)

    const task = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        priority: validatedData.priority,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        dueTime: validatedData.dueTime,
        goalId: validatedData.goalId,
        userId,
      },
      include: {
        goal: {
          select: { id: true, title: true, color: true }
        }
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('POST /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    // URL 쿼리에서 id 가져오기 (모바일 앱 호환)
    const { searchParams } = new URL(req.url)
    const queryId = searchParams.get('id')

    const body = await req.json()
    const { id: bodyId, isCompleted, ...rest } = body

    const id = queryId || bodyId
    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id, userId }
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        ...rest,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      include: {
        goal: {
          select: { id: true, title: true, color: true }
        }
      },
    })

    // 완료 시 포인트 지급
    if (isCompleted && !task.isCompleted) {
      await awardPoints(userId, 'TASK_COMPLETE')
      await checkAchievements(userId, 'TASKS')
    }

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('PATCH /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    // URL 쿼리에서 id 가져오기 (모바일 앱 호환)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id, userId }
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    await prisma.task.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
