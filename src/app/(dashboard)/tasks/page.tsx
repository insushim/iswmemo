"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle2,
  Circle,
  Plus,
  Calendar,
  Flag,
  MoreHorizontal,
  Trash2,
  Edit
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

interface Task {
  id: string
  title: string
  description: string | null
  isCompleted: boolean
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  dueDate: string | null
  createdAt: string
  goal: { id: string; title: string; color: string } | null
}

const priorityColors = {
  LOW: "text-gray-500",
  MEDIUM: "text-blue-500",
  HIGH: "text-orange-500",
  URGENT: "text-red-500",
}

const priorityLabels = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  URGENT: "긴급",
}

export default function TasksPage() {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newTask, setNewTask] = useState({
    title: "",
    priority: "MEDIUM" as Task["priority"],
    dueDate: "",
  })

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks")
      if (!res.ok) throw new Error("Failed to fetch tasks")
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (task: { title: string; priority: string; dueDate: string }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...task,
          dueDate: task.dueDate || null,
        }),
      })
      if (!res.ok) throw new Error("Failed to create task")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      setIsCreateOpen(false)
      setNewTask({ title: "", priority: "MEDIUM", dueDate: "" })
      toast.success("할 일이 추가되었습니다")
    },
    onError: () => {
      toast.error("할 일 추가에 실패했습니다")
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isCompleted }),
      })
      if (!res.ok) throw new Error("Failed to update task")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
  })

  const handleCreate = () => {
    if (!newTask.title.trim()) {
      toast.error("할 일을 입력해주세요")
      return
    }
    createMutation.mutate(newTask)
  }

  const incompleteTasks = tasks.filter((t) => !t.isCompleted)
  const completedTasks = tasks.filter((t) => t.isCompleted)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">할 일</h1>
            <p className="text-sm text-muted-foreground">
              {incompleteTasks.length}개 남음 / {completedTasks.length}개 완료
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              할 일 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 할 일</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">할 일</Label>
                <Input
                  id="title"
                  placeholder="무엇을 해야 하나요?"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>우선순위</Label>
                  <div className="flex gap-2">
                    {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setNewTask({ ...newTask, priority: p })}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          newTask.priority === p
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {priorityLabels[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">마감일</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "추가 중..." : "할 일 추가"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 할 일 목록 */}
      <div className="space-y-6">
        {/* 미완료 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Circle className="w-5 h-5" />
              해야 할 일
              <span className="text-sm font-normal text-muted-foreground">
                ({incompleteTasks.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))
            ) : incompleteTasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                모든 할 일을 완료했습니다!
              </p>
            ) : (
              <AnimatePresence>
                {incompleteTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 group"
                  >
                    <button
                      onClick={() => toggleMutation.mutate({ id: task.id, isCompleted: true })}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${priorityColors[task.priority]} border-current hover:bg-current/10`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(task.dueDate), "M월 d일", { locale: ko })}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 ${priorityColors[task.priority]}`}>
                          <Flag className="w-3 h-3" />
                          {priorityLabels[task.priority]}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        {/* 완료됨 */}
        {completedTasks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                완료됨
                <span className="text-sm font-normal text-muted-foreground">
                  ({completedTasks.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence>
                {completedTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 group"
                  >
                    <button
                      onClick={() => toggleMutation.mutate({ id: task.id, isCompleted: false })}
                      className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </button>
                    <span className="flex-1 line-through text-muted-foreground">
                      {task.title}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
