import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { startOfDay, subDays } from "date-fns"

const createHabitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  icon: z.string().default("check-circle"),
  color: z.string().default("#22c55e"),
  frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']).default('DAILY'),
  targetDays: z.array(z.number()).default([0, 1, 2, 3, 4, 5, 6]),
  targetCount: z.number().default(1),
  reminderTime: z.string().optional().nullable(),
  timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANYTIME']).default('ANYTIME'),
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const today = startOfDay(new Date())
    const weekAgo = subDays(today, 7)

    const habits = await prisma.habit.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        logs: {
          where: {
            date: { gte: weekAgo }
          },
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json(habits)
  } catch (error) {
    console.error('GET /api/habits error:', error)
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
    const validatedData = createHabitSchema.parse(body)

    const habit = await prisma.habit.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
    })

    return NextResponse.json(habit, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('POST /api/habits error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
