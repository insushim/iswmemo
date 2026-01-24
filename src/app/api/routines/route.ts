import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { RoutineType } from "@prisma/client"

const createRoutineSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["MORNING", "AFTERNOON", "EVENING", "NIGHT", "CUSTOM"]),
  startTime: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    duration: z.number().optional(),
  })).optional(),
})

// 루틴 목록 조회
export async function GET(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const routines = await prisma.routine.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
        logs: {
          where: {
            date: today,
          },
          take: 1,
        },
      },
      orderBy: [
        { type: "asc" },
        { order: "asc" },
      ],
    })

    // 오늘의 진행 상태를 포함하여 반환
    const routinesWithProgress = routines.map((routine) => {
      const todayLog = routine.logs[0]
      return {
        ...routine,
        todayLog: todayLog || null,
        completedItemsToday: todayLog?.completedItems || [],
      }
    })

    return NextResponse.json({ routines: routinesWithProgress })
  } catch (error) {
    console.error("GET /api/routines error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 루틴 생성
export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await getAuthUserId(req)
    if (!userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const data = createRoutineSchema.parse(body)

    // 같은 타입의 루틴 개수로 순서 결정
    const existingCount = await prisma.routine.count({
      where: {
        userId,
        type: data.type as RoutineType,
      },
    })

    const routine = await prisma.routine.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type as RoutineType,
        startTime: data.startTime,
        order: existingCount,
        userId,
        items: data.items && data.items.length > 0 ? {
          create: data.items.map((item, index) => ({
            name: item.name,
            duration: item.duration,
            order: index,
          })),
        } : undefined,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    })

    return NextResponse.json(routine, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("POST /api/routines error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
