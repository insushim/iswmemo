import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-key"

// 모바일 앱용 토큰 검증 및 사용자 정보 조회 API
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "인증 토큰이 필요합니다" },
        { status: 401 }
      )
    }

    const token = authHeader.split(" ")[1]

    let decoded: { userId: string; email: string }
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    } catch {
      return NextResponse.json(
        { error: "유효하지 않거나 만료된 토큰입니다" },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
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

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user
    })
  } catch (error) {
    console.error("Token verify error:", error)
    return NextResponse.json(
      { error: "토큰 검증 중 오류가 발생했습니다" },
      { status: 500 }
    )
  }
}
