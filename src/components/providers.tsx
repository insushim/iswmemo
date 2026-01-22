"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { useState, useMemo } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5분 동안 데이터를 fresh로 유지
            staleTime: 5 * 60 * 1000,
            // 10분 동안 캐시 유지
            gcTime: 10 * 60 * 1000,
            // 창 포커스 시 refetch 안함
            refetchOnWindowFocus: false,
            // 마운트 시 refetch 안함 (캐시 사용)
            refetchOnMount: false,
            // 재연결 시 refetch 안함
            refetchOnReconnect: false,
            // 실패 시 1회만 재시도
            retry: 1,
            retryDelay: 1000,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
