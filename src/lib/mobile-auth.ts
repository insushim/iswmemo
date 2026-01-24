import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { auth } from "./auth"

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-key"

interface JWTPayload {
  userId: string
  email: string
}

interface AuthResult {
  userId: string | null
  error?: string
}

// 모바일 JWT 토큰 또는 NextAuth 세션에서 사용자 ID 추출
export async function getAuthUserId(req: NextRequest): Promise<AuthResult> {
  // 1. JWT Bearer 토큰 확인 (모바일 앱)
  const authHeader = req.headers.get("Authorization")

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1]

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
      return { userId: decoded.userId }
    } catch {
      return { userId: null, error: "Invalid or expired token" }
    }
  }

  // 2. NextAuth 세션 확인 (웹)
  try {
    const session = await auth()
    if (session?.user?.id) {
      return { userId: session.user.id }
    }
  } catch {
    // 세션 오류 무시
  }

  return { userId: null, error: "Unauthorized" }
}

// JWT 토큰 생성 (30일 유효)
export function createJWT(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: "30d" }
  )
}

// JWT 토큰 검증
export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}
