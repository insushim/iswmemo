import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { GoalStatus } from "@prisma/client"

const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ABANDONED']).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const goal = await prisma.goal.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        children: true,
        tasks: true,
        milestones: {
          orderBy: { order: 'asc' }
        },
      }
    })

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 })
    }

    return NextResponse.json(goal)
  } catch (error) {
    console.error('GET /api/goals/[id] error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const validatedData = updateGoalSchema.parse(body)

    const goal = await prisma.goal.findFirst({
      where: {
        id,
        userId,
      }
    })

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 })
    }

    const updatedGoal = await prisma.goal.update({
      where: { id },
      data: {
        ...validatedData,
        status: validatedData.status as GoalStatus,
        completedAt: validatedData.status === 'COMPLETED' ? new Date() : goal.completedAt,
      },
    })

    return NextResponse.json(updatedGoal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('PATCH /api/goals/[id] error:', error)
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

    const goal = await prisma.goal.findFirst({
      where: {
        id,
        userId,
      }
    })

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 })
    }

    // 관련 마일스톤 삭제
    await prisma.milestone.deleteMany({
      where: { goalId: id }
    })

    // 관련 태스크 연결 해제 (삭제하지 않음)
    await prisma.task.updateMany({
      where: { goalId: id },
      data: { goalId: null }
    })

    // 목표 삭제
    await prisma.goal.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/goals/[id] error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
