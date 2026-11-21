'use server'

import { refresh } from 'next/cache'
import { assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds, myChildIds } from '@/lib/access'
import { createInvite } from '@/lib/invites'
import { notifyLater } from '@/lib/notify'
import { checkPassword, hashPassword, normalizeLoginId } from '@/lib/login'

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

export async function revokeChildAccount(childId: string) {
  const user = await requireUser()
  assertAdult(user)
  if (!user.isAdmin && !(await myChildIds(user)).includes(childId)) throw new Error('権限がありません')
  const rows = await sql<{ profile_id: string }[]>`
    update child_accounts set status = 'revoked' where child_id = ${childId} and status in ('pending', 'active')
    returning profile_id`
  for (const r of rows) {
    // ログインIDはほかの子が使えるように空ける
    await sql`update profiles set login_id = null, password_hash = null where id = ${r.profile_id}`
    await sql`delete from sessions where profile_id = ${r.profile_id}`
    await sql`delete from chat_members where profile_id = ${r.profile_id}`
  }
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

export type ChildLoginResult = { ok: true } | { ok: false; error: string }

/** 保護者が、子ども用アカウント（ログインIDとパスワード）を作る。管理者が承認すると使える */
export async function createChildLogin(childId: string, loginId: string, password: string, consent: boolean): Promise<ChildLoginResult> {
  const user = await requireUser()
  assertAdult(user)
  if (!consent) return { ok: false, error: '保護者の同意にチェックしてください' }
  if (!(await myChildIds(user)).includes(childId)) return { ok: false, error: 'この子どもの保護者ではありません' }
  const id = normalizeLoginId(loginId)
  if (!id) return { ok: false, error: 'ログインIDは、半角の英字・数字で4〜20文字にしてください（記号は - と _ だけ）' }
  const pwError = checkPassword(password)
  if (pwError) return { ok: false, error: pwError }
  const [child] = await sql<{ full_name: string }[]>`select full_name from children where id = ${childId} and status = 'active'`
  if (!child) return { ok: false, error: '名簿に見つかりません' }
  const [existing] = await sql`select 1 from child_accounts where child_id = ${childId} and status in ('pending', 'active')`
  if (existing) return { ok: false, error: 'この子の子どもアカウントはすでにあります' }
  const [taken] = await sql`select 1 from profiles where lower(login_id) = ${id}`
  if (taken) return { ok: false, error: 'このログインIDはほかの人が使っています。別のIDにしてください' }

  await sql.begin(async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      insert into profiles (display_name, account_kind, login_id, password_hash)
      values (${child.full_name}, 'child', ${id}, ${hashPassword(password)})
      returning id`
    await tx`insert into child_accounts (profile_id, child_id, issued_by, status) values (${p.id}, ${childId}, ${user.id}, 'pending')`
  })
  notifyLater(await adminIds(), 'approval', {
    title: '子どもアカウントの承認待ち',
    body: `${child.full_name}さんの子どもアカウントが承認を待っています`,
    url: '/admin/approvals',
  })
  refresh()
  return { ok: true }
}

/** 保護者が、子ども用アカウントのパスワードを新しくする（ログイン中の端末はログアウトされる） */
export async function resetChildPassword(childId: string, password: string): Promise<ChildLoginResult> {
  const user = await requireUser()
  assertAdult(user)
  if (!user.isAdmin && !(await myChildIds(user)).includes(childId)) return { ok: false, error: '権限がありません' }
  const pwError = checkPassword(password)
  if (pwError) return { ok: false, error: pwError }
  const [acc] = await sql<{ profile_id: string }[]>`
    select ca.profile_id from child_accounts ca join profiles p on p.id = ca.profile_id
    where ca.child_id = ${childId} and ca.status in ('pending', 'active') and p.login_id is not null`
  if (!acc) return { ok: false, error: 'この子はIDとパスワードの子どもアカウントを持っていません' }
  await sql`update profiles set password_hash = ${hashPassword(password)}, failed_logins = 0, locked_until = null where id = ${acc.profile_id}`
  await sql`delete from sessions where profile_id = ${acc.profile_id}`
  refresh()
  return { ok: true }
}
