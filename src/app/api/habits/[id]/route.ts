import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateHabitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional(),
  color: z.string().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']).optional(),
  targetDays: z.array(z.number()).optional(),
  targetCount: z.number().optional(),
  reminderTime: z.string().optional().nullable(),
  timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANYTIME']).optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
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

    const habit = await prisma.habit.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        logs: {
          orderBy: { date: 'desc' },
          take: 30,
        }
      }
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    return NextResponse.json(habit)
  } catch (error) {
    console.error('GET /api/habits/[id] error:', error)
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
    const validatedData = updateHabitSchema.parse(body)

    const habit = await prisma.habit.findFirst({
      where: {
        id,
        userId,
      }
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    const updatedHabit = await prisma.habit.update({
      where: { id },
      data: validatedData,
    })

    return NextResponse.json(updatedHabit)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('PATCH /api/habits/[id] error:', error)
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

    const habit = await prisma.habit.findFirst({
      where: {
        id,
        userId,
      }
    })

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 })
    }

    // 관련 로그 먼저 삭제
    await prisma.habitLog.deleteMany({
      where: { habitId: id }
    })

    // 습관 삭제
    await prisma.habit.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/habits/[id] error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
