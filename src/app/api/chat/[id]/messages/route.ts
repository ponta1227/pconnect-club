import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { isRoomMember } from '@/lib/access'
import { fetchMessages, markRoomRead } from '@/lib/chat'

// チャットの新着取得（画面から数秒ごとに呼ぶ）。取得と同時に既読にする。
export async function GET(req: NextRequest, ctx: RouteContext<'/api/chat/[id]/messages'>) {
  const user = await getCurrentUser()
  if (!user || !user.termsAgreedAt || (user.isChild && user.childAccount?.status !== 'active')) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await isRoomMember(user.id, id))) return new NextResponse('Not found', { status: 404 })
  const sp = req.nextUrl.searchParams
  const parse = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null)
  const after = parse(sp.get('after'))
  const before = parse(sp.get('before'))
  const messages = await fetchMessages(id, { after, before, limit: before ? 50 : 100 })
  if (!before && sp.get('visible') === '1') await markRoomRead(id, user.id)
  // 自分のメッセージの既読数を更新するため、直近の自分の発言も返す
  const recentMine = after ? (await fetchMessages(id, { after: new Date(after.getTime() - 10 * 60 * 1000), limit: 100 })).filter((m) => m.sender_id === user.id) : []
  return NextResponse.json({ messages, reads: recentMine.map((m) => ({ id: m.id, read_count: m.read_count })) }, { headers: { 'Cache-Control': 'no-store' } })
}
