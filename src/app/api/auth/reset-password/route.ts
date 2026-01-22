import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: "토큰과 비밀번호를 모두 입력해주세요" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "비밀번호는 6자 이상이어야 합니다" },
        { status: 400 }
      )
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token }
    })

    if (!resetToken) {
      return NextResponse.json(
        { error: "유효하지 않은 토큰입니다" },
        { status: 400 }
      )
    }

    if (resetToken.expires < new Date()) {
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id }
      })
      return NextResponse.json(
        { error: "토큰이 만료되었습니다. 비밀번호 재설정을 다시 요청해주세요." },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashedPassword }
    })

    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id }
    })

    return NextResponse.json(
      { message: "비밀번호가 성공적으로 변경되었습니다" },
      { status: 200 }
    )
  } catch (error) {
    console.error("비밀번호 재설정 오류:", error)
    return NextResponse.json(
      { error: "비밀번호 재설정 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
