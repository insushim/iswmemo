"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Clock,
  Plus,
  Sun,
  Moon,
  Coffee,
  Sunset,
  Play,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
  Edit,
  Pause,
  X
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"

interface RoutineItem {
  id: string
  name: string
  duration: number | null
  order: number
}

interface RoutineLog {
  id: string
  date: string
  startedAt: string | null
  completedAt: string | null
  completedItems: number[]
}

interface Routine {
  id: string
  name: string
  description: string | null
  type: "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" | "CUSTOM"
  startTime: string | null
  isActive: boolean
  items: RoutineItem[]
  todayLog: RoutineLog | null
  completedItemsToday: number[]
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

const routineColors = {
  MORNING: "bg-amber-500/10 text-amber-500",
  AFTERNOON: "bg-orange-500/10 text-orange-500",
  EVENING: "bg-purple-500/10 text-purple-500",
  NIGHT: "bg-indigo-500/10 text-indigo-500",
  CUSTOM: "bg-cyan-500/10 text-cyan-500",
}

export default function RoutinesPage() {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<keyof typeof routineLabels>("MORNING")
  const [newRoutine, setNewRoutine] = useState({
    name: "",
    startTime: "",
    items: [{ name: "", duration: 5 }],
  })

  // 루틴 목록 조회
  const { data, isLoading } = useQuery({
    queryKey: ["routines"],
    queryFn: async () => {
      const res = await fetch("/api/routines")
      if (!res.ok) throw new Error("Failed to fetch routines")
      return res.json()
    },
  })

  // 루틴 생성
  const createMutation = useMutation({
    mutationFn: async (routine: {
      name: string
      type: string
      startTime?: string
      items?: { name: string; duration?: number }[]
    }) => {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routine),
      })
      if (!res.ok) throw new Error("Failed to create routine")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] })
      setIsCreateOpen(false)
      setNewRoutine({ name: "", startTime: "", items: [{ name: "", duration: 5 }] })
      toast.success("루틴이 생성되었습니다")
    },
    onError: () => {
      toast.error("루틴 생성에 실패했습니다")
    },
  })

  // 루틴 삭제
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/routines/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete routine")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] })
      toast.success("루틴이 삭제되었습니다")
    },
    onError: () => {
      toast.error("루틴 삭제에 실패했습니다")
    },
  })

  // 루틴 시작
  const startMutation = useMutation({
    mutationFn: async (routineId: string) => {
      const res = await fetch(`/api/routines/${routineId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      if (!res.ok) throw new Error("Failed to start routine")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] })
      toast.success("루틴을 시작합니다!")
    },
    onError: () => {
      toast.error("루틴 시작에 실패했습니다")
    },
  })

  // 아이템 토글
  const toggleItemMutation = useMutation({
    mutationFn: async ({ routineId, itemIndex }: { routineId: string; itemIndex: number }) => {
      const res = await fetch(`/api/routines/${routineId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex }),
      })
      if (!res.ok) throw new Error("Failed to toggle item")
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["routines"] })
      // 모든 아이템 완료 시 축하 메시지
      if (data.completedAt) {
        toast.success("루틴을 완료했습니다! 🎉")
      }
    },
    onError: () => {
      toast.error("변경에 실패했습니다")
    },
  })

  const handleCreate = () => {
    if (!newRoutine.name.trim()) {
      toast.error("루틴 이름을 입력해주세요")
      return
    }

    const validItems = newRoutine.items.filter((item) => item.name.trim())

    createMutation.mutate({
      name: newRoutine.name,
      type: selectedType,
      startTime: newRoutine.startTime || undefined,
      items: validItems.length > 0 ? validItems : undefined,
    })
  }

  const handleDelete = (routineId: string) => {
    if (confirm("정말 이 루틴을 삭제하시겠습니까?")) {
      deleteMutation.mutate(routineId)
    }
  }

  const handleStart = (routineId: string) => {
    startMutation.mutate(routineId)
  }

  const handleToggleItem = (routineId: string, itemIndex: number) => {
    toggleItemMutation.mutate({ routineId, itemIndex })
  }

  const addItemField = () => {
    setNewRoutine({
      ...newRoutine,
      items: [...newRoutine.items, { name: "", duration: 5 }],
    })
  }

  const removeItemField = (index: number) => {
    if (newRoutine.items.length > 1) {
      setNewRoutine({
        ...newRoutine,
        items: newRoutine.items.filter((_, i) => i !== index),
      })
    }
  }

  const updateItem = (index: number, field: "name" | "duration", value: string | number) => {
    const updated = [...newRoutine.items]
    updated[index] = { ...updated[index], [field]: value }
    setNewRoutine({ ...newRoutine, items: updated })
  }

  const routines: Routine[] = data?.routines || []

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
              {routines.length}개의 루틴
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 루틴 만들기</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">루틴 이름</Label>
                <Input
                  id="name"
                  placeholder="예: 아침 루틴"
                  value={newRoutine.name}
                  onChange={(e) => setNewRoutine({ ...newRoutine, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>루틴 유형</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(routineLabels) as Array<keyof typeof routineLabels>).map((type) => {
                    const Icon = routineIcons[type]
                    const isSelected = selectedType === type
                    return (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary hover:bg-primary/5"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-sm">{routineLabels[type]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">시작 시간 (선택)</Label>
                <Input
                  id="time"
                  type="time"
                  value={newRoutine.startTime}
                  onChange={(e) => setNewRoutine({ ...newRoutine, startTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>루틴 항목</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItemField}>
                    <Plus className="w-3 h-3 mr-1" />
                    추가
                  </Button>
                </div>
                <div className="space-y-2">
                  {newRoutine.items.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="항목 이름"
                        value={item.name}
                        onChange={(e) => updateItem(index, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="분"
                        value={item.duration}
                        onChange={(e) => updateItem(index, "duration", parseInt(e.target.value) || 0)}
                        className="w-20"
                      />
                      {newRoutine.items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItemField(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleCreate}
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "생성 중..." : "루틴 만들기"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 루틴 목록 */}
      {isLoading ? (
        <div className="grid gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : routines.length === 0 ? (
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
      ) : (
        <div className="grid gap-6">
          <AnimatePresence>
            {routines.map((routine, index) => {
              const Icon = routineIcons[routine.type]
              const colorClass = routineColors[routine.type]
              const completedItems = routine.completedItemsToday || []
              const progress = routine.items.length > 0
                ? Math.round((completedItems.length / routine.items.length) * 100)
                : 0
              const totalDuration = routine.items.reduce((sum, i) => sum + (i.duration || 0), 0)
              const isStarted = routine.todayLog?.startedAt != null
              const isCompleted = routine.todayLog?.completedAt != null

              return (
                <motion.div
                  key={routine.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={isCompleted ? "border-green-500/50 bg-green-500/5" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {routine.name}
                              {isCompleted && (
                                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                                  완료
                                </span>
                              )}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {routine.startTime && `${routine.startTime} 시작`}
                              {routine.startTime && totalDuration > 0 && " · "}
                              {totalDuration > 0 && `${totalDuration}분`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isCompleted && (
                            <Button
                              variant={isStarted ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => handleStart(routine.id)}
                              disabled={startMutation.isPending}
                            >
                              {isStarted ? (
                                <>
                                  <Pause className="w-4 h-4 mr-1" />
                                  진행 중
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-1" />
                                  시작
                                </>
                              )}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="w-4 h-4 mr-2" />
                                수정
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(routine.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Progress value={progress} className="flex-1 h-2" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {completedItems.length}/{routine.items.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {routine.items.map((item, itemIndex) => {
                          const isItemCompleted = completedItems.includes(itemIndex)
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleToggleItem(routine.id, itemIndex)}
                              disabled={toggleItemMutation.isPending}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                                isItemCompleted
                                  ? "bg-green-500/10"
                                  : "bg-muted/50 hover:bg-muted"
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  isItemCompleted
                                    ? "bg-green-500 border-green-500"
                                    : "border-muted-foreground hover:border-primary"
                                }`}
                              >
                                {isItemCompleted && (
                                  <CheckCircle2 className="w-4 h-4 text-white" />
                                )}
                              </div>
                              <span
                                className={`flex-1 ${
                                  isItemCompleted ? "line-through text-muted-foreground" : ""
                                }`}
                              >
                                {item.name}
                              </span>
                              {item.duration && (
                                <span className="text-xs text-muted-foreground">
                                  {item.duration}분
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {routine.items.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          아직 루틴 항목이 없습니다
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
