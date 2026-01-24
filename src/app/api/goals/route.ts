import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { GoalType, GoalStatus } from "@prisma/client"

const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['LIFE', 'LONG', 'SHORT', 'DECADE', 'FIVE_YEAR', 'YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  color: z.string().default("#6366f1"),
  icon: z.string().default("target"),
  parentId: z.string().optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ABANDONED']).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') as GoalType | null
    const status = searchParams.get('status') as GoalStatus | null

    const where: {
      userId: string
      type?: GoalType
      status?: GoalStatus
    } = {
      userId,
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

    // DB 타입을 모바일 앱 형식으로 변환
    const mappedGoals = goals.map(goal => {
      let mobileType = goal.type as string
      if (goal.type === 'YEARLY' || goal.type === 'DECADE' || goal.type === 'FIVE_YEAR') {
        mobileType = 'LONG'
      } else if (goal.type === 'MONTHLY' || goal.type === 'QUARTERLY' || goal.type === 'WEEKLY' || goal.type === 'DAILY') {
        mobileType = 'SHORT'
      }
      return { ...goal, type: mobileType }
    })

    return NextResponse.json(mappedGoals)
  } catch (error) {
    console.error('GET /api/goals error:', error)
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
    const validatedData = createGoalSchema.parse(body)

    // 모바일 앱에서 사용하는 타입 매핑
    let goalType = validatedData.type
    if (goalType === 'LONG') goalType = 'YEARLY'
    if (goalType === 'SHORT') goalType = 'MONTHLY'

    const goal = await prisma.goal.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        type: goalType as GoalType,
        priority: validatedData.priority,
        targetValue: validatedData.targetValue,
        unit: validatedData.unit,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : new Date(),
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        color: validatedData.color,
        icon: validatedData.icon,
        parentId: validatedData.parentId,
        status: validatedData.status as GoalStatus || 'IN_PROGRESS',
        userId,
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
