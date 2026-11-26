import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { sql } from './db'
import { randomToken, sha256 } from './crypto'
import { env } from './env'

export const SESSION_COOKIE = 'pc_session'
/** 管理者が「保護者の表示」で見ているときに付く Cookie */
export const VIEW_COOKIE = 'pc_view'
const SESSION_DAYS = 30

export type CurrentUser = {
  id: string
  displayName: string
  avatarUrl: string | null
  role: 'admin' | 'member'
  accountKind: 'adult' | 'child'
  email: string | null
  emailVerified: boolean
  termsAgreedAt: Date | null
  onboardedAt: Date | null
  fontSize: 'normal' | 'large'
  /** 子どもアカウントのとき、本人の子どもID と状態 */
  childAccount: { childId: string; status: 'pending' | 'active' | 'revoked'; childName: string } | null
  isAdmin: boolean
  isChild: boolean
  /** 本当は管理者（保護者の表示で見ている間も true） */
  canAdmin: boolean
  /** 管理者が「保護者の表示」で見ている。このときは isAdmin=false で、権限も一般の保護者と同じ */
  previewingMember: boolean
}

type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  role: 'admin' | 'member'
  account_kind: 'adult' | 'child'
  email: string | null
  email_verified: boolean
  terms_agreed_at: Date | null
  onboarded_at: Date | null
  font_size: 'normal' | 'large'
  ca_child_id: string | null
  ca_status: 'pending' | 'active' | 'revoked' | null
  ca_child_name: string | null
}

export async function loadUser(profileId: string): Promise<CurrentUser | null> {
  const [row] = await sql<ProfileRow[]>`
    select p.id, p.display_name, p.avatar_url, p.role, p.account_kind, p.email, p.email_verified,
           p.terms_agreed_at, p.onboarded_at, p.font_size,
           ca.child_id as ca_child_id, ca.status as ca_status, c.full_name as ca_child_name
    from profiles p
    left join child_accounts ca on ca.profile_id = p.id
    left join children c on c.id = ca.child_id
    where p.id = ${profileId} and p.deleted_at is null`
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    accountKind: row.account_kind,
    email: row.email,
    emailVerified: row.email_verified,
    termsAgreedAt: row.terms_agreed_at,
    onboardedAt: row.onboarded_at,
    fontSize: row.font_size,
    childAccount:
      row.account_kind === 'child' && row.ca_child_id
        ? { childId: row.ca_child_id, status: row.ca_status ?? 'pending', childName: row.ca_child_name ?? '' }
        : null,
    isAdmin: row.role === 'admin' && row.account_kind === 'adult',
    isChild: row.account_kind === 'child',
    canAdmin: row.role === 'admin' && row.account_kind === 'adult',
    previewingMember: false,
  }
}

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, secure: env.isProd(), sameSite: 'lax' as const, path: '/', expires }
}

/** セッションを作成する。setCookie=false のときは呼び出し側でレスポンスに Cookie を付ける */
export async function createSession(profileId: string, setCookie = true, label: string | null = null) {
  const token = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000)
  await sql`insert into sessions (token_hash, profile_id, expires_at, label) values (${sha256(token)}, ${profileId}, ${expires}, ${label})`
  await sql`delete from sessions where expires_at < now()`
  if (setCookie) (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires))
  return { token, expires }
}

/**
 * この端末を使っている人の名前（管理者のアカウントをコーチと共用するときの目印）。
 * 管理者のアカウントのときだけ返す。書き込み時に控え、管理者にだけ見せる。
 */
export const staffLabel = cache(async (): Promise<string | null> => {
  const user = await getCurrentUser()
  if (!user?.canAdmin) return null
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const [row] = await sql<{ label: string | null }[]>`select label from sessions where token_hash = ${sha256(token)}`
  return row?.label || null
})

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`
  store.delete(SESSION_COOKIE)
}

export async function profileIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null
  const [row] = await sql<{ profile_id: string }[]>`
    select profile_id from sessions where token_hash = ${sha256(token)} and expires_at > now()`
  return row?.profile_id ?? null
}

/** 現在のユーザー（リクエスト内でキャッシュ） */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const profileId = await profileIdFromToken(store.get(SESSION_COOKIE)?.value)
  if (!profileId) return null
  const user = await loadUser(profileId)
  if (user?.canAdmin && store.get(VIEW_COOKIE)?.value === 'member') {
    // 保護者の表示: 画面も操作も一般の保護者と同じ扱いにする
    return { ...user, role: 'member', isAdmin: false, previewingMember: true }
  }
  return user
})

type RequireOptions = { allowOnboarding?: boolean; allowPending?: boolean }

/** ログイン必須。未ログイン・未同意・承認待ちならそれぞれの画面へ移動 */
export async function requireUser(opts: RequireOptions = {}): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.isChild && !opts.allowPending) {
    if (!user.childAccount || user.childAccount.status !== 'active') redirect('/pending')
  }
  if (!opts.allowOnboarding && (!user.termsAgreedAt || !user.onboardedAt)) redirect('/onboarding')
  return user
}

/** 保護者・家族・管理者のみ（子どもアカウントは不可） */
export async function requireAdult(opts: RequireOptions = {}): Promise<CurrentUser> {
  const user = await requireUser(opts)
  if (user.isChild) redirect('/')
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.isAdmin) redirect('/')
  return user
}

/** Server Action 用: 権限がなければ例外 */
export class ForbiddenError extends Error {
  constructor(message = 'この操作を行う権限がありません') {
    super(message)
  }
}

export function assertAdmin(user: CurrentUser) {
  if (!user.isAdmin) throw new ForbiddenError()
}

export function assertAdult(user: CurrentUser) {
  if (user.isChild) throw new ForbiddenError()
}
