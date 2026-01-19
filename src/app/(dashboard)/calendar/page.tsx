"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Trash2,
  X,
  ListTodo,
  CalendarDays,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO
} from "date-fns"
import { ko } from "date-fns/locale"
import { toast } from "sonner"

interface Task {
  id: string
  title: string
  completed: boolean
  priority: string
  dueDate: string | null
  category: string | null
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  isAllDay: boolean
  color: string
}

const EVENT_COLORS = [
  { value: "#6366f1", label: "인디고" },
  { value: "#ec4899", label: "핑크" },
  { value: "#10b981", label: "에메랄드" },
  { value: "#f59e0b", label: "앰버" },
  { value: "#ef4444", label: "레드" },
  { value: "#8b5cf6", label: "바이올렛" },
]

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    location: "",
    startTime: "09:00",
    endTime: "10:00",
    isAllDay: false,
    color: "#6366f1",
  })

  const queryClient = useQueryClient()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  // 월별 할일 조회
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?year=${year}&month=${month}`)
      if (!res.ok) throw new Error("Failed to fetch tasks")
      return res.json()
    },
  })

  // 월별 이벤트 조회
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["events", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/events?year=${year}&month=${month}`)
      if (!res.ok) throw new Error("Failed to fetch events")
      return res.json()
    },
  })

  const tasks: Task[] = tasksData?.tasks || []
  const events: CalendarEvent[] = eventsData?.events || []

  // 날짜별 할일/이벤트 맵 생성
  const dateDataMap = useMemo(() => {
    const map: Record<string, { tasks: Task[]; events: CalendarEvent[] }> = {}

    tasks.forEach((task) => {
      if (task.dueDate) {
        const dateKey = format(parseISO(task.dueDate), "yyyy-MM-dd")
        if (!map[dateKey]) map[dateKey] = { tasks: [], events: [] }
        map[dateKey].tasks.push(task)
      }
    })

    events.forEach((event) => {
      const dateKey = format(parseISO(event.startAt), "yyyy-MM-dd")
      if (!map[dateKey]) map[dateKey] = { tasks: [], events: [] }
      map[dateKey].events.push(event)
    })

    return map
  }, [tasks, events])

  // 할일 완료 토글
  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      })
      if (!res.ok) throw new Error("Failed to update task")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
  })

  // 이벤트 생성
  const createEventMutation = useMutation({
    mutationFn: async (data: {
      title: string
      description?: string
      location?: string
      startAt: string
      endAt: string
      isAllDay: boolean
      color: string
    }) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create event")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] })
      setIsEventDialogOpen(false)
      setNewEvent({
        title: "",
        description: "",
        location: "",
        startTime: "09:00",
        endTime: "10:00",
        isAllDay: false,
        color: "#6366f1",
      })
      toast.success("일정이 추가되었습니다")
    },
    onError: () => {
      toast.error("일정 추가에 실패했습니다")
    },
  })

  // 이벤트 삭제
  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/events/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete event")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] })
      toast.success("일정이 삭제되었습니다")
    },
    onError: () => {
      toast.error("일정 삭제에 실패했습니다")
    },
  })

  const handleCreateEvent = () => {
    if (!newEvent.title.trim()) {
      toast.error("일정 제목을 입력해주세요")
      return
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd")
    const startAt = newEvent.isAllDay
      ? `${dateStr}T00:00:00.000Z`
      : `${dateStr}T${newEvent.startTime}:00.000Z`
    const endAt = newEvent.isAllDay
      ? `${dateStr}T23:59:59.000Z`
      : `${dateStr}T${newEvent.endTime}:00.000Z`

    createEventMutation.mutate({
      title: newEvent.title,
      description: newEvent.description || undefined,
      location: newEvent.location || undefined,
      startAt,
      endAt,
      isAllDay: newEvent.isAllDay,
      color: newEvent.color,
    })
  }

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days: Date[] = []
  let day = startDate
  while (day <= endDate) {
    days.push(day)
    day = addDays(day, 1)
  }

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"]

  // 선택된 날짜의 데이터
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd")
  const selectedDateData = dateDataMap[selectedDateKey] || { tasks: [], events: [] }

  const isLoading = tasksLoading || eventsLoading

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <CalendarIcon className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">캘린더</h1>
            <p className="text-sm text-muted-foreground">
              일정과 할일을 한눈에 확인하세요
            </p>
          </div>
        </div>

        <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              일정 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {format(selectedDate, "M월 d일", { locale: ko })} 일정 추가
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Input
                  placeholder="일정 제목"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                />
              </div>
              <div>
                <Textarea
                  placeholder="설명 (선택사항)"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <Input
                  placeholder="장소 (선택사항)"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allDay"
                  checked={newEvent.isAllDay}
                  onCheckedChange={(checked) =>
                    setNewEvent({ ...newEvent, isAllDay: checked as boolean })
                  }
                />
                <label htmlFor="allDay" className="text-sm">
                  하루 종일
                </label>
              </div>
              {!newEvent.isAllDay && (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">~</span>
                  <Input
                    type="time"
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    className="flex-1"
                  />
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-2">색상</p>
                <div className="flex gap-2">
                  {EVENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setNewEvent({ ...newEvent, color: color.value })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        newEvent.color === color.value ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={handleCreateEvent}
                disabled={createEventMutation.isPending}
                className="w-full"
              >
                {createEventMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                일정 추가
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* 캘린더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">
                  {format(currentDate, "yyyy년 M월", { locale: ko })}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToToday}>
                    오늘
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-2">
                {weekDays.map((dayName, index) => (
                  <div
                    key={dayName}
                    className={`text-center text-sm font-medium py-2 ${
                      index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : "text-muted-foreground"
                    }`}
                  >
                    {dayName}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((d, index) => {
                  const isCurrentMonth = isSameMonth(d, currentDate)
                  const isSelected = isSameDay(d, selectedDate)
                  const isTodayDate = isToday(d)
                  const dayOfWeek = d.getDay()
                  const dateKey = format(d, "yyyy-MM-dd")
                  const dateData = dateDataMap[dateKey]
                  const hasData = dateData && (dateData.tasks.length > 0 || dateData.events.length > 0)
                  const taskCount = dateData?.tasks.length || 0
                  const eventCount = dateData?.events.length || 0

                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedDate(d)}
                      className={`
                        relative aspect-square p-1 rounded-lg transition-colors flex flex-col items-center justify-start
                        ${!isCurrentMonth ? "text-muted-foreground/50" : ""}
                        ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent"}
                        ${isTodayDate && !isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
                        ${dayOfWeek === 0 && !isSelected ? "text-red-500" : ""}
                        ${dayOfWeek === 6 && !isSelected ? "text-blue-500" : ""}
                      `}
                    >
                      <span className="text-sm font-medium">{format(d, "d")}</span>
                      {hasData && (
                        <div className="flex gap-0.5 mt-0.5">
                          {eventCount > 0 && (
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? "bg-primary-foreground" : "bg-indigo-500"
                              }`}
                            />
                          )}
                          {taskCount > 0 && (
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? "bg-primary-foreground" : "bg-emerald-500"
                              }`}
                            />
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 범례 */}
              <div className="flex items-center justify-end gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>일정</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>할일</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 선택된 날짜 정보 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{format(selectedDate, "M월 d일 EEEE", { locale: ko })}</span>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 일정 섹션 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-medium text-sm">일정</h3>
                  {selectedDateData.events.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedDateData.events.length}
                    </Badge>
                  )}
                </div>
                <AnimatePresence mode="popLayout">
                  {selectedDateData.events.length > 0 ? (
                    <div className="space-y-2">
                      {selectedDateData.events.map((event) => (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="p-3 rounded-lg border group"
                          style={{ borderLeftColor: event.color, borderLeftWidth: 4 }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{event.title}</p>
                              {!event.isAllDay && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {format(parseISO(event.startAt), "HH:mm")} -{" "}
                                    {format(parseISO(event.endAt), "HH:mm")}
                                  </span>
                                </div>
                              )}
                              {event.isAllDay && (
                                <p className="text-xs text-muted-foreground mt-1">하루 종일</p>
                              )}
                              {event.location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <MapPin className="w-3 h-3" />
                                  <span className="truncate">{event.location}</span>
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => deleteEventMutation.mutate(event.id)}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      예정된 일정이 없습니다
                    </p>
                  )}
                </AnimatePresence>
              </div>

              {/* 할일 섹션 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ListTodo className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-medium text-sm">할일</h3>
                  {selectedDateData.tasks.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedDateData.tasks.length}
                    </Badge>
                  )}
                </div>
                <AnimatePresence mode="popLayout">
                  {selectedDateData.tasks.length > 0 ? (
                    <div className="space-y-2">
                      {selectedDateData.tasks.map((task) => (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-2 p-2 rounded-lg border group"
                        >
                          <button
                            onClick={() =>
                              toggleTaskMutation.mutate({
                                id: task.id,
                                completed: !task.completed,
                              })
                            }
                            className="flex-shrink-0"
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Circle className="w-5 h-5 text-muted-foreground" />
                            )}
                          </button>
                          <span
                            className={`flex-1 text-sm truncate ${
                              task.completed ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.priority === "HIGH" && (
                            <Badge variant="destructive" className="text-xs">
                              높음
                            </Badge>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      이 날의 할일이 없습니다
                    </p>
                  )}
                </AnimatePresence>
              </div>

              {/* 빈 상태일 때 일정 추가 버튼 */}
              {selectedDateData.events.length === 0 && selectedDateData.tasks.length === 0 && (
                <div className="pt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsEventDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    일정 추가
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
