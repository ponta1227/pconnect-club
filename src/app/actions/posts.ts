'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adultsForClasses, allAdultIds } from '@/lib/access'
import { attachTo, detachMissing } from '@/lib/files'
import { notifyLater } from '@/lib/notify'
import { insertPoll, readPollForm } from '@/lib/poll-write'
import { REACTIONS } from '@/lib/reactions'

const PostForm = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'タイトルを入力してください').max(100),
  body: z.string().trim().max(10000),
  class_ids: z.array(z.string().uuid()),
  urgent: z.boolean(),
  pinned: z.boolean(),
  publish: z.boolean(),
  attachments: z.array(z.string()),
})

export type PostFormState = { error?: string } | undefined

export async function savePost(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  const user = await requireUser()
  assertAdmin(user)
  const parsed = PostForm.safeParse({
    id: fd.get('id') || undefined,
    title: fd.get('title'),
    body: fd.get('body') ?? '',
    class_ids: fd.getAll('class_ids'),
    urgent: fd.get('urgent') === 'on',
    pinned: fd.get('pinned') === 'on',
    publish: fd.get('intent') !== 'draft',
    attachments: fd.getAll('attachments').map(String),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  const poll = v.id ? null : readPollForm(fd)

  if (v.pinned) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from posts where pinned and published_at is not null and id is distinct from ${v.id ?? null}::uuid`
    if (count >= 3) return { error: '固定できる投稿は3件までです。ほかの投稿の固定を外してください' }
  }

  let wasPublished = false
  let id: string
  try {
    id = await sql.begin(async (tx) => {
      let postId: string
      if (v.id) {
        const [cur] = await tx<{ published_at: Date | null; pinned: boolean; pinned_at: Date | null }[]>`
          select published_at, pinned, pinned_at from posts where id = ${v.id}`
        if (!cur) throw new Error('投稿が見つかりません')
        wasPublished = !!cur.published_at
        const now = new Date()
        const pinnedAt = v.pinned ? (cur.pinned ? cur.pinned_at : now) : null
        const publishedAt = v.publish ? (cur.published_at ?? now) : null
        await tx`
          update posts set title = ${v.title}, body = ${v.body}, urgent = ${v.urgent}, pinned = ${v.pinned},
            pinned_at = ${pinnedAt}, published_at = ${publishedAt}, updated_at = now()
          where id = ${v.id}`
        postId = v.id
        await tx`delete from post_classes where post_id = ${postId}`
        await detachMissing(tx, 'post', postId, v.attachments.filter((x) => /^[0-9a-f-]{36}$/.test(x)))
      } else {
        const [p] = await tx<{ id: string }[]>`
          insert into posts (title, body, urgent, pinned, pinned_at, published_at, created_by)
          values (${v.title}, ${v.body}, ${v.urgent}, ${v.pinned}, ${v.pinned ? new Date() : null}, ${v.publish ? new Date() : null}, ${user.id})
          returning id`
        postId = p.id
      }
      for (const c of v.class_ids) await tx`insert into post_classes (post_id, class_id) values (${postId}, ${c})`
      await attachTo(tx, user, 'post', postId, v.attachments)
      if (poll) await insertPoll(tx, user, 'post', postId, poll)
      return postId
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : '保存に失敗しました' }
  }

  // 初めて公開したときだけ通知（子どもアカウントには送らない）
  if (v.publish && !wasPublished) {
    const recipients = (v.urgent ? await allAdultIds() : await adultsForClasses(v.class_ids)).filter((r) => r !== user.id)
    notifyLater(recipients, v.urgent ? 'urgent' : 'post', {
      title: v.urgent ? `【緊急】${v.title}` : v.title,
      body: v.body.slice(0, 120) || '新しいお知らせがあります',
      url: `/board/${id}`,
    }, { urgent: v.urgent })
  }
  redirect(`/board/${id}`)
}

export async function deletePost(id: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`delete from polls where owner_type = 'post' and owner_id = ${id}`
  await sql`delete from posts where id = ${id}`
  redirect('/board')
}

export async function togglePin(id: string, pinned: boolean) {
  const user = await requireUser()
  assertAdmin(user)
  if (pinned) {
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from posts where pinned and published_at is not null and id <> ${id}`
    if (count >= 3) throw new Error('固定できる投稿は3件までです')
  }
  await sql`update posts set pinned = ${pinned}, pinned_at = ${pinned ? new Date() : null} where id = ${id}`
  refresh()
}

export async function addComment(postId: string, body: string) {
  const user = await requireUser()
  const text = body.trim().slice(0, 2000)
  if (!text) throw new Error('コメントを入力してください')
  const [post] = await sql<{ title: string; created_by: string | null }[]>`select title, created_by from posts where id = ${postId} and published_at is not null`
  if (!post) throw new Error('投稿が見つかりません')
  await sql`insert into post_comments (post_id, profile_id, body) values (${postId}, ${user.id}, ${text})`
  // 投稿者と、これまでにコメントした人へ（既定はOFF。設定でONにした人だけに届く）
  const others = await sql<{ profile_id: string }[]>`
    select distinct profile_id from post_comments where post_id = ${postId} and profile_id is not null`
  const recipients = [post.created_by, ...others.map((o) => o.profile_id)].filter((x): x is string => !!x && x !== user.id)
  notifyLater(recipients, 'comment', { title: `コメント: ${post.title}`, body: `${user.displayName}: ${text.slice(0, 80)}`, url: `/board/${postId}` })
  refresh()
}

export async function deleteComment(commentId: string) {
  const user = await requireUser()
  const [c] = await sql<{ profile_id: string | null }[]>`select profile_id from post_comments where id = ${commentId}`
  if (!c) return
  if (c.profile_id !== user.id && !user.isAdmin) throw new Error('削除できるのは本人か管理者です')
  await sql`update post_comments set deleted_at = now() where id = ${commentId}`
  refresh()
}

export async function toggleReaction(postId: string, emoji: string) {
  const user = await requireUser()
  if (!REACTIONS.includes(emoji)) throw new Error('このスタンプは使えません')
  const [post] = await sql`select 1 from posts where id = ${postId} and published_at is not null`
  if (!post) throw new Error('投稿が見つかりません')
  const [existing] = await sql`select 1 from post_reactions where post_id = ${postId} and profile_id = ${user.id} and emoji = ${emoji}`
  if (existing) await sql`delete from post_reactions where post_id = ${postId} and profile_id = ${user.id} and emoji = ${emoji}`
  else await sql`insert into post_reactions (post_id, profile_id, emoji) values (${postId}, ${user.id}, ${emoji}) on conflict do nothing`
  refresh()
}
