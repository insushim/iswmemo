"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  isToday
} from "date-fns"
import { ko } from "date-fns/locale"

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
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
              일정을 한눈에 확인하세요
            </p>
          </div>
        </div>

        <Button>
          <Plus className="w-4 h-4 mr-2" />
          일정 추가
        </Button>
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
                {weekDays.map((day, index) => (
                  <div
                    key={day}
                    className={`text-center text-sm font-medium py-2 ${
                      index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : "text-muted-foreground"
                    }`}
                  >
                    {day}
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

                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedDate(d)}
                      className={`
                        relative aspect-square p-2 rounded-lg transition-colors
                        ${!isCurrentMonth ? "text-muted-foreground/50" : ""}
                        ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent"}
                        ${isTodayDate && !isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
                        ${dayOfWeek === 0 && !isSelected ? "text-red-500" : ""}
                        ${dayOfWeek === 6 && !isSelected ? "text-blue-500" : ""}
                      `}
                    >
                      <span className="text-sm font-medium">{format(d, "d")}</span>
                    </button>
                  )
                })}
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
              <CardTitle className="text-lg">
                {format(selectedDate, "M월 d일 EEEE", { locale: ko })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  이 날에 예정된 일정이 없습니다
                </p>
                <Button variant="outline" className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  일정 추가
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
