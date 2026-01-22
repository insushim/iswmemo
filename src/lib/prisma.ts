import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  // 개발 환경에서만 쿼리 로그 (성능 영향)
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  // 데이터소스 설정
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// 개발 환경에서 Hot Reload 시 연결 재사용
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// 앱 종료 시 연결 정리
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
