import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-key"

// 모바일 앱용 로그인 API
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력해주세요" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        password: true,
        level: true,
        experience: true,
        totalPoints: true,
        currentStreak: true,
        longestStreak: true,
        theme: true,
        timezone: true,
        createdAt: true,
      }
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
        { status: 401 }
      )
    }

    const isValid = await bcrypt.compare(password, user.password)

    if (!isValid) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
        { status: 401 }
      )
    }

    // JWT 토큰 생성 (30일 유효)
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    )

    // 비밀번호 제외하고 반환
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json({
      success: true,
      token,
      user: userWithoutPassword
    })
  } catch (error) {
    console.error("Mobile login error:", error)
    return NextResponse.json(
      { error: "로그인 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
