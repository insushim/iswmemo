import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { Sprout, Sparkles, Target, Repeat, Trophy, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export default async function HomePage() {
  const session = await auth()

  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
      {/* 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <Sprout className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl gradient-text">GrowthPad</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">로그인</Button>
            </Link>
            <Link href="/register">
              <Button>시작하기</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* 히어로 섹션 */}
      <main className="container mx-auto px-4 pt-32 pb-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            게이미피케이션으로 즐거운 성장
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            매일 조금씩,{" "}
            <span className="gradient-text">꾸준히 성장하는</span>
            <br />나를 만들어요
          </h1>

          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            메모, 목표, 습관 추적을 하나로. 레벨업과 업적 시스템으로
            매일 성장하는 즐거움을 경험하세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto text-lg h-12 px-8">
                무료로 시작하기
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        {/* 기능 카드 */}
        <div className="grid md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto">
          <div className="p-6 rounded-2xl bg-card border shadow-sm card-hover">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">목표 계층 관리</h3>
            <p className="text-muted-foreground">
              인생 목표부터 일일 목표까지. 큰 꿈을 작은 단계로 나누어 하나씩 달성해보세요.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card border shadow-sm card-hover">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
              <Repeat className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">습관 스트릭</h3>
            <p className="text-muted-foreground">
              매일 조금씩 쌓이는 습관. 스트릭을 유지하며 나만의 루틴을 만들어보세요.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card border shadow-sm card-hover">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">레벨업 & 업적</h3>
            <p className="text-muted-foreground">
              활동할수록 경험치 획득. 다양한 업적을 달성하며 성장의 즐거움을 느껴보세요.
            </p>
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>GrowthPad - 성장하는 나의 하루</p>
        </div>
      </footer>
    </div>
  )
}
