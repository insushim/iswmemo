import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmail, getPasswordResetEmailHtml } from "@/lib/email"
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

    // 보안: 사용자가 없어도 같은 응답 반환 (이메일 존재 여부 노출 방지)
    if (!user) {
      return NextResponse.json(
        { message: "해당 이메일로 비밀번호 재설정 링크를 전송했습니다" },
        { status: 200 }
      )
    }

    // 소셜 로그인 계정은 비밀번호 재설정 불가
    if (!user.password) {
      return NextResponse.json(
        { error: "소셜 로그인으로 가입한 계정입니다. 해당 소셜 서비스에서 비밀번호를 재설정해주세요." },
        { status: 400 }
      )
    }

    // 기존 토큰 삭제
    await prisma.passwordResetToken.deleteMany({
      where: { email }
    })

    // 새 토큰 생성 (1시간 유효)
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

    // 실제 이메일 발송
    try {
      await sendEmail({
        to: email,
        subject: "[GrowthPad] 비밀번호 재설정",
        html: getPasswordResetEmailHtml(resetUrl, user.name || undefined)
      })
      console.log("비밀번호 재설정 이메일 발송 성공:", email)
    } catch (emailError) {
      console.error("이메일 발송 실패:", emailError)
      // 이메일 발송 실패 시에도 토큰은 생성되었으므로
      // 개발 환경에서는 URL을 반환하고, 프로덕션에서는 에러 반환
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            message: "이메일 발송 실패 (개발 환경)",
            resetUrl,
            error: "이메일 발송에 실패했습니다. 환경 변수를 확인해주세요."
          },
          { status: 200 }
        )
      }
      return NextResponse.json(
        { error: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: "해당 이메일로 비밀번호 재설정 링크를 전송했습니다",
        // 개발 환경에서만 URL 표시 (테스트 용이)
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
