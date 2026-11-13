import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

// アプリアイコン（PNG）。public/logo.png があればそれを使い、無ければ仮のマークを描く。
const SIZES = new Set([96, 180, 192, 512])

async function logoDataUrl(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_HAS_LOGO !== '1') return null
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'logo.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(_req: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size: raw } = await ctx.params
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192
  const s = size / 64
  const logo = await logoDataUrl()
  return new ImageResponse(
    logo ? (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={size * 0.84} height={size * 0.84} style={{ objectFit: 'contain' }} />
      </div>
    ) : (
      <div style={{ width: size, height: size, display: 'flex', background: '#1c4fa0', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 10 * s, top: 37.25 * s, width: 44 * s, height: 3.5 * s, borderRadius: 999, background: 'white' }} />
        <div style={{ position: 'absolute', left: 30.25 * s, top: 39 * s, width: 3.5 * s, height: 13 * s, borderRadius: 999, background: 'white' }} />
        <div style={{ position: 'absolute', left: 35 * s, top: 14 * s, width: 16 * s, height: 16 * s, borderRadius: 999, background: '#f59a23' }} />
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
