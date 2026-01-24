import { NextRequest, NextResponse } from "next/server"
import { getAuthUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { RoutineType } from "@prisma/client"

const updateRoutineSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(["MORNING", "AFTERNOON", "EVENING", "NIGHT", "CUSTOM"]).optional(),
  startTime: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  order: z.number().optional(),
})

// 루틴 상세 조회
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

    const routine = await prisma.routine.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
        logs: {
          orderBy: { date: "desc" },
          take: 30, // 최근 30일 기록
        },
      },
    })

    if (!routine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    return NextResponse.json(routine)
  } catch (error) {
    console.error("GET /api/routines/[id] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 루틴 수정
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
    const data = updateRoutineSchema.parse(body)

    // 루틴 존재 확인
    const existingRoutine = await prisma.routine.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!existingRoutine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    const routine = await prisma.routine.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.type && { type: data.type as RoutineType }),
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    })

    return NextResponse.json(routine)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PATCH /api/routines/[id] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 루틴 삭제
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

    // 루틴 존재 확인
    const existingRoutine = await prisma.routine.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!existingRoutine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    await prisma.routine.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/routines/[id] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
