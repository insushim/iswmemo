"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Clock,
  Plus,
  Sun,
  Moon,
  Coffee,
  Sunset,
  Play,
  CheckCircle2,
  MoreHorizontal
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

interface RoutineItem {
  id: string
  name: string
  duration: number | null
  isCompleted: boolean
}

interface Routine {
  id: string
  name: string
  type: "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" | "CUSTOM"
  startTime: string | null
  items: RoutineItem[]
  completedToday: boolean
}

const routineIcons = {
  MORNING: Sun,
  AFTERNOON: Coffee,
  EVENING: Sunset,
  NIGHT: Moon,
  CUSTOM: Clock,
}

const routineLabels = {
  MORNING: "아침 루틴",
  AFTERNOON: "점심 루틴",
  EVENING: "저녁 루틴",
  NIGHT: "밤 루틴",
  CUSTOM: "커스텀 루틴",
}

const defaultRoutines: Routine[] = [
  {
    id: "1",
    name: "아침 루틴",
    type: "MORNING",
    startTime: "06:00",
    items: [
      { id: "1-1", name: "기상", duration: 5, isCompleted: false },
      { id: "1-2", name: "물 한 잔 마시기", duration: 2, isCompleted: false },
      { id: "1-3", name: "스트레칭", duration: 10, isCompleted: false },
      { id: "1-4", name: "명상", duration: 10, isCompleted: false },
      { id: "1-5", name: "아침 식사", duration: 20, isCompleted: false },
    ],
    completedToday: false,
  },
  {
    id: "2",
    name: "저녁 루틴",
    type: "EVENING",
    startTime: "21:00",
    items: [
      { id: "2-1", name: "하루 정리", duration: 10, isCompleted: false },
      { id: "2-2", name: "내일 계획", duration: 5, isCompleted: false },
      { id: "2-3", name: "독서", duration: 30, isCompleted: false },
      { id: "2-4", name: "스킨케어", duration: 10, isCompleted: false },
    ],
    completedToday: false,
  },
]

export default function RoutinesPage() {
  const [routines] = useState<Routine[]>(defaultRoutines)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <Clock className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">루틴</h1>
            <p className="text-sm text-muted-foreground">
              일상의 루틴을 만들어보세요
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              새 루틴
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 루틴 만들기</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">루틴 이름</Label>
                <Input id="name" placeholder="예: 아침 루틴" />
              </div>
              <div className="space-y-2">
                <Label>루틴 유형</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(routineLabels) as Array<keyof typeof routineLabels>).map((type) => {
                    const Icon = routineIcons[type]
                    return (
                      <button
                        key={type}
                        className="flex items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-sm">{routineLabels[type]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">시작 시간</Label>
                <Input id="time" type="time" />
              </div>
              <Button className="w-full">루틴 만들기</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 루틴 목록 */}
      <div className="grid gap-6">
        {routines.map((routine, index) => {
          const Icon = routineIcons[routine.type]
          const completedItems = routine.items.filter((i) => i.isCompleted).length
          const progress = Math.round((completedItems / routine.items.length) * 100)
          const totalDuration = routine.items.reduce((sum, i) => sum + (i.duration || 0), 0)

          return (
            <motion.div
              key={routine.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-cyan-500" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{routine.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {routine.startTime && `${routine.startTime} 시작`} · {totalDuration}분
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        <Play className="w-4 h-4 mr-1" />
                        시작
                      </Button>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Progress value={progress} className="flex-1 h-2" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {completedItems}/{routine.items.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {routine.items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          item.isCompleted ? "bg-green-500/10" : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <button
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            item.isCompleted
                              ? "bg-green-500 border-green-500"
                              : "border-muted-foreground hover:border-primary"
                          }`}
                        >
                          {item.isCompleted && (
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          )}
                        </button>
                        <span
                          className={`flex-1 ${
                            item.isCompleted ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {item.name}
                        </span>
                        {item.duration && (
                          <span className="text-xs text-muted-foreground">
                            {item.duration}분
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* 빈 상태 */}
      {routines.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">루틴이 없습니다</h3>
            <p className="text-muted-foreground mb-4">
              일상의 루틴을 만들어보세요
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              새 루틴
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
