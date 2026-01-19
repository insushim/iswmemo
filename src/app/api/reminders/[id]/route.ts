import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// 알림 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    })

    if (!reminder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (reminder.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.reminder.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/reminders/[id] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// 알림 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    const reminder = await prisma.reminder.findUnique({
      where: { id },
    })

    if (!reminder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (reminder.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.body && { body: body.body }),
        ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
        ...(body.status && { status: body.status }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("PATCH /api/reminders/[id] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
