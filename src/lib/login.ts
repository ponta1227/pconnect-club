import 'server-only'
import { randomInt } from 'node:crypto'
import { sql } from './db'
import { hashPin, verifyPin } from './crypto'
import { findInvite } from './invites'
import { sendEmail } from './notify'

// LINE 以外のログイン。
// ・メール: 6桁の確認コードを送り、入力してもらう（パスワードは持たない）。新しく参加する人は招待リンクが必要。
// ・子ども: 保護者が決めたログインIDとパスワード。5回まちがえると15分ロック。

export const EMAIL_COOKIE = 'pc_email_login'
const CODE_MINUTES = 15
const MAX_ATTEMPTS = 5
const MAX_CODES_PER_HOUR = 5

export function normalizeEmail(v: string): string | null {
  const e = v.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null
}

export type CodeRequestResult = { ok: true; id: string } | { ok: false; error: string }

export async function requestEmailCode(input: { email: string; inviteToken: string | null; name: string | null }): Promise<CodeRequestResult> {
  const email = normalizeEmail(input.email)
  if (!email) return { ok: false, error: 'メールアドレスの形が正しくありません' }

  const [account] = await sql`select 1 from profiles where lower(email) = ${email} and email_verified and deleted_at is null`
  if (!account) {
    const invite = input.inviteToken ? await findInvite(input.inviteToken) : null
    if (!invite) return { ok: false, error: 'このメールアドレスは登録されていません。はじめての方は、クラブから届いた招待リンクから参加してください。' }
    if (!input.name?.trim()) return { ok: false, error: 'お名前を入力してください' }
  }

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from email_codes where lower(email) = ${email} and created_at > now() - interval '1 hour'`
  if (n >= MAX_CODES_PER_HOUR) return { ok: false, error: '確認コードの送信回数が多すぎます。1時間ほどたってからお試しください。' }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const [row] = await sql<{ id: string }[]>`
    insert into email_codes (email, code_hash, invite_token, display_name, expires_at)
    values (${email}, ${hashPin(code)}, ${input.inviteToken}, ${account ? null : input.name!.trim().slice(0, 40)},
            now() + ${`${CODE_MINUTES} minutes`}::interval)
    returning id`
  await sendEmail(
    email,
    `【P-CONNECT Jr.】確認コード ${code}`,
    `P-CONNECT Jr. の確認コードは ${code} です。\n\nアプリの画面にこの6桁を入力してください。${CODE_MINUTES}分間有効です。\n\n心当たりがない場合は、このメールを無視してください。`,
  )
  return { ok: true, id: row.id }
}

export type CodeCheck =
  | { ok: true; email: string; inviteToken: string | null; name: string | null }
  | { ok: false; error: string; retry: boolean }

export async function checkEmailCode(id: string, code: string): Promise<CodeCheck> {
  const [row] = await sql<{ email: string; code_hash: string; invite_token: string | null; display_name: string | null; expired: boolean; attempts: number; used_at: Date | null }[]>`
    select email, code_hash, invite_token, display_name, expires_at < now() as expired, attempts, used_at from email_codes where id = ${id}`
  if (!row || row.used_at) return { ok: false, error: 'もう一度メールアドレスを入力してください。', retry: false }
  if (row.expired) return { ok: false, error: '確認コードの有効期限が切れました。もう一度送ってください。', retry: false }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: '確認コードを何度もまちがえたため、使えなくなりました。もう一度送ってください。', retry: false }
  if (!verifyPin(code.replace(/\D/g, ''), row.code_hash)) {
    await sql`update email_codes set attempts = attempts + 1 where id = ${id}`
    return { ok: false, error: '確認コードがちがいます。メールの6桁をもう一度確かめてください。', retry: true }
  }
  await sql`update email_codes set used_at = now() where id = ${id}`
  return { ok: true, email: row.email, inviteToken: row.invite_token, name: row.display_name }
}

// ---------------------------------------------------------------- 子どものID・パスワード

export function normalizeLoginId(v: string): string | null {
  const id = v.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]{3,19}$/.test(id) ? id : null
}

export function checkPassword(v: string): string | null {
  if (v.length < 6) return 'パスワードは6文字以上にしてください'
  if (v.length > 64) return 'パスワードが長すぎます'
  return null
}

export const hashPassword = (pw: string) => hashPin(pw)

export type PasswordLoginResult = { ok: true; profileId: string } | { ok: false; error: string }

export async function passwordLogin(loginId: string, password: string): Promise<PasswordLoginResult> {
  const wrong = { ok: false as const, error: 'ログインIDかパスワードがちがいます' }
  const id = normalizeLoginId(loginId)
  if (!id) return wrong
  const [p] = await sql<{ id: string; password_hash: string | null; locked: boolean }[]>`
    select p.id, p.password_hash, coalesce(p.locked_until > now(), false) as locked
    from profiles p join child_accounts ca on ca.profile_id = p.id and ca.status in ('pending', 'active')
    where lower(p.login_id) = ${id} and p.deleted_at is null`
  if (!p) {
    verifyPin(password, 'x:00') // 時間をそろえる
    return wrong
  }
  if (p.locked) return { ok: false, error: '何度もまちがえたため、15分間ログインできません。保護者の方にパスワードを確かめてもらってください。' }
  if (!verifyPin(password, p.password_hash)) {
    // 5回まちがえたら15分ロックして、回数は数え直す
    await sql`
      update profiles set
        locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
        failed_logins = case when failed_logins + 1 >= 5 then 0 else failed_logins + 1 end
      where id = ${p.id}`
    return wrong
  }
  await sql`update profiles set failed_logins = 0, locked_until = null where id = ${p.id}`
  return { ok: true, profileId: p.id }
}

