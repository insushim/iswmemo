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
  Zap
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

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
  progress?: number
  target?: number
}

const categoryIcons = {
  STREAK: Flame,
  NOTES: StickyNote,
  GOALS: Target,
  HABITS: Repeat,
  TASKS: CheckCircle2,
  ROUTINE: Clock,
  LEVEL: Star,
  SPECIAL: Zap,
}

const categoryLabels = {
  STREAK: "연속 출석",
  NOTES: "메모",
  GOALS: "목표",
  HABITS: "습관",
  TASKS: "할 일",
  ROUTINE: "루틴",
  LEVEL: "레벨",
  SPECIAL: "특별",
}

const defaultAchievements: Achievement[] = [
  // STREAK
  {
    id: "1",
    code: "streak_7",
    name: "일주일 연속",
    description: "7일 연속 접속하기",
    icon: "flame",
    color: "#f97316",
    category: "STREAK",
    points: 50,
    isUnlocked: false,
    progress: 3,
    target: 7,
  },
  {
    id: "2",
    code: "streak_30",
    name: "한 달 연속",
    description: "30일 연속 접속하기",
    icon: "flame",
    color: "#f97316",
    category: "STREAK",
    points: 200,
    isUnlocked: false,
    progress: 3,
    target: 30,
  },
  // NOTES
  {
    id: "3",
    code: "notes_first",
    name: "첫 메모",
    description: "첫 번째 메모 작성하기",
    icon: "sticky-note",
    color: "#eab308",
    category: "NOTES",
    points: 10,
    isUnlocked: true,
    unlockedAt: "2024-01-15",
  },
  {
    id: "4",
    code: "notes_10",
    name: "메모 수집가",
    description: "메모 10개 작성하기",
    icon: "sticky-note",
    color: "#eab308",
    category: "NOTES",
    points: 50,
    isUnlocked: false,
    progress: 5,
    target: 10,
  },
  // GOALS
  {
    id: "5",
    code: "goals_first",
    name: "목표 설정",
    description: "첫 번째 목표 설정하기",
    icon: "target",
    color: "#8b5cf6",
    category: "GOALS",
    points: 15,
    isUnlocked: true,
    unlockedAt: "2024-01-16",
  },
  {
    id: "6",
    code: "goals_complete",
    name: "목표 달성",
    description: "목표 하나 완료하기",
    icon: "target",
    color: "#8b5cf6",
    category: "GOALS",
    points: 100,
    isUnlocked: false,
    progress: 0,
    target: 1,
  },
  // HABITS
  {
    id: "7",
    code: "habits_streak_7",
    name: "습관 마스터",
    description: "습관 7일 연속 달성하기",
    icon: "repeat",
    color: "#22c55e",
    category: "HABITS",
    points: 75,
    isUnlocked: false,
    progress: 2,
    target: 7,
  },
  // TASKS
  {
    id: "8",
    code: "tasks_10",
    name: "할 일 정복자",
    description: "할 일 10개 완료하기",
    icon: "check-circle",
    color: "#3b82f6",
    category: "TASKS",
    points: 50,
    isUnlocked: false,
    progress: 3,
    target: 10,
  },
  // LEVEL
  {
    id: "9",
    code: "level_5",
    name: "새싹 성장",
    description: "레벨 5 달성하기",
    icon: "star",
    color: "#fbbf24",
    category: "LEVEL",
    points: 100,
    isUnlocked: false,
    progress: 2,
    target: 5,
  },
  // SPECIAL
  {
    id: "10",
    code: "special_first_day",
    name: "새로운 시작",
    description: "GrowthPad 가입하기",
    icon: "zap",
    color: "#ec4899",
    category: "SPECIAL",
    points: 10,
    isUnlocked: true,
    unlockedAt: "2024-01-14",
  },
]

export default function AchievementsPage() {
  const unlockedCount = defaultAchievements.filter((a) => a.isUnlocked).length
  const totalPoints = defaultAchievements
    .filter((a) => a.isUnlocked)
    .reduce((sum, a) => sum + a.points, 0)

  const categories = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>

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
              {unlockedCount}/{defaultAchievements.length}개 달성
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

      {/* 카테고리별 업적 */}
      {categories.map((category) => {
        const categoryAchievements = defaultAchievements.filter(
          (a) => a.category === category
        )
        const Icon = categoryIcons[category]
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
                    {categoryLabels[category]}
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

                          {!achievement.isUnlocked && achievement.progress !== undefined && (
                            <div className="mt-2 space-y-1">
                              <Progress
                                value={(achievement.progress / (achievement.target || 1)) * 100}
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
      })}
    </div>
  )
}
