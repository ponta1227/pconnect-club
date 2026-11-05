import 'server-only'
import { sql } from './db'

export type ChatMessage = {
  id: string
  sender_id: string | null
  sender_name: string
  sender_avatar: string | null
  body: string
  created_at: string
  deleted: boolean
  reply_to: string | null
  reply_name: string | null
  reply_body: string | null
  mentions: string[]
  poll_id: string | null
  read_count: number
  attachments: { id: string; kind: 'photo' | 'pdf'; file_name: string }[]
}

type Row = Omit<ChatMessage, 'created_at' | 'attachments'> & { created_at: Date }

export async function fetchMessages(roomId: string, opts: { after?: Date | null; before?: Date | null; limit?: number; q?: string | null }) {
  const limit = Math.min(opts.limit ?? 50, 100)
  const after = opts.after ?? null
  const before = opts.before ?? null
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null
  const rows = await sql<Row[]>`
    select * from (
      select m.id, m.sender_id, coalesce(p.display_name, '退会したメンバー') as sender_name, p.avatar_url as sender_avatar,
        case when m.deleted_at is null then m.body else '' end as body,
        m.created_at, m.deleted_at is not null as deleted, m.reply_to,
        rp.display_name as reply_name, case when r.deleted_at is null then left(r.body, 60) else '（削除されました）' end as reply_body,
        m.mentions, m.poll_id,
        (select count(*)::int from chat_members cm where cm.room_id = m.room_id and cm.profile_id is distinct from m.sender_id and cm.last_read_at >= m.created_at) as read_count
      from chat_messages m
      left join profiles p on p.id = m.sender_id
      left join chat_messages r on r.id = m.reply_to and r.room_id = m.room_id
      left join profiles rp on rp.id = r.sender_id
      where m.room_id = ${roomId}
        and (${after}::timestamptz is null or m.created_at > ${after}::timestamptz)
        and (${before}::timestamptz is null or m.created_at < ${before}::timestamptz)
        and (${q}::text is null or (m.body ilike ${q}::text and m.deleted_at is null))
      order by m.created_at desc
      limit ${limit}
    ) t order by created_at`
  const ids = rows.map((r) => r.id)
  const atts = ids.length
    ? await sql<{ id: string; kind: 'photo' | 'pdf'; file_name: string; owner_id: string }[]>`
        select id, kind, file_name, owner_id from attachments where owner_type = 'message' and owner_id = any(${ids}::uuid[]) and uploaded order by created_at`
    : []
  return rows.map<ChatMessage>((r) => ({
    ...r,
    created_at: r.created_at.toISOString(),
    attachments: r.deleted ? [] : atts.filter((a) => a.owner_id === r.id).map(({ id, kind, file_name }) => ({ id, kind, file_name })),
  }))
}

export async function markRoomRead(roomId: string, profileId: string) {
  await sql`update chat_members set last_read_at = now() where room_id = ${roomId} and profile_id = ${profileId}`
}

export async function roomMembers(roomId: string) {
  return sql<{ id: string; display_name: string; avatar_url: string | null; account_kind: string; role: string }[]>`
    select p.id, p.display_name, p.avatar_url, p.account_kind, p.role from chat_members cm join profiles p on p.id = cm.profile_id
    where cm.room_id = ${roomId} and p.deleted_at is null order by p.display_name`
}
