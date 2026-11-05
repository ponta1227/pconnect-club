import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { canViewAttachment, type AttachmentRow } from '@/lib/files'
import { readLocal, signedUrl, usingLocalStorage } from '@/lib/storage'

// メンバーだけがファイルを見られる。Supabase の場合は1時間有効の署名付きURLへ転送する。
export async function GET(req: NextRequest, ctx: RouteContext<'/api/files/[id]'>) {
  const user = await getCurrentUser()
  if (!user || (user.isChild && user.childAccount?.status !== 'active')) {
    return new NextResponse('ログインが必要です', { status: 401 })
  }
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 })
  const [a] = await sql<AttachmentRow[]>`
    select id, kind, file_name, mime, size, storage_path, owner_type, owner_id, created_by
    from attachments where id = ${id} and uploaded`
  if (!a || !(await canViewAttachment(user, a))) return new NextResponse('Not found', { status: 404 })

  const download = req.nextUrl.searchParams.get('download') === '1'
  const filename = a.file_name || (a.kind === 'pdf' ? 'file.pdf' : 'photo.jpg')

  if (usingLocalStorage()) {
    const data = await readLocal(a.storage_path)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': a.mime,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  }
  const url = await signedUrl(a.storage_path, download ? { download: filename } : {})
  if (!url) return new NextResponse('Not found', { status: 404 })
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, max-age=600' } })
}
