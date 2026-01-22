"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Sprout, Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import toast from "react-hot-toast"

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [resetUrl, setResetUrl] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "요청 실패")
      }

      setIsSubmitted(true)
      if (data.resetUrl) {
        setResetUrl(data.resetUrl)
      }
      toast.success("비밀번호 재설정 링크를 확인해주세요")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-none shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-4">
              <Sprout className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl gradient-text">비밀번호 찾기</CardTitle>
            <CardDescription>
              {isSubmitted
                ? "이메일을 확인해주세요"
                : "가입한 이메일 주소를 입력해주세요"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isSubmitted ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>{email}</strong>로 비밀번호 재설정 링크를 전송했습니다.
                  <br />
                  이메일을 확인해주세요.
                </p>
                {resetUrl && (
                  <div className="mt-4 p-3 bg-muted rounded-lg text-left">
                    <p className="text-xs text-muted-foreground mb-2">
                      개발 환경에서만 표시됩니다:
                    </p>
                    <Link
                      href={resetUrl}
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {resetUrl}
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="hello@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "비밀번호 재설정 링크 받기"
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              로그인으로 돌아가기
            </Link>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}
