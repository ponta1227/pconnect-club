import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { STAFF_NAME } from '@/lib/staff-name'
import { fmtRelative } from '@/lib/time'
import { STAFF_ROOM_PREFIX, syncStaffRooms } from '@/lib/staff-chat'
import { Empty, Page, PageHeader } from '@/components/ui'
import { IconChat, IconPlus } from '@/components/icons'

export const metadata = { title: 'チャット' }

export default async function ChatListPage() {
  const user = await requireUser()
  // スタッフ連絡のチャット（家族ごと）を、足りなければここで作る
  await syncStaffRooms()
  const rooms = await sql<
    {
      id: string
      name: string
      is_staff: boolean
      muted: boolean
      members: number
      unread: number
      last_body: string | null
      last_at: Date | null
      last_name: string | null
    }[]
  >`
    select r.id, r.name, r.is_staff, cm.muted,
      (select count(*)::int from chat_members x where x.room_id = r.id) as members,
      (select count(*)::int from chat_messages m where m.room_id = r.id and m.created_at > cm.last_read_at and m.deleted_at is null and m.sender_id is distinct from ${user.id}) as unread,
      lm.body as last_body, lm.created_at as last_at, case when lp.role = 'admin' and not ${user.isAdmin}::boolean then ${STAFF_NAME} else lp.display_name end as last_name
    from chat_members cm
    join chat_rooms r on r.id = cm.room_id
    left join lateral (select body, created_at, sender_id from chat_messages m where m.room_id = r.id and m.deleted_at is null order by created_at desc limit 1) lm on true
    left join profiles lp on lp.id = lm.sender_id
    where cm.profile_id = ${user.id}
    order by r.is_everyone desc, (r.is_staff and ${!user.isAdmin}::boolean) desc, coalesce(lm.created_at, r.created_at) desc`

  type Room = (typeof rooms)[number]
  // 管理者は家族の数だけスタッフ連絡があるので、まだ何も書かれていないものは下にたたむ
  const isQuiet = (r: Room) => user.isAdmin && r.is_staff && r.last_at == null
  const main = rooms.filter((r) => !isQuiet(r))
  const quiet = rooms.filter(isQuiet).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  // スタッフ連絡: 保護者には「スタッフへの連絡」、管理者にはお子さんの名前で見せる
  const title = (r: Room) => (!r.is_staff ? r.name : user.isAdmin ? r.name.replace(STAFF_ROOM_PREFIX, '') : 'スタッフへの連絡')
  const row = (r: Room) => (
    <li key={r.id}>
      <Link href={`/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <IconChat />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-bold">{title(r)}</span>
            {r.is_staff && user.isAdmin && <span className="shrink-0 rounded bg-brand-soft px-1.5 text-xs text-brand">保護者</span>}
            <span className="text-xs text-muted">{r.members}</span>
            {r.muted && <span className="text-xs text-muted">🔕</span>}
          </span>
          <span className="block truncate text-sm text-muted">{r.last_body != null ? `${r.last_name ?? ''}: ${r.last_body || '写真・ファイル'}` : 'メッセージはまだありません'}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {r.last_at && <span className="text-xs text-muted">{fmtRelative(r.last_at)}</span>}
          {r.unread > 0 && <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-xs leading-5 text-white">{r.unread}</span>}
        </span>
      </Link>
    </li>
  )

  return (
    <>
      <PageHeader
        title="チャット"
        action={
          user.isAdmin ? (
            <Link href="/chat/new" className="btn-primary btn-sm">
              <IconPlus className="h-5 w-5" />
              ルーム
            </Link>
          ) : undefined
        }
      />
      <Page>
        {rooms.length === 0 ? (
          <Empty>
            参加しているトークルームはありません。
            {user.isAdmin ? '「＋ルーム」から作成できます。' : 'ルームは管理者が作成します。'}
          </Empty>
        ) : (
          <>
            <ul className="card divide-y divide-line">{main.map(row)}</ul>
            {quiet.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer px-1 py-2 text-sm font-semibold text-muted">
                  まだやりとりのない保護者（
                  <span className="num">{quiet.length}</span>）
                </summary>
                <ul className="card mt-2 divide-y divide-line">{quiet.map(row)}</ul>
              </details>
            )}
          </>
        )}
      </Page>
    </>
  )
}
