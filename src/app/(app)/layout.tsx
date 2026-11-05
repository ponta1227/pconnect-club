import { BottomNav } from '@/components/bottom-nav'
import { PushRegistrar } from '@/components/push'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  const [counts] = await sql<{ board: number; chat: number; rooms: number }[]>`
    select
      (select count(*)::int from posts p
        where p.published_at is not null
          and p.published_at > now() - interval '30 days'
          and p.published_at > (select created_at from profiles where id = ${user.id})
          and not exists (select 1 from post_reads r where r.post_id = p.id and r.profile_id = ${user.id})) as board,
      (select count(*)::int from chat_messages m
        join chat_members cm on cm.room_id = m.room_id and cm.profile_id = ${user.id}
        where m.created_at > cm.last_read_at and m.deleted_at is null and m.sender_id is distinct from ${user.id}) as chat,
      (select count(*)::int from chat_members where profile_id = ${user.id}) as rooms`

  // 子どもアカウントは、管理者に追加されたルームがあるときだけチャットのタブを出す
  const showChat = !user.isChild || counts.rooms > 0

  return (
    <>
      {children}
      <PushRegistrar />
      <BottomNav showChat={showChat} chatUnread={counts.chat} boardUnread={counts.board} />
    </>
  )
}
