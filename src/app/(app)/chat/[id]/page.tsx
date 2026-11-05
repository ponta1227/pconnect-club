import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { isRoomMember } from '@/lib/access'
import { fetchMessages, markRoomRead, roomMembers } from '@/lib/chat'
import { pollsFor } from '@/lib/polls'
import { toPollData } from '@/lib/poll-view'
import { fmtDateTime } from '@/lib/time'
import { PageHeader } from '@/components/ui'
import { ChatRoom } from '@/components/chat-room'
import { Poll } from '@/components/poll'
import { RoomNote } from '@/components/room-note'
import { IconGear, IconSearch } from '@/components/icons'

export const metadata = { title: 'チャット' }

export default async function RoomPage({ params, searchParams }: PageProps<'/chat/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const { q } = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await isRoomMember(user.id, id))) notFound()
  const [room] = await sql<{ name: string }[]>`select name from chat_rooms where id = ${id}`
  const [members, note, polls] = await Promise.all([
    roomMembers(id),
    sql<{ body: string; updated_at: Date; name: string | null }[]>`
      select n.body, n.updated_at, p.display_name as name from chat_notes n left join profiles p on p.id = n.updated_by where n.room_id = ${id}`,
    pollsFor('room', [id], user),
  ])

  const header = (
    <PageHeader
      title={room.name}
      sub={`${members.length}人`}
      back="/chat"
      action={
        <div className="flex">
          <Link href={q ? `/chat/${id}` : `/chat/${id}?q=`} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg" aria-label="検索">
            <IconSearch />
          </Link>
          <Link href={`/chat/${id}/settings`} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg" aria-label="設定">
            <IconGear />
          </Link>
        </div>
      }
    />
  )

  // 検索
  if (typeof q === 'string') {
    const results = q.trim() ? await fetchMessages(id, { q, limit: 100 }) : []
    return (
      <>
        {header}
        <main className="mx-auto max-w-xl space-y-3 px-3 pb-28 pt-3">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} className="input flex-1" placeholder="メッセージを検索" autoFocus />
            <button className="btn-primary">検索</button>
          </form>
          {q.trim() && <p className="text-sm text-muted">{results.length}件</p>}
          <ul className="space-y-2">
            {results.reverse().map((m) => (
              <li key={m.id} className="card p-3 text-sm">
                <p className="text-xs text-muted">{m.sender_name}・{fmtDateTime(new Date(m.created_at))}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        </main>
      </>
    )
  }

  const messages = await fetchMessages(id, { limit: 50 })
  await markRoomRead(id, user.id)
  const openPolls = polls.filter((p) => !p.closed)

  return (
    <>
      {header}
      <div className="mx-auto max-w-xl">
        {(note[0]?.body || openPolls.length > 0 || polls.length > 0) && (
          <div className="space-y-2 px-3 pt-3">
            {note[0]?.body && (
              <RoomNote roomId={id} body={note[0].body} meta={`${note[0].name ?? ''} ${fmtDateTime(note[0].updated_at)}`} canEdit={!user.isChild} />
            )}
            {polls.length > 0 && (
              <details className="card p-3" open={openPolls.length > 0}>
                <summary className="cursor-pointer text-sm font-bold">アンケート {openPolls.length > 0 ? `（受付中 ${openPolls.length}）` : ''}</summary>
                <div className="mt-2 space-y-2">
                  {polls.map((p) => (
                    <Poll key={p.id} poll={toPollData(p)} isAdmin={user.isAdmin} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        <ChatRoom
          roomId={id}
          meId={user.id}
          isAdmin={user.isAdmin}
          initial={messages}
          members={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
        />
      </div>
    </>
  )
}
