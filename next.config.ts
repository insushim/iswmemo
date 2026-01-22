import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 번들 최적화
  reactStrictMode: true,

  // 이미지 최적화
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7일 캐시
  },

  // Turbopack 설정 (Next.js 16+ 기본)
  turbopack: {},

  // 실험적 기능
  experimental: {
    // 서버 액션 최적화
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // 패키지 최적화 (tree-shaking 개선)
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-slider',
      '@radix-ui/react-progress',
      '@radix-ui/react-avatar',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-accordion',
      '@radix-ui/react-label',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      'date-fns',
      'framer-motion',
      'recharts',
    ],
  },

  // 컴파일러 옵션
  compiler: {
    // 프로덕션에서 console.log 제거
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // 헤더 설정 (캐싱)
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/:all*(svg|jpg|png|webp|avif)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
