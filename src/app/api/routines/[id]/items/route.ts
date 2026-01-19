import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const addItemSchema = z.object({
  name: z.string().min(1),
  duration: z.number().optional(),
})

const deleteItemSchema = z.object({
  itemId: z.string(),
})

// 루틴 아이템 추가
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
    const data = addItemSchema.parse(body)

    // 루틴 존재 확인
    const routine = await prisma.routine.findFirst({
      where: {
        id: routineId,
        userId: session.user.id,
      },
      include: {
        items: true,
      },
    })

    if (!routine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    const item = await prisma.routineItem.create({
      data: {
        name: data.name,
        duration: data.duration,
        order: routine.items.length,
        routineId,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("POST /api/routines/[id]/items error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 루틴 아이템 삭제
export async function DELETE(
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
    const data = deleteItemSchema.parse(body)

    // 루틴 존재 확인
    const routine = await prisma.routine.findFirst({
      where: {
        id: routineId,
        userId: session.user.id,
      },
    })

    if (!routine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 })
    }

    // 아이템 존재 확인
    const item = await prisma.routineItem.findFirst({
      where: {
        id: data.itemId,
        routineId,
      },
    })

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    await prisma.routineItem.delete({
      where: { id: data.itemId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("DELETE /api/routines/[id]/items error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
