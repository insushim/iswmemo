"use client"

import { motion } from "framer-motion"
import {
  Trophy,
  Lock,
  Flame,
  StickyNote,
  Target,
  Repeat,
  CheckCircle2,
  Clock,
  Star,
  Zap,
  Loader2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useQuery } from "@tanstack/react-query"

interface Achievement {
  id: string
  code: string
  name: string
  description: string
  icon: string
  color: string
  category: string
  points: number
  isUnlocked: boolean
  unlockedAt?: string
  progress: number
  target: number
}

interface AchievementsResponse {
  achievements: Achievement[]
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  STREAK: Flame,
  NOTES: StickyNote,
  GOALS: Target,
  HABITS: Repeat,
  TASKS: CheckCircle2,
  ROUTINE: Clock,
  LEVEL: Star,
  SPECIAL: Zap,
}

const categoryLabels: Record<string, string> = {
  STREAK: "연속 출석",
  NOTES: "메모",
  GOALS: "목표",
  HABITS: "습관",
  TASKS: "할 일",
  ROUTINE: "루틴",
  LEVEL: "레벨",
  SPECIAL: "특별",
}

export default function AchievementsPage() {
  const { data, isLoading } = useQuery<AchievementsResponse>({
    queryKey: ["achievements"],
    queryFn: async () => {
      const res = await fetch("/api/achievements")
      if (!res.ok) throw new Error("Failed to fetch achievements")
      return res.json()
    },
  })

  const achievements = data?.achievements || []

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length
  const totalPoints = achievements
    .filter((a) => a.isUnlocked)
    .reduce((sum, a) => sum + a.points, 0)

  // 업적 데이터에서 카테고리 목록 추출
  const categories = [...new Set(achievements.map((a) => a.category))]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">업적</h1>
            <p className="text-sm text-muted-foreground">
              {unlockedCount}/{achievements.length}개 달성
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10">
          <Star className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-amber-600 dark:text-amber-400">
            {totalPoints} 포인트 획득
          </span>
        </div>
      </div>

      {achievements.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            업적 데이터를 불러올 수 없습니다.
          </CardContent>
        </Card>
      ) : (
        /* 카테고리별 업적 */
        categories.map((category) => {
          const categoryAchievements = achievements.filter(
            (a) => a.category === category
          )
          const Icon = categoryIcons[category] || Zap
          const unlockedInCategory = categoryAchievements.filter((a) => a.isUnlocked).length

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Icon className="w-5 h-5" />
                      {categoryLabels[category] || category}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {unlockedInCategory}/{categoryAchievements.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {categoryAchievements.map((achievement) => (
                      <div
                        key={achievement.id}
                        className={`relative p-4 rounded-xl border transition-colors ${
                          achievement.isUnlocked
                            ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30"
                            : "bg-muted/30 border-border"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              achievement.isUnlocked ? "" : "opacity-50 grayscale"
                            }`}
                            style={{ backgroundColor: `${achievement.color}20` }}
                          >
                            {achievement.isUnlocked ? (
                              <Trophy
                                className="w-6 h-6"
                                style={{ color: achievement.color }}
                              />
                            ) : (
                              <Lock className="w-6 h-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3
                              className={`font-semibold ${
                                !achievement.isUnlocked && "text-muted-foreground"
                              }`}
                            >
                              {achievement.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {achievement.description}
                            </p>

                            {!achievement.isUnlocked && achievement.target > 0 && (
                              <div className="mt-2 space-y-1">
                                <Progress
                                  value={(achievement.progress / achievement.target) * 100}
                                  className="h-1.5"
                                />
                                <p className="text-xs text-muted-foreground">
                                  {achievement.progress}/{achievement.target}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-sm font-bold ${
                                achievement.isUnlocked
                                  ? "text-amber-500"
                                  : "text-muted-foreground"
                              }`}
                            >
                              +{achievement.points}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })
      )}
    </div>
  )
}
