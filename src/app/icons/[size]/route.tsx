import { ImageResponse } from 'next/og'

// アプリアイコン（PNG）。ロゴが届いたら public/ に画像を置いて manifest を差し替える。
const SIZES = new Set([96, 180, 192, 512])

export async function GET(_req: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size: raw } = await ctx.params
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192
  const s = size / 64
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', background: '#1e6fd9', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 44 * s - 6 * s,
            top: 20 * s - 6 * s,
            width: 12 * s,
            height: 12 * s,
            borderRadius: 999,
            background: 'white',
          }}
        />
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d="M20 48V16h11a9 9 0 0 1 0 18H20" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
