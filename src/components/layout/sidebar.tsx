"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  StickyNote,
  Target,
  CheckCircle2,
  Repeat,
  Calendar,
  Trophy,
  Settings,
  ChevronDown,
  Sparkles,
  Flame,
  Star,
  Sprout,
  Clock,
  TrendingUp
} from "lucide-react"
import { useUser } from "@/hooks/use-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { levelSystem } from "@/lib/design-system"

const navigation = [
  { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { name: "오늘", href: "/today", icon: Sparkles },
  {
    name: "메모",
    href: "/notes",
    icon: StickyNote,
    children: [
      { name: "모든 메모", href: "/notes" },
      { name: "즐겨찾기", href: "/notes/favorites" },
      { name: "아카이브", href: "/notes/archive" },
    ]
  },
  {
    name: "목표",
    href: "/goals",
    icon: Target,
    children: [
      { name: "인생 목표", href: "/goals?type=LIFE" },
      { name: "올해 목표", href: "/goals?type=YEARLY" },
      { name: "이번 달", href: "/goals?type=MONTHLY" },
      { name: "이번 주", href: "/goals?type=WEEKLY" },
    ]
  },
  { name: "할 일", href: "/tasks", icon: CheckCircle2 },
  { name: "습관", href: "/habits", icon: Repeat },
  { name: "루틴", href: "/routines", icon: Clock },
  { name: "캘린더", href: "/calendar", icon: Calendar },
  { name: "통계", href: "/stats", icon: TrendingUp },
  { name: "업적", href: "/achievements", icon: Trophy },
]

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useUser()
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const toggleExpand = (name: string) => {
    setExpandedItems(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    )
  }

  const level = user ? levelSystem.getLevel(user.experience) : 1
  const expProgress = user ? levelSystem.getExpProgress(user.experience) : 0
  const levelTitle = levelSystem.getLevelTitle(level)
  const levelColor = levelSystem.getLevelColor(level)

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen w-[var(--sidebar-width)] flex flex-col",
      "bg-card border-r border-border",
      className
    )}>
      {/* 로고 */}
      <div className="h-[var(--header-height)] flex items-center px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
            <Sprout className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg gradient-text">GrowthPad</h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">성장하는 나의 하루</p>
          </div>
        </Link>
      </div>

      {/* 사용자 프로필 & 레벨 */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <Avatar className="w-12 h-12 ring-2 ring-offset-2 ring-offset-background" style={{ borderColor: levelColor }}>
              <AvatarImage src={user?.image || ''} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: levelColor }}
            >
              {level}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user?.name || '사용자'}</p>
            <p className="text-xs text-muted-foreground">{levelTitle}</p>
          </div>
        </div>

        {/* 경험치 바 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">레벨 {level}</span>
            <span className="text-muted-foreground">{Math.round(expProgress)}%</span>
          </div>
          <Progress value={expProgress} className="h-2" />
        </div>

        {/* 스트릭 & 포인트 */}
        <div className="flex gap-2 mt-3">
          <div className="flex-1 p-2 rounded-lg bg-orange-500/10 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">스트릭</p>
              <p className="font-bold text-sm">{user?.currentStreak || 0}일</p>
            </div>
          </div>
          <div className="flex-1 p-2 rounded-lg bg-amber-500/10 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">포인트</p>
              <p className="font-bold text-sm">{user?.totalPoints?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const isExpanded = expandedItems.includes(item.name)
          const hasChildren = item.children && item.children.length > 0

          return (
            <div key={item.name}>
              <Link
                href={hasChildren ? '#' : item.href}
                onClick={hasChildren ? (e) => { e.preventDefault(); toggleExpand(item.name) } : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  "hover:bg-accent/50",
                  isActive && !hasChildren && "bg-primary/10 text-primary"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5",
                  isActive && !hasChildren ? "text-primary" : "text-muted-foreground"
                )} />
                <span className="flex-1">{item.name}</span>
                {hasChildren && (
                  <ChevronDown className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    isExpanded && "rotate-180"
                  )} />
                )}
              </Link>

              {/* 서브메뉴 */}
              <AnimatePresence>
                {hasChildren && isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-8 mt-1 space-y-1">
                      {item.children?.map((child) => {
                        const isChildActive = pathname === child.href || pathname.startsWith(child.href)
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            className={cn(
                              "block px-3 py-2 rounded-lg text-sm transition-colors",
                              "hover:bg-accent/50",
                              isChildActive && "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            {child.name}
                          </Link>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      {/* 설정 */}
      <div className="p-3 border-t border-border">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            "hover:bg-accent/50",
            pathname === '/settings' && "bg-primary/10 text-primary"
          )}
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
          <span>설정</span>
        </Link>
      </div>
    </aside>
  )
}
