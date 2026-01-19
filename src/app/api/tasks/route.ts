import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { startOfDay, endOfDay } from "date-fns"
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
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const today = searchParams.get('today') === 'true'
    const completed = searchParams.get('completed')

    const where: {
      userId: string
      isCompleted?: boolean
      OR?: { dueDate?: { gte?: Date; lte?: Date } | null; isCompleted?: boolean }[]
    } = {
      userId: session.user.id,
    }

    if (completed !== null) {
      where.isCompleted = completed === 'true'
    }

    if (today) {
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

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
        userId: session.user.id,
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
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { id, isCompleted, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id, userId: session.user.id }
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
      await awardPoints(session.user.id, 'TASK_COMPLETE')
      await checkAchievements(session.user.id, 'TASKS')
    }

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('PATCH /api/tasks error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
