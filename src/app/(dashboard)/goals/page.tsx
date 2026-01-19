"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Target,
  Plus,
  ChevronRight,
  Trophy,
  Flame,
  TrendingUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface Goal {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  progress: number
  targetValue: number | null
  currentValue: number
  color: string
  icon: string
  startDate: string
  endDate: string | null
}

const goalTypes = [
  { value: "LIFE", label: "인생 목표", icon: "🌟" },
  { value: "YEARLY", label: "올해 목표", icon: "📅" },
  { value: "MONTHLY", label: "이번 달 목표", icon: "📆" },
  { value: "WEEKLY", label: "이번 주 목표", icon: "📋" },
  { value: "DAILY", label: "오늘 목표", icon: "✨" },
]

const statusColors = {
  NOT_STARTED: "bg-gray-200",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED: "bg-green-500",
  ON_HOLD: "bg-yellow-500",
  ABANDONED: "bg-red-500",
}

export default function GoalsPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => {
      const res = await fetch("/api/goals")
      if (!res.ok) {
        if (res.status === 404) return []
        throw new Error("Failed to fetch goals")
      }
      return res.json()
    },
  })

  const filteredGoals = selectedType
    ? goals.filter((g) => g.type === selectedType)
    : goals

  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS")
  const completedGoals = goals.filter((g) => g.status === "COMPLETED")

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Target className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">목표</h1>
            <p className="text-sm text-muted-foreground">
              {inProgressGoals.length}개 진행 중 / {completedGoals.length}개 달성
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              새 목표
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>새 목표 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">목표</Label>
                <Input id="title" placeholder="어떤 목표를 달성하고 싶으신가요?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">설명 (선택)</Label>
                <Textarea id="description" placeholder="목표에 대해 자세히 설명해주세요" />
              </div>
              <div className="space-y-2">
                <Label>목표 유형</Label>
                <div className="grid grid-cols-2 gap-2">
                  {goalTypes.map((type) => (
                    <button
                      key={type.value}
                      className="flex items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                    >
                      <span className="text-xl">{type.icon}</span>
                      <span className="text-sm font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full">목표 설정</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">진행 중</p>
              <p className="text-xl font-bold">{inProgressGoals.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">달성</p>
              <p className="text-xl font-bold">{completedGoals.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">평균 진행률</p>
              <p className="text-xl font-bold">
                {goals.length > 0
                  ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
                  : 0}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 목표 유형 필터 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedType === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedType(null)}
        >
          전체
        </Button>
        {goalTypes.map((type) => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType(type.value)}
          >
            {type.icon} {type.label}
          </Button>
        ))}
      </div>

      {/* 목표 목록 */}
      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">목표가 없습니다</h3>
            <p className="text-muted-foreground mb-4">
              첫 번째 목표를 설정해보세요
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              새 목표
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGoals.map((goal, index) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="card-hover cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: goal.color }}
                    >
                      {goal.title.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{goal.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {goalTypes.find((t) => t.value === goal.type)?.label}
                        </span>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                          {goal.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <Progress value={goal.progress} className="flex-1 h-2" />
                        <span className="text-sm font-medium text-primary">
                          {goal.progress}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
