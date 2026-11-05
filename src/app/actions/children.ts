'use server'

import { refresh } from 'next/cache'
import { assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds, myChildIds } from '@/lib/access'
import { createInvite } from '@/lib/invites'
import { notifyLater } from '@/lib/notify'

/** 名簿の子どもに紐づけを申請（管理者が承認） */
export async function requestChildLink(childId: string) {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  const [child] = await sql<{ full_name: string }[]>`select full_name from children where id = ${childId} and status = 'active'`
  if (!child) throw new Error('名簿に見つかりません')
  // 管理者自身の申請は即承認
  const status = user.isAdmin ? 'approved' : 'pending'
  await sql`
    insert into guardian_children (profile_id, child_id, status, via, approved_by, approved_at)
    values (${user.id}, ${childId}, ${status}, 'roster', ${user.isAdmin ? user.id : null}, ${user.isAdmin ? new Date() : null})
    on conflict (profile_id, child_id) do nothing`
  if (!user.isAdmin) {
    notifyLater(await adminIds(), 'approval', {
      title: '子どもの紐づけ申請',
      body: `${user.displayName}さんが「${child.full_name}」さんの保護者として申請しました`,
      url: '/admin/approvals',
    })
  }
  refresh()
}

export async function cancelChildLink(childId: string) {
  const user = await requireUser({ allowOnboarding: true })
  await sql`delete from guardian_children where profile_id = ${user.id} and child_id = ${childId} and status = 'pending'`
  refresh()
}

/** 家族招待リンク（1回限り）。招待された人は選んだ子に自動で紐づく */
export async function createFamilyInvite(childIds: string[]) {
  const user = await requireUser()
  assertAdult(user)
  const mine = await myChildIds(user)
  const ids = childIds.filter((id) => mine.includes(id))
  if (ids.length === 0) throw new Error('子どもを選んでください')
  const { url } = await createInvite('family', user.id, ids)
  return { url }
}

/** 子どもアカウント招待リンク（1回限り、保護者の同意が必要、管理者の承認後に有効） */
export async function createChildAccountInvite(childId: string, consent: boolean) {
  const user = await requireUser()
  assertAdult(user)
  if (!consent) throw new Error('同意のチェックが必要です')
  if (!(await myChildIds(user)).includes(childId)) throw new Error('この子どもの保護者ではありません')
  const [existing] = await sql`select 1 from child_accounts where child_id = ${childId} and status in ('pending', 'active')`
  if (existing) throw new Error('この子どもにはすでに子どもアカウントがあります')
  // 未使用の古い招待は失効させる
  await sql`update invites set revoked_at = now() where kind = 'child' and ${childId} = any(child_ids) and used_at is null and revoked_at is null`
  const { url } = await createInvite('child', user.id, [childId], true)
  return { url }
}

/** 保護者が子どもアカウントを無効化 */
export async function revokeChildAccount(childId: string) {
  const user = await requireUser()
  assertAdult(user)
  if (!user.isAdmin && !(await myChildIds(user)).includes(childId)) throw new Error('権限がありません')
  const rows = await sql<{ profile_id: string }[]>`
    update child_accounts set status = 'revoked' where child_id = ${childId} and status in ('pending', 'active')
    returning profile_id`
  for (const r of rows) await sql`delete from sessions where profile_id = ${r.profile_id}`
  refresh()
}

/** 保護者が、家族招待で紐づいた他の家族を外す */
export async function removeFamilyMember(childId: string, profileId: string) {
  const user = await requireUser()
  assertAdult(user)
  if (!(await myChildIds(user)).includes(childId)) throw new Error('権限がありません')
  if (profileId === user.id) throw new Error('自分自身は外せません')
  await sql`delete from guardian_children where child_id = ${childId} and profile_id = ${profileId} and via = 'family_invite'`
  refresh()
}
