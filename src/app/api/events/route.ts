import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns"

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  color: z.string().default("#6366f1"),
})

// 일정 목록 조회
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const date = searchParams.get("date")

    let startDate: Date
    let endDate: Date

    if (date) {
      // 특정 날짜의 일정
      startDate = startOfDay(new Date(date))
      endDate = endOfDay(new Date(date))
    } else if (year && month) {
      // 특정 월의 일정
      const targetDate = new Date(parseInt(year), parseInt(month) - 1, 1)
      startDate = startOfMonth(targetDate)
      endDate = endOfMonth(targetDate)
    } else {
      // 기본: 현재 월
      startDate = startOfMonth(new Date())
      endDate = endOfMonth(new Date())
    }

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: session.user.id,
        OR: [
          {
            startAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            endAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      orderBy: { startAt: "asc" },
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error("GET /api/events error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 일정 생성
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const data = createEventSchema.parse(body)

    const event = await prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        isAllDay: data.isAllDay,
        color: data.color,
        userId: session.user.id,
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("POST /api/events error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
