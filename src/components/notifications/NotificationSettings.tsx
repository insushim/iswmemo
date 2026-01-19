"use client"

import { useState, useEffect } from "react"
import { Bell, BellOff, Smartphone, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"
import {
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscription,
  VAPID_PUBLIC_KEY,
} from "@/lib/push-notifications"

export function NotificationSettings() {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkNotificationStatus()
  }, [])

  async function checkNotificationStatus() {
    // 브라우저 지원 확인
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
    setIsSupported(supported)

    if (!supported) {
      setIsLoading(false)
      return
    }

    // 현재 권한 확인
    setPermission(Notification.permission)

    // 구독 상태 확인
    const subscription = await getPushSubscription()
    setIsSubscribed(!!subscription)

    setIsLoading(false)
  }

  async function handleEnableNotifications() {
    setIsLoading(true)

    try {
      // 1. Service Worker 등록
      const registration = await registerServiceWorker()
      if (!registration) {
        toast.error("Service Worker 등록에 실패했습니다")
        return
      }

      // 2. 알림 권한 요청
      const permission = await requestNotificationPermission()
      setPermission(permission)

      if (permission !== "granted") {
        toast.error("알림 권한이 거부되었습니다")
        return
      }

      // 3. Push 구독
      if (!VAPID_PUBLIC_KEY) {
        toast.error("VAPID 키가 설정되지 않았습니다")
        return
      }

      const subscription = await subscribeToPush(registration)
      if (subscription) {
        setIsSubscribed(true)
        toast.success("알림이 활성화되었습니다!")
      } else {
        toast.error("알림 구독에 실패했습니다")
      }
    } catch (error) {
      console.error("Enable notifications error:", error)
      toast.error("알림 활성화에 실패했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDisableNotifications() {
    setIsLoading(true)

    try {
      const success = await unsubscribeFromPush()
      if (success) {
        setIsSubscribed(false)
        toast.success("알림이 비활성화되었습니다")
      }
    } catch (error) {
      console.error("Disable notifications error:", error)
      toast.error("알림 비활성화에 실패했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleTestNotification() {
    try {
      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "테스트 알림",
          body: "알림이 정상적으로 작동합니다! 🎉",
          url: "/settings",
        }),
      })

      if (response.ok) {
        toast.success("테스트 알림을 전송했습니다")
      } else {
        toast.error("알림 전송에 실패했습니다")
      }
    } catch (error) {
      console.error("Test notification error:", error)
      toast.error("알림 전송에 실패했습니다")
    }
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            푸시 알림
          </CardTitle>
          <CardDescription>
            정해진 시간에 할일, 습관 알림을 받아보세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 text-yellow-600">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">
              이 브라우저는 푸시 알림을 지원하지 않습니다.
              Chrome, Firefox, Edge 또는 Safari를 사용해주세요.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          푸시 알림
        </CardTitle>
        <CardDescription>
          정해진 시간에 할일, 습관 알림을 받아보세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 알림 활성화/비활성화 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isSubscribed ? "bg-green-500/10" : "bg-muted"
            }`}>
              {isSubscribed ? (
                <Bell className="w-5 h-5 text-green-500" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <Label className="font-medium">알림 받기</Label>
              <p className="text-sm text-muted-foreground">
                {isSubscribed ? "알림이 활성화되어 있습니다" : "알림을 활성화하세요"}
              </p>
            </div>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={(checked) => {
              if (checked) {
                handleEnableNotifications()
              } else {
                handleDisableNotifications()
              }
            }}
            disabled={isLoading}
          />
        </div>

        {/* 권한 상태 */}
        {permission === "denied" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <div className="text-sm">
              <p className="font-medium">알림 권한이 차단되어 있습니다</p>
              <p>브라우저 설정에서 알림 권한을 허용해주세요</p>
            </div>
          </div>
        )}

        {/* PWA 안내 */}
        {isSubscribed && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
            <Smartphone className="w-5 h-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">앱처럼 사용하기</p>
              <p className="text-muted-foreground">
                브라우저 메뉴에서 "홈 화면에 추가"를 선택하면 앱처럼 사용할 수 있습니다
              </p>
            </div>
          </div>
        )}

        {/* 테스트 알림 */}
        {isSubscribed && (
          <Button
            variant="outline"
            onClick={handleTestNotification}
            className="w-full"
          >
            <Bell className="w-4 h-4 mr-2" />
            테스트 알림 보내기
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
