import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { fmtRelative } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { IconChat, IconPlus } from '@/components/icons'

export const metadata = { title: 'チャット' }

export default async function ChatListPage() {
  const user = await requireUser()
  const rooms = await sql<{ id: string; name: string; muted: boolean; members: number; unread: number; last_body: string | null; last_at: Date | null; last_name: string | null }[]>`
    select r.id, r.name, cm.muted,
      (select count(*)::int from chat_members x where x.room_id = r.id) as members,
      (select count(*)::int from chat_messages m where m.room_id = r.id and m.created_at > cm.last_read_at and m.deleted_at is null and m.sender_id is distinct from ${user.id}) as unread,
      lm.body as last_body, lm.created_at as last_at, lp.display_name as last_name
    from chat_members cm
    join chat_rooms r on r.id = cm.room_id
    left join lateral (select body, created_at, sender_id from chat_messages m where m.room_id = r.id and m.deleted_at is null order by created_at desc limit 1) lm on true
    left join profiles lp on lp.id = lm.sender_id
    where cm.profile_id = ${user.id}
    order by coalesce(lm.created_at, r.created_at) desc`

  return (
    <>
      <PageHeader title="チャット" action={user.isAdmin ? <Link href="/chat/new" className="btn-primary btn-sm"><IconPlus className="h-5 w-5" />ルーム</Link> : undefined} />
      <Page>
        {rooms.length === 0 ? (
          <Empty>参加しているトークルームはありません。{user.isAdmin ? '「＋ルーム」から作成できます。' : 'ルームは管理者が作成します。'}</Empty>
        ) : (
          <ul className="card divide-y divide-line">
            {rooms.map((r) => (
              <li key={r.id}>
                <Link href={`/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <IconChat />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{r.name}</span>
                      <span className="text-xs text-muted">{r.members}</span>
                      {r.muted && <span className="text-xs text-muted">🔕</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {r.last_body != null ? `${r.last_name ?? ''}: ${r.last_body || '写真・ファイル'}` : 'メッセージはまだありません'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {r.last_at && <span className="text-xs text-muted">{fmtRelative(r.last_at)}</span>}
                    {r.unread > 0 && <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-xs leading-5 text-white">{r.unread}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  )
}
