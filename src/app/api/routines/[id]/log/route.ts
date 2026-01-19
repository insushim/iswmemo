import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const toggleItemSchema = z.object({
  itemIndex: z.number().min(0),
})

const startRoutineSchema = z.object({
  action: z.literal("start"),
})

// 오늘의 루틴 로그 조회 또는 아이템 토글
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: routineId } = await params
    const body = await req.json()

    // 루틴 존재 확인
    const routine = await prisma.routine.findFirst({
      where: {
        id: routineId,
        userId: session.user.id,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    })

    if (!routine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 루틴 시작 요청
    if (body.action === "start") {
      // 오늘의 로그 조회 또는 생성
      let log = await prisma.routineLog.findFirst({
        where: {
          routineId,
          date: today,
        },
      })

      if (!log) {
        log = await prisma.routineLog.create({
          data: {
            routineId,
            userId: session.user.id,
            date: today,
            startedAt: new Date(),
            completedItems: [],
          },
        })
      } else if (!log.startedAt) {
        log = await prisma.routineLog.update({
          where: { id: log.id },
          data: { startedAt: new Date() },
        })
      }

      return NextResponse.json(log)
    }

    // 아이템 토글 요청
    const toggleData = toggleItemSchema.parse(body)
    const itemIndex = toggleData.itemIndex

    if (itemIndex >= routine.items.length) {
      return NextResponse.json({ error: "Invalid item index" }, { status: 400 })
    }

    // 오늘의 로그 조회 또는 생성
    let log = await prisma.routineLog.findFirst({
      where: {
        routineId,
        date: today,
      },
    })

    if (!log) {
      log = await prisma.routineLog.create({
        data: {
          routineId,
          userId: session.user.id,
          date: today,
          startedAt: new Date(),
          completedItems: [itemIndex],
        },
      })
    } else {
      const completedItems = (log.completedItems as number[]) || []
      const isCompleted = completedItems.includes(itemIndex)

      let newCompletedItems: number[]
      if (isCompleted) {
        // 완료 해제
        newCompletedItems = completedItems.filter((i) => i !== itemIndex)
      } else {
        // 완료 처리
        newCompletedItems = [...completedItems, itemIndex]
      }

      // 모든 아이템 완료 시 completedAt 설정
      const allCompleted = newCompletedItems.length === routine.items.length

      log = await prisma.routineLog.update({
        where: { id: log.id },
        data: {
          completedItems: newCompletedItems,
          completedAt: allCompleted ? new Date() : null,
        },
      })
    }

    return NextResponse.json(log)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("POST /api/routines/[id]/log error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 오늘의 루틴 로그 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: routineId } = await params

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const log = await prisma.routineLog.findFirst({
      where: {
        routineId,
        userId: session.user.id,
        date: today,
      },
    })

    return NextResponse.json(log || { completedItems: [] })
  } catch (error) {
    console.error("GET /api/routines/[id]/log error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
