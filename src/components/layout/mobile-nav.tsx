"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CheckCircle2,
  Repeat,
  Target,
  MoreHorizontal
} from "lucide-react"

const items = [
  { name: "홈", href: "/dashboard", icon: LayoutDashboard },
  { name: "할일", href: "/tasks", icon: CheckCircle2 },
  { name: "습관", href: "/habits", icon: Repeat },
  { name: "목표", href: "/goals", icon: Target },
  { name: "더보기", href: "/notes", icon: MoreHorizontal },
]

interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname()

  return (
    <nav className={cn(
      "fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-lg border-t",
      className
    )}>
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="text-xs">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
