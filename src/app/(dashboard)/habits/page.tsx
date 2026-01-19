"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Repeat,
  Plus,
  Flame,
  Check,
  Calendar,
  TrendingUp,
  Award
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
import toast from "react-hot-toast"
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns"
import { ko } from "date-fns/locale"

interface HabitLog {
  id: string
  date: string
  count: number
}

interface Habit {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  frequency: string
  targetCount: number
  currentStreak: number
  longestStreak: number
  totalCompletions: number
  logs: HabitLog[]
}

export default function HabitsPage() {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newHabit, setNewHabit] = useState({ name: "", color: "#22c55e" })

  const { data: habits = [], isLoading } = useQuery<Habit[]>({
    queryKey: ["habits"],
    queryFn: async () => {
      const res = await fetch("/api/habits")
      if (!res.ok) throw new Error("Failed to fetch habits")
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (habit: { name: string; color: string }) => {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(habit),
      })
      if (!res.ok) throw new Error("Failed to create habit")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] })
      setIsCreateOpen(false)
      setNewHabit({ name: "", color: "#22c55e" })
      toast.success("습관이 추가되었습니다")
    },
    onError: () => {
      toast.error("습관 추가에 실패했습니다")
    },
  })

  const completeMutation = useMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date: string }) => {
      const res = await fetch(`/api/habits/${habitId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) throw new Error("Failed to complete habit")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] })
      toast.success("습관 완료!")
    },
    onError: () => {
      toast.error("습관 완료에 실패했습니다")
    },
  })

  const handleCreate = () => {
    if (!newHabit.name.trim()) {
      toast.error("습관 이름을 입력해주세요")
      return
    }
    createMutation.mutate(newHabit)
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return addDays(start, i)
  })

  const isHabitCompletedOnDate = (habit: Habit, date: Date) => {
    return habit.logs.some((log) => isSameDay(new Date(log.date), date))
  }

  const todayCompletedCount = habits.filter((h) =>
    h.logs.some((log) => isToday(new Date(log.date)))
  ).length

  const totalStreak = Math.max(...habits.map((h) => h.currentStreak), 0)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Repeat className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">습관</h1>
            <p className="text-sm text-muted-foreground">
              오늘 {todayCompletedCount}/{habits.length}개 완료
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              새 습관
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 습관 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">습관 이름</Label>
                <Input
                  id="name"
                  placeholder="예: 물 8잔 마시기"
                  value={newHabit.name}
                  onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>색상</Label>
                <div className="flex gap-2">
                  {["#22c55e", "#3b82f6", "#8b5cf6", "#f97316", "#ef4444", "#ec4899"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewHabit({ ...newHabit, color: c })}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                        newHabit.color === c ? "ring-2 ring-primary ring-offset-2" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "추가 중..." : "습관 추가"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">최고 스트릭</p>
              <p className="text-xl font-bold">{totalStreak}일</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">오늘 완료</p>
              <p className="text-xl font-bold">
                {todayCompletedCount}/{habits.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">총 습관</p>
              <p className="text-xl font-bold">{habits.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 이번 주 캘린더 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            이번 주
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {format(day, "EEE", { locale: ko })}
                </p>
                <p
                  className={`text-sm font-medium w-8 h-8 mx-auto flex items-center justify-center rounded-full ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {format(day, "d")}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 습관 목록 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : habits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Repeat className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">습관이 없습니다</h3>
            <p className="text-muted-foreground mb-4">
              첫 번째 습관을 추가해보세요
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              새 습관
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {habits.map((habit, index) => {
            const isCompletedToday = habit.logs.some((log) => isToday(new Date(log.date)))

            return (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`card-hover ${isCompletedToday ? "border-green-500/50" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() =>
                          completeMutation.mutate({
                            habitId: habit.id,
                            date: new Date().toISOString(),
                          })
                        }
                        disabled={completeMutation.isPending}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                          isCompletedToday
                            ? "bg-green-500 text-white"
                            : "border-2 border-dashed hover:border-primary hover:bg-primary/10"
                        }`}
                        style={{ borderColor: isCompletedToday ? undefined : habit.color }}
                      >
                        {isCompletedToday ? (
                          <Check className="w-6 h-6" />
                        ) : (
                          <Plus className="w-6 h-6" style={{ color: habit.color }} />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{habit.name}</h3>
                          {habit.currentStreak > 0 && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600">
                              <Flame className="w-3 h-3" />
                              {habit.currentStreak}일
                            </span>
                          )}
                        </div>

                        {/* 주간 진행도 */}
                        <div className="flex gap-1">
                          {weekDays.map((day) => (
                            <div
                              key={day.toISOString()}
                              className={`w-6 h-6 rounded ${
                                isHabitCompletedOnDate(habit, day)
                                  ? ""
                                  : "bg-muted"
                              }`}
                              style={{
                                backgroundColor: isHabitCompletedOnDate(habit, day)
                                  ? habit.color
                                  : undefined,
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {habit.totalCompletions}회
                        </p>
                        <p className="text-xs text-muted-foreground">총 완료</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
