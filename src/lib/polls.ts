import 'server-only'
import { sql } from './db'
import type { CurrentUser } from './auth'
import { adultsForClasses, childAccountsForClasses } from './access'

export type PollOption = {
  id: string
  label: string
  starts_at: Date | null
  yes: number
  maybe: number
  no: number
  voters: { name: string; value: string }[]
}

export type PollView = {
  id: string
  owner_type: 'post' | 'room'
  owner_id: string
  question: string
  kind: 'normal' | 'schedule'
  multiple: boolean
  anonymous: boolean
  closes_at: Date | null
  closed: boolean
  converted_event_id: string | null
  voter_count: number
  target_count: number
  my_votes: { option_id: string; value: string }[]
  has_voted: boolean
  options: PollOption[]
}

/** 回答の対象者（掲示板: 対象クラスの保護者＋子どもアカウント、チャット: ルームのメンバー） */
export async function pollTargets(ownerType: 'post' | 'room', ownerId: string): Promise<string[]> {
  if (ownerType === 'room') {
    return (await sql<{ profile_id: string }[]>`select profile_id from chat_members where room_id = ${ownerId}`).map((r) => r.profile_id)
  }
  const classIds = (await sql<{ class_id: string }[]>`select class_id from post_classes where post_id = ${ownerId}`).map((r) => r.class_id)
  return [...new Set([...(await adultsForClasses(classIds)), ...(await childAccountsForClasses(classIds))])]
}

export async function pollsFor(ownerType: 'post' | 'room', ownerIds: string[], user: CurrentUser): Promise<PollView[]> {
  if (ownerIds.length === 0) return []
  const polls = await sql<{ id: string; owner_type: 'post' | 'room'; owner_id: string; question: string; kind: 'normal' | 'schedule'; multiple: boolean; anonymous: boolean; closes_at: Date | null; closed_at: Date | null; converted_event_id: string | null; voter_count: number }[]>`
    select p.id, p.owner_type, p.owner_id, p.question, p.kind, p.multiple, p.anonymous, p.closes_at, p.closed_at, p.converted_event_id,
      (select count(*)::int from poll_voters v where v.poll_id = p.id) as voter_count
    from polls p where p.owner_type = ${ownerType} and p.owner_id = any(${ownerIds}::uuid[]) order by p.created_at`
  if (polls.length === 0) return []
  const ids = polls.map((p) => p.id)
  const [options, votes, voted] = await Promise.all([
    sql<{ id: string; poll_id: string; label: string; starts_at: Date | null }[]>`
      select id, poll_id, label, starts_at from poll_options where poll_id = any(${ids}::uuid[]) order by sort`,
    sql<{ poll_id: string; option_id: string; value: string; profile_id: string | null; name: string | null }[]>`
      select v.poll_id, v.option_id, v.value, v.profile_id, pr.display_name as name
      from poll_votes v left join profiles pr on pr.id = v.profile_id where v.poll_id = any(${ids}::uuid[])`,
    sql<{ poll_id: string }[]>`select poll_id from poll_voters where poll_id = any(${ids}::uuid[]) and profile_id = ${user.id}`,
  ])
  const votedSet = new Set(voted.map((v) => v.poll_id))
  const out: PollView[] = []
  for (const p of polls) {
    const target = (await pollTargets(p.owner_type, p.owner_id)).length
    const opts = options.filter((o) => o.poll_id === p.id)
    const pv = votes.filter((v) => v.poll_id === p.id)
    out.push({
      id: p.id,
      owner_type: p.owner_type,
      owner_id: p.owner_id,
      question: p.question,
      kind: p.kind,
      multiple: p.multiple,
      anonymous: p.anonymous,
      closes_at: p.closes_at,
      closed: !!p.closed_at || (!!p.closes_at && p.closes_at.getTime() < Date.now()),
      converted_event_id: p.converted_event_id,
      voter_count: p.voter_count,
      target_count: target,
      has_voted: votedSet.has(p.id),
      my_votes: p.anonymous ? [] : pv.filter((v) => v.profile_id === user.id).map((v) => ({ option_id: v.option_id, value: v.value })),
      options: opts.map((o) => {
        const ov = pv.filter((v) => v.option_id === o.id)
        return {
          id: o.id,
          label: o.label,
          starts_at: o.starts_at,
          yes: ov.filter((v) => v.value === 'yes').length,
          maybe: ov.filter((v) => v.value === 'maybe').length,
          no: ov.filter((v) => v.value === 'no').length,
          // 記名投票のみ回答者名を出す（匿名は管理者にも出さない）
          // 子どもアカウントには他の人の名前を見せない
          voters: p.anonymous || user.isChild ? [] : ov.map((v) => ({ name: v.name ?? '退会したメンバー', value: v.value })),
        }
      }),
    })
  }
  return out
}
