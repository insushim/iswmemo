import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "GrowthPad - 성장하는 나의 하루",
  description: "메모, 목표, 습관 추적을 게이미피케이션으로 즐겁게 관리하세요",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon?v=2", type: "image/png" },
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
    apple: "/apple-icon?v=2",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GrowthPad",
  },
  openGraph: {
    title: "GrowthPad - 성장하는 나의 하루",
    description: "메모, 목표, 습관 추적을 게이미피케이션으로 즐겁게 관리하세요",
    siteName: "GrowthPad",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GrowthPad - 성장하는 나의 하루",
    description: "메모, 목표, 습관 추적을 게이미피케이션으로 즐겁게 관리하세요",
  },
}

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
