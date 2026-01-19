import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { startOfDay, endOfDay, format } from "date-fns"
import { ko } from "date-fns/locale"
import {
  Flame,
  Target,
  CheckCircle2,
  Repeat,
  Sparkles,
  StickyNote,
  Plus
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const userId = session.user.id
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)

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

  try {
    // 통계 데이터 조회
    const results = await Promise.all([
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
      prisma.task.count({
        where: {
          userId,
          OR: [
            { dueDate: { gte: todayStart, lte: todayEnd } },
            { dueDate: null, isCompleted: false }
          ]
        }
      }),
      prisma.task.count({
        where: {
          userId,
          isCompleted: true,
          completedAt: { gte: todayStart, lte: todayEnd }
        }
      }),
      prisma.habit.count({
        where: { userId, isActive: true }
      }),
      prisma.habitLog.count({
        where: {
          userId,
          date: todayStart
        }
      }),
      prisma.goal.count({
        where: { userId, status: 'IN_PROGRESS' }
      }),
      prisma.note.count({
        where: {
          userId,
          createdAt: { gte: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)) }
        }
      }),
      prisma.note.findMany({
        where: { userId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true, color: true }
      }),
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
      })
    ])

    user = results[0]
    todayTasksCount = results[1]
    completedTasksCount = results[2]
    todayHabitsCount = results[3]
    completedHabitsCount = results[4]
    activeGoalsCount = results[5]
    thisMonthNotesCount = results[6]
    recentNotes = results[7]
    todayTasks = results[8]
  } catch (error) {
    console.error('Dashboard data fetch error:', error)
  }

  const greeting = getGreeting()
  const taskCompletionRate = todayTasksCount > 0 ? Math.round((completedTasksCount / todayTasksCount) * 100) : 0
  const habitCompletionRate = todayHabitsCount > 0 ? Math.round((completedHabitsCount / todayHabitsCount) * 100) : 0

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
      <div className="grid lg:grid-cols-2 gap-6">
        {/* 오늘의 할 일 */}
        <Card>
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
        <Card>
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
