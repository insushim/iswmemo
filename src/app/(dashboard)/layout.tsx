import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { MobileNav } from "@/components/layout/mobile-nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 데스크톱 사이드바 */}
      <Sidebar className="hidden lg:flex" />

      {/* 메인 컨텐츠 영역 */}
      <div className="lg:pl-[var(--sidebar-width)]">
        <Header user={session.user} />

        <main className="min-h-[calc(100vh-var(--header-height))] p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* 모바일 하단 네비게이션 */}
      <MobileNav className="lg:hidden" />
    </div>
  )
}
