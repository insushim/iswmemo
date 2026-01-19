import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import webpush from "web-push"

// VAPID 설정 - 환경 변수가 있을 때만 설정
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

let isVapidConfigured = false

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      "mailto:contact@growthpad.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )
    isVapidConfigured = true
  } catch (error) {
    console.error("VAPID configuration error:", error)
  }
}

export async function POST(req: NextRequest) {
  try {
    // VAPID가 설정되지 않았으면 푸시 알림 비활성화
    if (!isVapidConfigured) {
      return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 })
    }

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { title, body, url } = await req.json()

    // 사용자의 모든 구독 가져오기
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: session.user.id },
    })

    if (subscriptions.length === 0) {
      return NextResponse.json({ error: "No push subscriptions" }, { status: 400 })
    }

    const payload = JSON.stringify({
      title: title || "GrowthPad",
      body: body || "새로운 알림이 있습니다",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: { url: url || "/dashboard" },
    })

    // 모든 구독에 알림 전송
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          )
          return { success: true, endpoint: sub.endpoint }
        } catch (error: unknown) {
          // 구독이 만료되었으면 삭제
          const pushError = error as { statusCode?: number; message?: string }
          if (pushError.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { id: sub.id },
            })
          }
          return { success: false, endpoint: sub.endpoint, error: pushError.message }
        }
      })
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Push send error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
