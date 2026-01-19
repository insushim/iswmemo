import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { ReminderStatus } from "@prisma/client"

const createReminderSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  scheduledAt: z.string().datetime(),
  taskId: z.string().optional(),
  habitId: z.string().optional(),
  eventId: z.string().optional(),
})

// 알림 목록 조회
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status")

    const reminders = await prisma.reminder.findMany({
      where: {
        userId: session.user.id,
        ...(statusParam && Object.values(ReminderStatus).includes(statusParam as ReminderStatus)
          ? { status: statusParam as ReminderStatus }
          : {}),
      },
      include: {
        task: { select: { id: true, title: true } },
        habit: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: "asc" },
    })

    return NextResponse.json(reminders)
  } catch (error) {
    console.error("GET /api/reminders error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 알림 생성
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const data = createReminderSchema.parse(body)

    const reminder = await prisma.reminder.create({
      data: {
        title: data.title,
        body: data.body,
        scheduledAt: new Date(data.scheduledAt),
        taskId: data.taskId,
        habitId: data.habitId,
        eventId: data.eventId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("POST /api/reminders error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
