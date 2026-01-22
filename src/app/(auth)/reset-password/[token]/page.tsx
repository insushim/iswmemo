"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Sprout, Lock, Loader2, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import toast from "react-hot-toast"

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [isLoading, setIsLoading] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다")
      return
    }

    if (password.length < 6) {
      toast.error("비밀번호는 6자 이상이어야 합니다")
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "비밀번호 재설정 실패")
      }

      setIsSuccess(true)
      toast.success("비밀번호가 변경되었습니다")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "비밀번호 재설정 중 오류가 발생했습니다")
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
            <CardTitle className="text-2xl gradient-text">
              {isSuccess ? "비밀번호 변경 완료" : "새 비밀번호 설정"}
            </CardTitle>
            <CardDescription>
              {isSuccess
                ? "새로운 비밀번호로 로그인하세요"
                : "새로운 비밀번호를 입력해주세요"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isSuccess ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  비밀번호가 성공적으로 변경되었습니다.
                  <br />
                  새 비밀번호로 로그인해주세요.
                </p>
                <Button
                  className="w-full"
                  onClick={() => router.push("/login")}
                >
                  로그인하기
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">새 비밀번호</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="6자 이상"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="비밀번호 재입력"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "비밀번호 변경"
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          {!isSuccess && (
            <CardFooter className="flex flex-col gap-2">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                로그인으로 돌아가기
              </Link>
            </CardFooter>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
