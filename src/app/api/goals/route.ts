import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { GoalType, GoalStatus } from "@prisma/client"

const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['LIFE', 'DECADE', 'FIVE_YEAR', 'YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  color: z.string().default("#6366f1"),
  icon: z.string().default("target"),
  parentId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') as GoalType | null
    const status = searchParams.get('status') as GoalStatus | null

    const where: {
      userId: string
      type?: GoalType
      status?: GoalStatus
    } = {
      userId: session.user.id,
    }

    if (type) where.type = type
    if (status) where.status = status

    const goals = await prisma.goal.findMany({
      where,
      include: {
        children: {
          select: { id: true, title: true, progress: true, status: true }
        },
        tasks: {
          select: { id: true, title: true, isCompleted: true }
        },
        milestones: {
          orderBy: { order: 'asc' }
        },
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json(goals)
  } catch (error) {
    console.error('GET /api/goals error:', error)
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
    const validatedData = createGoalSchema.parse(body)

    const goal = await prisma.goal.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        type: validatedData.type,
        priority: validatedData.priority,
        targetValue: validatedData.targetValue,
        unit: validatedData.unit,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : new Date(),
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        color: validatedData.color,
        icon: validatedData.icon,
        parentId: validatedData.parentId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(goal, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('POST /api/goals error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
