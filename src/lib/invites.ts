import 'server-only'
import { sql } from './db'
import { randomToken, sha256 } from './crypto'
import { env } from './env'
import { adminIds } from './access'
import { notifyLater } from './notify'

export type InviteKind = 'club' | 'family' | 'child'
export type InviteRow = {
  id: string
  kind: InviteKind
  child_ids: string[]
  created_by: string | null
  used_at: Date | null
  revoked_at: Date | null
}

export async function createInvite(kind: InviteKind, createdBy: string, childIds: string[] = [], consent = false) {
  const token = randomToken(24)
  await sql`
    insert into invites (kind, token_hash, child_ids, created_by, consent_at)
    values (${kind}, ${sha256(token)}, ${childIds}::uuid[], ${createdBy}, ${consent ? new Date() : null})`
  const path = kind === 'club' ? `/join/${token}` : `/join/${token}`
  return { token, url: `${env.appUrl()}${path}` }
}

/** 有効な招待を探す（クラブ招待は再利用可、家族・子ども招待は1回限り） */
export async function findInvite(token: string): Promise<InviteRow | null> {
  const [row] = await sql<InviteRow[]>`
    select id, kind, child_ids, created_by, used_at, revoked_at from invites where token_hash = ${sha256(token)}`
  if (!row || row.revoked_at) return null
  if (row.kind !== 'club' && row.used_at) return null
  return row
}

export type LoginIdentity = { lineUserId: string; name: string; picture: string | null; email: string | null }
export type LoginResult = { ok: true; profileId: string } | { ok: false; error: 'invite' | 'setup' | 'used' }

/**
 * ログイン処理の本体。LINE コールバックと開発用ログインの両方から呼ぶ。
 * - 既存メンバー: そのままログイン（家族招待なら子どもを追加で紐づけ）
 * - 新規: 有効な招待が必要。最初の1人だけは SETUP_SECRET で初期管理者になれる
 */
export async function resolveLogin(
  identity: LoginIdentity,
  opts: { inviteToken?: string | null; setupSecret?: string | null },
): Promise<LoginResult> {
  const invite = opts.inviteToken ? await findInvite(opts.inviteToken) : null

  const [existing] = await sql<{ id: string; account_kind: string }[]>`
    select id, account_kind from profiles where line_user_id = ${identity.lineUserId} and deleted_at is null`

  if (existing) {
    if (invite?.kind === 'family' && existing.account_kind === 'adult') {
      await applyFamilyInvite(invite, existing.id)
    }
    if (identity.picture) await sql`update profiles set avatar_url = ${identity.picture} where id = ${existing.id}`
    return { ok: true, profileId: existing.id }
  }

  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from profiles`
  if (count === 0) {
    if (!env.setupSecret() || opts.setupSecret !== env.setupSecret()) return { ok: false, error: 'setup' }
    const [p] = await sql<{ id: string }[]>`
      insert into profiles (line_user_id, display_name, avatar_url, email, email_verified, role)
      values (${identity.lineUserId}, ${identity.name}, ${identity.picture}, ${identity.email}, ${!!identity.email}, 'admin')
      returning id`
    return { ok: true, profileId: p.id }
  }

  if (!invite) return { ok: false, error: opts.inviteToken ? 'used' : 'invite' }

  if (invite.kind === 'child') {
    const childId = invite.child_ids[0]
    const [child] = await sql<{ full_name: string }[]>`select full_name from children where id = ${childId} and status = 'active'`
    if (!child) return { ok: false, error: 'used' }
    const profileId = await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`
        insert into profiles (line_user_id, display_name, avatar_url, account_kind)
        values (${identity.lineUserId}, ${child.full_name}, ${identity.picture}, 'child')
        returning id`
      await tx`
        insert into child_accounts (profile_id, child_id, issued_by, status)
        values (${p.id}, ${childId}, ${invite.created_by}, 'pending')`
      await tx`update invites set used_at = now(), used_by = ${p.id} where id = ${invite.id}`
      return p.id
    })
    notifyLater(await adminIds(), 'approval', {
      title: '子どもアカウントの承認待ち',
      body: `${child.full_name}さんの子どもアカウントが承認を待っています`,
      url: '/admin/approvals',
    })
    return { ok: true, profileId }
  }

  const [p] = await sql<{ id: string }[]>`
    insert into profiles (line_user_id, display_name, avatar_url, email, email_verified)
    values (${identity.lineUserId}, ${identity.name}, ${identity.picture}, ${identity.email}, ${!!identity.email})
    returning id`
  if (invite.kind === 'family') await applyFamilyInvite(invite, p.id)
  return { ok: true, profileId: p.id }
}

async function applyFamilyInvite(invite: InviteRow, profileId: string) {
  await sql.begin(async (tx) => {
    for (const childId of invite.child_ids) {
      await tx`
        insert into guardian_children (profile_id, child_id, status, via, approved_by, approved_at)
        values (${profileId}, ${childId}, 'approved', 'family_invite', ${invite.created_by}, now())
        on conflict (profile_id, child_id) do update set status = 'approved', approved_at = now()`
    }
    await tx`update invites set used_at = now(), used_by = ${profileId} where id = ${invite.id}`
  })
}
