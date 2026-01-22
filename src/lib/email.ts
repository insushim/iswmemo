import { Resend } from "resend"

// 지연 초기화 - API 키가 없어도 빌드는 가능
let resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error("RESEND_API_KEY 환경 변수가 설정되지 않았습니다")
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const resend = getResendClient()

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "GrowthPad <onboarding@resend.dev>",
      to,
      subject,
      html,
    })

    if (error) {
      console.error("이메일 발송 오류:", error)
      throw new Error(error.message)
    }

    return { success: true, data }
  } catch (error) {
    console.error("이메일 발송 실패:", error)
    throw error
  }
}

export function getPasswordResetEmailHtml(resetUrl: string, userName?: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>비밀번호 재설정</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(135deg, #6366f1, #9333ea); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🌱</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #6366f1, #9333ea); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                GrowthPad
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b; text-align: center;">
                비밀번호 재설정 요청
              </h2>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #71717a; text-align: center;">
                ${userName ? `안녕하세요, ${userName}님!<br><br>` : ""}
                비밀번호 재설정을 요청하셨습니다.<br>
                아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.
              </p>

              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center; padding: 16px 0;">
                    <a href="${resetUrl}"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #9333ea); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);">
                      비밀번호 재설정하기
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; font-size: 12px; line-height: 1.6; color: #a1a1aa; text-align: center;">
                이 링크는 <strong>1시간 후</strong> 만료됩니다.<br>
                본인이 요청하지 않았다면 이 이메일을 무시해주세요.
              </p>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
                <p style="margin: 0 0 8px; font-size: 11px; color: #71717a;">
                  버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:
                </p>
                <p style="margin: 0; font-size: 11px; color: #6366f1; word-break: break-all;">
                  ${resetUrl}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                © ${new Date().getFullYear()} GrowthPad. All rights reserved.<br>
                성장하는 나의 하루
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}
