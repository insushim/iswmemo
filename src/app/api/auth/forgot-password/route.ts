import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: "이메일을 입력해주세요" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json(
        { message: "해당 이메일로 비밀번호 재설정 링크를 전송했습니다" },
        { status: 200 }
      )
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스에서 비밀번호를 재설정해주세요." },
        { status: 400 }
      )
    }

    await prisma.passwordResetToken.deleteMany({
      where: { email }
    })

    const token = crypto.randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 3600000)

    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expires
      }
    })

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password/${token}`

    console.log("비밀번호 재설정 링크:", resetUrl)

    return NextResponse.json(
      {
        message: "해당 이메일로 비밀번호 재설정 링크를 전송했습니다",
        resetUrl: process.env.NODE_ENV === "development" ? resetUrl : undefined
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("비밀번호 재설정 요청 오류:", error)
    return NextResponse.json(
      { error: "비밀번호 재설정 요청 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
