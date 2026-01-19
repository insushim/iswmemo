"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Sparkles,
  CheckCircle2,
  Repeat,
  Target,
  StickyNote,
  Quote,
  Sun,
  Moon,
  Cloud
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import Link from "next/link"

const motivationalQuotes = [
  { content: "작은 진전도 진전이다.", author: "플라토" },
  { content: "오늘 할 수 있는 일을 내일로 미루지 마라.", author: "벤자민 프랭클린" },
  { content: "성공은 작은 노력들이 반복된 결과이다.", author: "로버트 콜리어" },
  { content: "시작이 반이다.", author: "아리스토텔레스" },
  { content: "습관이 운명을 만든다.", author: "간디" },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 6) return "늦은 밤이에요"
  if (hour < 12) return "좋은 아침이에요"
  if (hour < 18) return "좋은 오후에요"
  if (hour < 22) return "좋은 저녁이에요"
  return "늦은 밤이에요"
}

export default function TodayPage() {
  const today = new Date()
  const hour = today.getHours()
  const TimeIcon = hour < 6 || hour >= 22 ? Moon : hour < 12 ? Sun : Cloud
  const todayQuote = motivationalQuotes[today.getDate() % motivationalQuotes.length]

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "today"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?today=true")
      if (!res.ok) throw new Error("Failed to fetch tasks")
      return res.json()
    },
  })

  const { data: habits = [] } = useQuery({
    queryKey: ["habits"],
    queryFn: async () => {
      const res = await fetch("/api/habits")
      if (!res.ok) throw new Error("Failed to fetch habits")
      return res.json()
    },
  })

  const completedTasks = tasks.filter((t: { isCompleted: boolean }) => t.isCompleted)
  const taskProgress = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0

  const completedHabits = habits.filter((h: { logs: { date: string }[] }) =>
    h.logs?.some((log: { date: string }) => {
      const logDate = new Date(log.date)
      return logDate.toDateString() === today.toDateString()
    })
  )
  const habitProgress = habits.length > 0 ? Math.round((completedHabits.length / habits.length) * 100) : 0

  const overallProgress = Math.round((taskProgress + habitProgress) / 2)

  return (
    <div className="space-y-6">
      {/* 인사말 카드 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-none overflow-hidden relative">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <TimeIcon className="w-4 h-4" />
                  {format(today, "yyyy년 M월 d일 EEEE", { locale: ko })}
                </div>
                <h1 className="text-3xl font-bold">{getGreeting()}!</h1>
                <p className="text-muted-foreground">
                  오늘 하루도 작은 성장을 이뤄보세요
                </p>
              </div>

              {/* 진행률 원형 */}
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${overallProgress * 2.51} 251`}
                    className="transition-all duration-1000"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{overallProgress}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 오늘의 명언 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-none">
          <CardContent className="p-4 flex items-start gap-3">
            <Quote className="w-8 h-8 text-amber-500 shrink-0" />
            <div>
              <p className="font-medium text-lg">{todayQuote.content}</p>
              <p className="text-sm text-muted-foreground mt-1">— {todayQuote.author}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 오늘의 진행 상황 */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* 할 일 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-500" />
                오늘의 할 일
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold">
                  {completedTasks.length}/{tasks.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {taskProgress}% 완료
                </span>
              </div>
              <Progress value={taskProgress} className="h-2" />
              <Link href="/tasks">
                <Button variant="outline" className="w-full">
                  할 일 보기
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        {/* 습관 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Repeat className="w-5 h-5 text-green-500" />
                오늘의 습관
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold">
                  {completedHabits.length}/{habits.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {habitProgress}% 완료
                </span>
              </div>
              <Progress value={habitProgress} className="h-2" />
              <Link href="/habits">
                <Button variant="outline" className="w-full">
                  습관 보기
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 빠른 액션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              빠른 액션
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/notes">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <StickyNote className="w-5 h-5 text-amber-500" />
                  <span className="text-xs">메모 작성</span>
                </Button>
              </Link>
              <Link href="/tasks">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-500" />
                  <span className="text-xs">할 일 추가</span>
                </Button>
              </Link>
              <Link href="/goals">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <Target className="w-5 h-5 text-purple-500" />
                  <span className="text-xs">목표 설정</span>
                </Button>
              </Link>
              <Link href="/habits">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <Repeat className="w-5 h-5 text-green-500" />
                  <span className="text-xs">습관 체크</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
