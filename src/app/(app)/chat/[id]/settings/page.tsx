import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { isRoomMember } from '@/lib/access'
import { membersWithChildren } from '@/lib/members'
import { deleteRoom, setMuted, updateRoom } from '@/app/actions/chat'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'
import { MemberPicker } from '@/components/member-picker'
import { RoomNote } from '@/components/room-note'
import { RoomPollForm } from '@/components/room-poll-form'

export const metadata = { title: 'ルームの設定' }

export default async function RoomSettingsPage({ params }: PageProps<'/chat/[id]/settings'>) {
  const user = await requireUser()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await isRoomMember(user.id, id))) notFound()
  const [room] = await sql<{ name: string; muted: boolean }[]>`
    select r.name, cm.muted from chat_rooms r join chat_members cm on cm.room_id = r.id and cm.profile_id = ${user.id} where r.id = ${id}`
  const [note] = await sql<{ body: string }[]>`select body from chat_notes where room_id = ${id}`
  const current = (await sql<{ profile_id: string }[]>`select profile_id from chat_members where room_id = ${id}`).map((r) => r.profile_id)
  const members = user.isAdmin ? (await membersWithChildren()).filter((m) => m.id !== user.id) : []

  return (
    <>
      <PageHeader title="ルームの設定" back={`/chat/${id}`} />
      <Page className="space-y-4">
        <section className="card flex items-center justify-between p-4">
          <span className="text-sm font-semibold">通知 {room.muted ? 'オフ（ミュート中）' : 'オン'}</span>
          <ActionButton action={setMuted.bind(null, id, !room.muted)} className="btn-secondary btn-sm">
            {room.muted ? 'ミュートを解除' : 'ミュートする'}
          </ActionButton>
        </section>
        <p className="px-1 text-xs text-muted">ミュート中でも、メンション（@名前）されたときは通知されます。</p>

        {!user.isChild && (
          <section>
            <h2 className="section-title">ノート</h2>
            <RoomNote roomId={id} body={note?.body ?? ''} canEdit />
          </section>
        )}

        {user.isAdmin && (
          <>
            <section className="card space-y-3 p-4">
              <h2 className="font-bold">アンケートを作る</h2>
              <RoomPollForm roomId={id} />
            </section>
            <form action={updateRoom} className="card space-y-4 p-4">
              <input type="hidden" name="roomId" value={id} />
              <h2 className="font-bold">ルーム名とメンバー</h2>
              <input name="name" className="input" defaultValue={room.name} maxLength={50} required />
              <MemberPicker members={members} selected={current.filter((c) => c !== user.id)} />
              <SubmitButton>保存</SubmitButton>
            </form>
            <section className="card p-4">
              <ActionButton action={deleteRoom.bind(null, id)} className="btn-secondary w-full text-danger" confirm="このルームとメッセージをすべて削除しますか？">
                ルームを削除
              </ActionButton>
            </section>
          </>
        )}
      </Page>
    </>
  )
}
