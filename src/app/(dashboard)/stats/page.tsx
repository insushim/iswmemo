"use client"

import { motion } from "framer-motion"
import {
  TrendingUp,
  Flame,
  CheckCircle2,
  StickyNote,
  Target,
  Repeat,
  Calendar,
  Award,
  Loader2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useUser } from "@/hooks/use-user"
import { levelSystem } from "@/lib/design-system"
import { useQuery } from "@tanstack/react-query"

interface WeeklyData {
  day: string
  tasks: number
  habits: number
}

interface StatsSummary {
  tasks: number
  habits: number
  notes: number
  goals: number
}

interface StatsResponse {
  weeklyData: WeeklyData[]
  summary: StatsSummary
}

export default function StatsPage() {
  const { user } = useUser()

  const { data: statsData, isLoading } = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats")
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
  })

  const level = user ? levelSystem.getLevel(user.experience) : 1
  const expProgress = user ? levelSystem.getExpProgress(user.experience) : 0
  const levelTitle = levelSystem.getLevelTitle(level)

  const stats = [
    {
      label: "현재 스트릭",
      value: user?.currentStreak || 0,
      unit: "일",
      icon: Flame,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: "최장 스트릭",
      value: user?.longestStreak || 0,
      unit: "일",
      icon: Flame,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      label: "총 포인트",
      value: user?.totalPoints?.toLocaleString() || 0,
      unit: "P",
      icon: Award,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "현재 레벨",
      value: level,
      unit: "Lv",
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ]

  const weeklyData = statsData?.weeklyData || []
  const summary = statsData?.summary || { tasks: 0, habits: 0, notes: 0, goals: 0 }

  const maxValue = Math.max(...weeklyData.map((d) => d.tasks + d.habits), 1)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">통계</h1>
          <p className="text-sm text-muted-foreground">
            성장 현황을 한눈에 확인하세요
          </p>
        </div>
      </div>

      {/* 레벨 카드 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-none">
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white"
                style={{ backgroundColor: levelSystem.getLevelColor(level) }}
              >
                {level}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{levelTitle}</h2>
                <p className="text-muted-foreground mb-3">
                  다음 레벨까지 {Math.round(100 - expProgress)}% 남음
                </p>
                <Progress value={expProgress} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">
                  총 {user?.experience?.toLocaleString() || 0} EXP
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 주요 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="card-hover">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-xl font-bold">
                      {stat.value}
                      <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* 주간 활동 차트 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              이번 주 활동
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : weeklyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                데이터가 없습니다
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between h-48 gap-2">
                  {weeklyData.map((data, index) => (
                    <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex flex-col gap-1" style={{ height: "160px" }}>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(data.tasks / maxValue) * 100}%` }}
                          transition={{ delay: index * 0.1, duration: 0.5 }}
                          className="w-full bg-blue-500 rounded-t"
                        />
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(data.habits / maxValue) * 100}%` }}
                          transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                          className="w-full bg-green-500 rounded-b"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{data.day}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-sm text-muted-foreground">할 일</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    <span className="text-sm text-muted-foreground">습관</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 카테고리별 통계 */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                할 일
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoading ? "-" : summary.tasks}</p>
              <p className="text-xs text-muted-foreground">이번 주 완료</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Repeat className="w-4 h-4 text-green-500" />
                습관
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoading ? "-" : summary.habits}</p>
              <p className="text-xs text-muted-foreground">이번 주 달성</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-500" />
                메모
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoading ? "-" : summary.notes}</p>
              <p className="text-xs text-muted-foreground">이번 주 작성</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-500" />
                목표
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoading ? "-" : summary.goals}</p>
              <p className="text-xs text-muted-foreground">이번 주 달성</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
