import 'server-only'
import { cache } from 'react'
import { sql } from './db'
import { getCurrentUser } from './auth'
import { adultsForClasses, myChildren, type ChildLite } from './access'

// ホームの「やること」。保護者が開いた瞬間に、自分が対応すべきものだけを出す。

export type KidAnswer = { id: string; full_name: string; status: 'going' | 'waitlist' | 'declined' | null; companions: number }

export type RsvpTodo = {
  id: string
  title: string
  starts_at: Date
  all_day: boolean
  venue: string
  type_name: string
  type_color: string
  member_deadline: Date | null
  allow_companions: boolean
  fee_note: string
  kids: KidAnswer[]
}

export type PostTodo = { id: string; title: string; urgent: boolean; published_at: Date; has_poll: boolean }
export type PollTodo = { id: string; question: string; href: string; closes_at: Date | null }

export type Todos = {
  kids: ChildLite[]
  rsvps: RsvpTodo[]
  /** 受付中で、自分の子が全員回答済みの予定（ホームの「回答済み」表示用） */
  answered: RsvpTodo[]
  posts: PostTodo[]
  polls: PollTodo[]
  count: number
}

const EMPTY: Todos = { kids: [], rsvps: [], answered: [], posts: [], polls: [], count: 0 }

export const getTodos = cache(async (): Promise<Todos> => {
  const user = await getCurrentUser()
  if (!user) return EMPTY
  const kids = await myChildren(user)
  const kidIds = kids.map((k) => k.id)

  // ---- 受付中の大会・イベントと、自分の子の回答
  const pairs = kidIds.length
    ? await sql<{ event_id: string; child_id: string; status: KidAnswer['status']; companions: number | null }[]>`
        select e.id as event_id, c.id as child_id, r.status, r.companions
        from events e
        join event_types t on t.id = e.type_id
        cross join children c
        left join rsvps r on r.event_id = e.id and r.child_id = c.id
        where t.uses_rsvp and e.status = 'active'
          and coalesce(e.member_deadline, e.starts_at) > now()
          and c.id = any(${kidIds}::uuid[])
          and (not exists (select 1 from event_classes ec where ec.event_id = e.id)
            or exists (select 1 from event_classes ec join child_classes cc on cc.class_id = ec.class_id
                       where ec.event_id = e.id and cc.child_id = c.id))`
    : []
  const eventIds = [...new Set(pairs.map((p) => p.event_id))]
  const events = eventIds.length
    ? await sql<Omit<RsvpTodo, 'kids'>[]>`
        select e.id, e.title, e.starts_at, e.all_day, coalesce(v.name, e.venue_text, '') as venue,
          t.name as type_name, t.color as type_color, e.member_deadline, e.allow_companions, e.fee_note
        from events e join event_types t on t.id = e.type_id left join venues v on v.id = e.venue_id
        where e.id = any(${eventIds}::uuid[])
        order by coalesce(e.member_deadline, e.starts_at)`
    : []
  const withKids: RsvpTodo[] = events.map((e) => ({
    ...e,
    kids: kids
      .filter((k) => pairs.some((p) => p.event_id === e.id && p.child_id === k.id))
      .map((k) => {
        const p = pairs.find((x) => x.event_id === e.id && x.child_id === k.id)!
        return { id: k.id, full_name: k.full_name, status: p.status, companions: p.companions ?? 0 }
      }),
  }))
  const rsvps = withKids.filter((e) => e.kids.some((k) => k.status === null))
  const answered = withKids.filter((e) => e.kids.every((k) => k.status !== null))
  const pendingEventIds = rsvps.map((e) => e.id)

  // ---- 未読のお知らせ（自分のクラス宛て・全員宛て）。回答待ちの予定の告知は上のカードで足りるので除く
  const classIds = kidIds.length
    ? (await sql<{ class_id: string }[]>`select distinct class_id from child_classes where child_id = any(${kidIds}::uuid[])`).map((r) => r.class_id)
    : []
  const posts = await sql<PostTodo[]>`
    select p.id, p.title, p.urgent, p.published_at,
      exists (select 1 from polls pl where pl.owner_type = 'post' and pl.owner_id = p.id and pl.closed_at is null) as has_poll
    from posts p
    where p.published_at is not null
      and p.published_at > now() - interval '30 days'
      and p.published_at > (select created_at from profiles where id = ${user.id})
      and p.created_by is distinct from ${user.id}
      and not exists (select 1 from post_reads r where r.post_id = p.id and r.profile_id = ${user.id})
      and (p.event_id is null or not (p.event_id = any(${pendingEventIds}::uuid[])))
      and (${user.isAdmin}::bool
        or not exists (select 1 from post_classes pc where pc.post_id = p.id)
        or exists (select 1 from post_classes pc where pc.post_id = p.id and pc.class_id = any(${classIds}::uuid[])))
    order by p.urgent desc, p.published_at desc
    limit 10`

  // ---- 未回答のアンケート（掲示板・参加しているトークルーム）
  const polls = (
    await sql<{ id: string; question: string; owner_type: 'post' | 'room'; owner_id: string; closes_at: Date | null }[]>`
      select pl.id, pl.question, pl.owner_type, pl.owner_id, pl.closes_at
      from polls pl
      where pl.closed_at is null and (pl.closes_at is null or pl.closes_at > now())
        and pl.created_at > now() - interval '60 days'
        and not exists (select 1 from poll_voters v where v.poll_id = pl.id and v.profile_id = ${user.id})
        and ((pl.owner_type = 'post' and exists (select 1 from posts p where p.id = pl.owner_id and p.published_at is not null
                and p.published_at > (select created_at from profiles where id = ${user.id})))
          or (pl.owner_type = 'room' and exists (select 1 from chat_members cm where cm.room_id = pl.owner_id and cm.profile_id = ${user.id})))
      order by pl.closes_at nulls last, pl.created_at desc
      limit 10`
  ).map<PollTodo>((p) => ({
    id: p.id,
    question: p.question,
    href: p.owner_type === 'post' ? `/board/${p.owner_id}` : `/chat/${p.owner_id}`,
    closes_at: p.closes_at,
  }))

  // アンケート付きの未読投稿は、アンケートの項目にまとめる
  const pollPostHrefs = new Set(polls.map((p) => p.href))
  const postTodos = posts.filter((p) => !pollPostHrefs.has(`/board/${p.id}`))

  return { kids, rsvps, answered, posts: postTodos, polls, count: rsvps.length + postTodos.length + polls.length }
})

