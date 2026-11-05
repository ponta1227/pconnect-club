import { NextResponse, type NextRequest } from 'next/server'
import { consumeLocalUploadToken, usingLocalStorage, writeLocal } from '@/lib/storage'

// 開発用：Supabase を使わない場合のアップロード先
export async function PUT(req: NextRequest) {
  if (!usingLocalStorage()) return new NextResponse('Not found', { status: 404 })
  const path = consumeLocalUploadToken(req.nextUrl.searchParams.get('token') ?? '')
  if (!path) return new NextResponse('invalid token', { status: 403 })
  const data = Buffer.from(await req.arrayBuffer())
  if (data.length > 21 * 1024 * 1024) return new NextResponse('too large', { status: 413 })
  await writeLocal(path, data)
  return NextResponse.json({ ok: true })
}
