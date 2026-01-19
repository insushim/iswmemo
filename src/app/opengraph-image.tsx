import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 72,
            }}
          >
            🌱
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: 20,
          }}
        >
          GrowthPad
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: '#94a3b8',
          }}
        >
          성장하는 나의 하루
        </div>

        {/* Features */}
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginTop: 50,
          }}
        >
          {['📝 메모', '🎯 목표', '✅ 습관', '📅 일정'].map((item) => (
            <div
              key={item}
              style={{
                fontSize: 24,
                color: '#e2e8f0',
                background: 'rgba(99, 102, 241, 0.2)',
                padding: '12px 24px',
                borderRadius: 12,
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