// ---------------------------------------------------------------- 管理者向け：クラブの状況

export type AdminStatus = {
  approvals: number
  events: { id: string; title: string; starts_at: Date; member_deadline: Date | null; going: number; declined: number; unanswered: number }[]
  posts: { id: string; title: string; published_at: Date; unread: number; target: number }[]
}

export async function getAdminStatus(): Promise<AdminStatus> {
  const [[a], events, posts] = await Promise.all([
    sql<{ n: number }[]>`
      select (select count(*)::int from guardian_children where status = 'pending')
           + (select count(*)::int from child_accounts where status = 'pending') as n`,
    sql<AdminStatus['events']>`
      select e.id, e.title, e.starts_at, e.member_deadline,
        (select count(*)::int from rsvps r where r.event_id = e.id and r.status in ('going', 'waitlist')) as going,
        (select count(*)::int from rsvps r where r.event_id = e.id and r.status = 'declined') as declined,
        (select count(*)::int from children c
          where c.status = 'active'
            and not exists (select 1 from rsvps r where r.event_id = e.id and r.child_id = c.id)
            and (not exists (select 1 from event_classes ec where ec.event_id = e.id)
              or exists (select 1 from event_classes ec join child_classes cc on cc.class_id = ec.class_id
                         where ec.event_id = e.id and cc.child_id = c.id))) as unanswered
      from events e join event_types t on t.id = e.type_id
      where t.uses_rsvp and e.status = 'active' and coalesce(e.member_deadline, e.starts_at) > now()
      order by coalesce(e.member_deadline, e.starts_at)
      limit 6`,
    sql<{ id: string; title: string; published_at: Date; class_ids: string[] }[]>`
      select p.id, p.title, p.published_at,
        coalesce((select array_agg(class_id) from post_classes pc where pc.post_id = p.id), '{}') as class_ids
      from posts p where p.published_at > now() - interval '14 days'
      order by p.published_at desc limit 4`,
  ])
  const postStatus = await Promise.all(
    posts.map(async (p) => {
      const { unread, target } = await postUnread(p.id, p.class_ids)
      return { id: p.id, title: p.title, published_at: p.published_at, unread: unread.length, target }
    }),
  )
  return { approvals: a.n, events, posts: postStatus }
}

/** 投稿をまだ読んでいない保護者・家族（対象クラスの保護者＋管理者） */
export async function postUnread(postId: string, classIds: string[]) {
  const targets = await adultsForClasses(classIds)
  if (targets.length === 0) return { unread: [] as { id: string; name: string }[], target: 0 }
  const unread = await sql<{ id: string; name: string }[]>`
    select p.id, p.display_name as name from profiles p
    where p.id = any(${targets}::uuid[]) and p.deleted_at is null
      and not exists (select 1 from post_reads r where r.post_id = ${postId} and r.profile_id = p.id)
    order by p.display_name`
  return { unread, target: targets.length }
}
