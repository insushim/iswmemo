import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startOfDay, endOfDay, format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from "date-fns"
import { ko } from "date-fns/locale"
import {
  Flame,
  Target,
  CheckCircle2,
  Repeat,
  Sparkles,
  StickyNote,
  Plus,
  Star,
  Calendar
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

// 캐시 설정 - 60초마다 재검증
export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const userId = session.user.id
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  // 기본값 설정
  let user = null
  let todayTasksCount = 0
  let completedTasksCount = 0
  let todayHabitsCount = 0
  let completedHabitsCount = 0
  let activeGoalsCount = 0
  let thisMonthNotesCount = 0
  let recentNotes: { id: string; title: string; updatedAt: Date; color: string | null }[] = []
  let todayTasks: { id: string; title: string; isCompleted: boolean; priority: string }[] = []
  let lifeGoals: { id: string; title: string; progress: number; color: string; icon: string }[] = []
  let taskDueDates: Date[] = []

  try {
    // 최적화된 병렬 쿼리 - 그룹화하여 쿼리 수 감소
    const [
      userData,
      taskStats,
      habitStats,
      goalStats,
      noteStats,
      recentNotesData,
      todayTasksData,
      lifeGoalsData,
      calendarTasks
    ] = await Promise.all([
      // 1. 사용자 기본 정보
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          currentStreak: true,
          longestStreak: true,
          level: true,
          experience: true,
          totalPoints: true
        }
      }),

      // 2. 할 일 통계 - groupBy로 한 번에 조회
      prisma.task.groupBy({
        by: ['isCompleted'],
        where: {
          userId,
          OR: [
            { dueDate: { gte: todayStart, lte: todayEnd } },
            { dueDate: null, isCompleted: false }
          ]
        },
        _count: true
      }),

      // 3. 습관 통계 - 한 번의 쿼리로
      Promise.all([
        prisma.habit.count({ where: { userId, isActive: true } }),
        prisma.habitLog.count({ where: { userId, date: todayStart } })
      ]),

      // 4. 목표 통계
      prisma.goal.count({ where: { userId, status: 'IN_PROGRESS' } }),

      // 5. 메모 통계
      prisma.note.count({
        where: { userId, createdAt: { gte: monthStart } }
      }),

      // 6. 최근 메모 (5개)
      prisma.note.findMany({
        where: { userId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true, color: true }
      }),

      // 7. 오늘 할 일 (5개)
      prisma.task.findMany({
        where: {
          userId,
          OR: [
            { dueDate: { gte: todayStart, lte: todayEnd } },
            { dueDate: null, isCompleted: false }
          ]
        },
        orderBy: [{ isCompleted: 'asc' }, { priority: 'desc' }],
        take: 5,
        select: { id: true, title: true, isCompleted: true, priority: true }
      }),

      // 8. 인생 목표 (3개)
      prisma.goal.findMany({
        where: { userId, type: 'LIFE', status: 'IN_PROGRESS' },
        orderBy: { createdAt: 'asc' },
        take: 3,
        select: { id: true, title: true, progress: true, color: true, icon: true }
      }),

      // 9. 이번 달 할 일 날짜 (달력용) - dueDate만 가져오기
      prisma.task.findMany({
        where: {
          userId,
          dueDate: { gte: monthStart, lte: monthEnd },
          isCompleted: false
        },
        select: { dueDate: true },
        distinct: ['dueDate']
      })
    ])

    user = userData

    // 할 일 통계 처리
    taskStats.forEach(stat => {
      if (stat.isCompleted) {
        completedTasksCount = stat._count
      }
      todayTasksCount += stat._count
    })

    // 습관 통계 처리
    todayHabitsCount = habitStats[0]
    completedHabitsCount = habitStats[1]

    activeGoalsCount = goalStats
    thisMonthNotesCount = noteStats
    recentNotes = recentNotesData
    todayTasks = todayTasksData
    lifeGoals = lifeGoalsData
    taskDueDates = calendarTasks
      .filter(t => t.dueDate)
      .map(t => t.dueDate!)

  } catch (error) {
    console.error('Dashboard data fetch error:', error)
  }

  const greeting = getGreeting()
  const taskCompletionRate = todayTasksCount > 0 ? Math.round((completedTasksCount / todayTasksCount) * 100) : 0
  const habitCompletionRate = todayHabitsCount > 0 ? Math.round((completedHabitsCount / todayHabitsCount) * 100) : 0

  // 미니 달력용 데이터
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = monthStart.getDay() // 0 = 일요일

  // 할 일이 있는 날짜들 (Set 사용으로 조회 성능 향상)
  const datesWithTasks = new Set(
    taskDueDates.map(d => startOfDay(d).getTime())
  )

  return (
    <div className="space-y-6">
      {/* 인사말 */}
      <Card className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-none">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-sm">
                {format(today, 'yyyy년 M월 d일 EEEE', { locale: ko })}
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold mt-1">
                {greeting}, <span className="gradient-text">{user?.name || '사용자'}</span>님!
              </h1>
              <p className="text-muted-foreground mt-2">오늘도 작은 성장을 이뤄보세요</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10">
              <Flame className="w-5 h-5 text-orange-500" />
              <span className="font-bold text-orange-600 dark:text-orange-400">
                {user?.currentStreak || 0}일 연속
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 인생 목표 - 항상 보이게 */}
      {lifeGoals.length > 0 && (
        <Card className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-purple-500" />
              <span className="font-semibold text-purple-600 dark:text-purple-400">나의 인생 목표</span>
              <Link href="/goals" className="ml-auto text-xs text-muted-foreground hover:text-purple-500">
                전체 보기
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {lifeGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="p-3 rounded-lg bg-background/60 backdrop-blur border border-border/50"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                      style={{ backgroundColor: goal.color }}
                    >
                      {goal.icon === 'target' ? '🎯' : goal.icon === 'star' ? '⭐' : goal.icon === 'heart' ? '❤️' : goal.icon === 'rocket' ? '🚀' : '✨'}
                    </div>
                    <span className="font-medium text-sm truncate flex-1">{goal.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={goal.progress} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground">{goal.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 오늘의 요약 카드들 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">오늘 할 일</p>
                <p className="text-xl font-bold">{completedTasksCount}/{todayTasksCount}</p>
              </div>
            </div>
            <Progress value={taskCompletionRate} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Repeat className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">오늘 습관</p>
                <p className="text-xl font-bold">{completedHabitsCount}/{todayHabitsCount}</p>
              </div>
            </div>
            <Progress value={habitCompletionRate} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">진행중 목표</p>
                <p className="text-xl font-bold">{activeGoalsCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">이번 달 메모</p>
                <p className="text-xl font-bold">{thisMonthNotesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 메인 컨텐츠 그리드 */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* 미니 달력 */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              {format(today, 'yyyy년 M월', { locale: ko })}
            </CardTitle>
            <Link href="/calendar">
              <Button variant="ghost" size="sm" className="text-xs">
                캘린더
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pb-4">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-xs font-medium py-1 ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {/* 빈 셀 (월 시작 전) */}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {/* 날짜들 */}
              {daysInMonth.map((day) => {
                const dayOfWeek = day.getDay()
                const hasTask = datesWithTasks.has(startOfDay(day).getTime())
                const isTodayDate = isToday(day)

                return (
                  <div
                    key={day.toISOString()}
                    className={`aspect-square flex flex-col items-center justify-center rounded-md text-xs relative
                      ${isTodayDate
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'hover:bg-accent/50'
                      }
                      ${dayOfWeek === 0 && !isTodayDate ? 'text-red-500' : ''}
                      ${dayOfWeek === 6 && !isTodayDate ? 'text-blue-500' : ''}
                    `}
                  >
                    {format(day, 'd')}
                    {hasTask && !isTodayDate && (
                      <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* 오늘의 할 일 */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
              오늘의 할 일
            </CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                오늘 할 일이 없습니다
              </p>
            ) : (
              <ul className="space-y-2">
                {todayTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      task.isCompleted
                        ? 'bg-green-500 border-green-500'
                        : task.priority === 'URGENT'
                        ? 'border-red-500'
                        : task.priority === 'HIGH'
                        ? 'border-orange-500'
                        : 'border-muted-foreground'
                    }`} />
                    <span className={task.isCompleted ? 'line-through text-muted-foreground' : ''}>
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 최근 메모 */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-500" />
              최근 메모
            </CardTitle>
            <Link href="/notes">
              <Button variant="ghost" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                작성
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                아직 메모가 없습니다
              </p>
            ) : (
              <ul className="space-y-2">
                {recentNotes.map((note) => (
                  <li key={note.id}>
                    <Link
                      href={`/notes/${note.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div
                        className="w-2 h-8 rounded-full"
                        style={{ backgroundColor: note.color || '#6366f1' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{note.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(note.updatedAt), 'M월 d일 HH:mm', { locale: ko })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "늦은 밤이에요"
  if (hour < 12) return "좋은 아침이에요"
  if (hour < 18) return "좋은 오후에요"
  if (hour < 22) return "좋은 저녁이에요"
  return "늦은 밤이에요"
}
