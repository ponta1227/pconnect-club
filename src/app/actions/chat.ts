'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { isRoomMember } from '@/lib/access'
import { attachTo } from '@/lib/files'
import { notifyLater } from '@/lib/notify'
import { fetchMessages } from '@/lib/chat'

const SendInput = z.object({
  roomId: z.string().uuid(),
  body: z.string().max(4000),
  replyTo: z.string().uuid().nullable(),
  mentions: z.array(z.string().uuid()).max(50),
  attachments: z.array(z.string().uuid()).max(10),
})

export async function sendMessage(raw: z.input<typeof SendInput>) {
  const user = await requireUser()
  const v = SendInput.parse(raw)
  if (!(await isRoomMember(user.id, v.roomId))) throw new Error('このルームのメンバーではありません')
  const body = v.body.trim()
  if (!body && v.attachments.length === 0) throw new Error('メッセージを入力してください')

  const memberIds = new Set((await sql<{ profile_id: string }[]>`select profile_id from chat_members where room_id = ${v.roomId}`).map((r) => r.profile_id))
  const mentions = v.mentions.filter((m) => memberIds.has(m) && m !== user.id)

  const msgId = await sql.begin(async (tx) => {
    const [m] = await tx<{ id: string }[]>`
      insert into chat_messages (room_id, sender_id, body, reply_to, mentions)
      values (${v.roomId}, ${user.id}, ${body}, ${v.replyTo}, ${mentions}::uuid[])
      returning id`
    await attachTo(tx, user, 'message', m.id, v.attachments)
    await tx`update chat_members set last_read_at = now() where room_id = ${v.roomId} and profile_id = ${user.id}`
    return m.id
  })

  const [room] = await sql<{ name: string }[]>`select name from chat_rooms where id = ${v.roomId}`
  const preview = body ? body.slice(0, 80) : '写真・ファイルを送信しました'
  const url = `/chat/${v.roomId}`

  // メンション：ミュート中でも・夜間でも通知
  if (mentions.length) {
    notifyLater(mentions, 'mention', { title: `${room.name}でメンションされました`, body: `${user.displayName}: ${preview}`, url }, { bypassQuiet: true })
  }
  // 通常の新着：ミュートしていない人に、同じルームでは30秒に1回まで
  const targets = await sql<{ profile_id: string }[]>`
    update chat_members set last_push_at = now()
    where room_id = ${v.roomId} and profile_id <> ${user.id} and not muted
      and not (profile_id = any(${mentions}::uuid[]))
      and (last_push_at is null or last_push_at < now() - interval '30 seconds')
      and last_read_at < now() - interval '5 seconds'
    returning profile_id`
  notifyLater(targets.map((t) => t.profile_id), 'chat', { title: room.name, body: `${user.displayName}: ${preview}`, url })

  const [msg] = await fetchMessages(v.roomId, { after: new Date(Date.now() - 60_000), limit: 100 }).then((list) => list.filter((m) => m.id === msgId))
  return msg
}

export async function deleteMessage(messageId: string) {
  const user = await requireUser()
  const [m] = await sql<{ sender_id: string | null; room_id: string; created_at: Date }[]>`
    select sender_id, room_id, created_at from chat_messages where id = ${messageId}`
  if (!m || !(await isRoomMember(user.id, m.room_id))) throw new Error('メッセージが見つかりません')
  const own = m.sender_id === user.id && Date.now() - m.created_at.getTime() < 24 * 3600 * 1000
  if (!own && !user.isAdmin) throw new Error('削除できるのは送信後24時間以内の本人か管理者です')
  await sql`update chat_messages set deleted_at = now() where id = ${messageId}`
  await sql`update attachments set owner_type = null, owner_id = null where owner_type = 'message' and owner_id = ${messageId}`
  return { ok: true }
}

export async function setMuted(roomId: string, muted: boolean) {
  const user = await requireUser()
  await sql`update chat_members set muted = ${muted} where room_id = ${roomId} and profile_id = ${user.id}`
  refresh()
}

export async function saveNote(roomId: string, body: string) {
  const user = await requireUser()
  if (!(await isRoomMember(user.id, roomId))) throw new Error('このルームのメンバーではありません')
  if (user.isChild) throw new Error('ノートは編集できません')
  await sql`
    insert into chat_notes (room_id, body, updated_by, updated_at) values (${roomId}, ${body.slice(0, 5000)}, ${user.id}, now())
    on conflict (room_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()`
  refresh()
}

// ------------------------------------------------------------ 管理者: ルームの作成・メンバー管理

export async function createRoom(formData: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const name = String(formData.get('name') ?? '').trim().slice(0, 50)
  if (!name) redirect('/chat/new?error=name')
  const members = formData.getAll('members').map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x))
  const id = await sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`insert into chat_rooms (name, created_by) values (${name}, ${user.id}) returning id`
    for (const m of new Set([user.id, ...members])) {
      await tx`insert into chat_members (room_id, profile_id) select ${r.id}, id from profiles where id = ${m} and deleted_at is null on conflict do nothing`
    }
    return r.id
  })
  redirect(`/chat/${id}`)
}

export async function updateRoom(formData: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const roomId = String(formData.get('roomId'))
  if (!(await isRoomMember(user.id, roomId))) redirect('/chat')
  const name = String(formData.get('name') ?? '').trim().slice(0, 50)
  const members = new Set(formData.getAll('members').map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)))
  members.add(user.id)
  await sql.begin(async (tx) => {
    if (name) await tx`update chat_rooms set name = ${name} where id = ${roomId}`
    await tx`delete from chat_members where room_id = ${roomId} and not (profile_id = any(${[...members]}::uuid[]))`
    for (const m of members) {
      await tx`insert into chat_members (room_id, profile_id) select ${roomId}, id from profiles where id = ${m} and deleted_at is null on conflict do nothing`
    }
  })
  redirect(`/chat/${roomId}`)
}

export async function deleteRoom(roomId: string) {
  const user = await requireUser()
  assertAdmin(user)
  if (!(await isRoomMember(user.id, roomId))) throw new Error('このルームのメンバーではありません')
  await sql`delete from polls where owner_type = 'room' and owner_id = ${roomId}`
  await sql`delete from chat_rooms where id = ${roomId}`
  redirect('/chat')
}
