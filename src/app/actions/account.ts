'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { assertAdult, createSession, destroySession, requireUser, SESSION_COOKIE, VIEW_COOKIE, ForbiddenError } from '@/lib/auth'
import { consumeLoginLink, issueLoginLink } from '@/lib/login-link'
import { sql } from '@/lib/db'
import { randomToken, sha256 } from '@/lib/crypto'
import { env } from '@/lib/env'
import { sendEmail } from '@/lib/notify'
import { syncStaffRooms } from '@/lib/staff-chat'
import { nextEnrollStep } from '@/lib/enroll'
import { FORCED_KINDS, NOTIFY_KINDS, type NotifyKind } from '@/lib/notify-kinds'

/** 最初の設定（表示名）。規約への同意はGoogleフォームで取るので、ここでは確認しない */
export async function agreeTerms(formData: FormData) {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  const name = String(formData.get('displayName') ?? '').trim().slice(0, 40)
  if (!user.isChild && !name) redirect('/onboarding?error=name')
  if (user.isChild) await sql`update profiles set terms_agreed_at = now() where id = ${user.id}`
  else await sql`update profiles set terms_agreed_at = now(), display_name = ${name} where id = ${user.id}`
  if (user.isChild) {
    await sql`update profiles set onboarded_at = now() where id = ${user.id}`
    redirect('/')
  }
  redirect(`/onboarding?step=${await nextEnrollStep(user.id, null)}`)
}

export async function finishOnboarding() {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  await sql`update profiles set onboarded_at = coalesce(onboarded_at, now()) where id = ${user.id}`
  redirect('/')
}

export async function updateDisplayName(formData: FormData) {
  const user = await requireUser()
  if (user.isChild) throw new Error('子どもアカウントの表示名は変更できません')
  const name = String(formData.get('displayName') ?? '').trim().slice(0, 40)
  if (!name) throw new Error('表示名を入力してください')
  await sql`update profiles set display_name = ${name} where id = ${user.id}`
  refresh()
}

export async function setFontSize(size: 'normal' | 'large') {
  const user = await requireUser()
  await sql`update profiles set font_size = ${size === 'large' ? 'large' : 'normal'} where id = ${user.id}`
  refresh()
}

export async function updateNotificationSetting(kind: string, channel: 'push' | 'email', value: boolean) {
  const user = await requireUser()
  if (user.isChild) throw new Error('子どもアカウントの通知設定は変更できません')
  if (!(kind in NOTIFY_KINDS) || FORCED_KINDS.includes(kind as NotifyKind)) throw new Error('この通知は変更できません')
  const def = NOTIFY_KINDS[kind as NotifyKind]
  await sql`
    insert into notification_settings (profile_id, kind, push, email)
    values (${user.id}, ${kind}, ${channel === 'push' ? value : def.push}, ${channel === 'email' ? value : def.email})
    on conflict (profile_id, kind) do update set ${sql(channel === 'push' ? { push: value } : { email: value })}`
  refresh()
}

/** メールアドレスの登録（確認メールのリンクで有効化） */
export async function requestEmailVerification(formData: FormData) {
  const user = await requireUser()
  if (user.isChild) throw new Error('子どもアカウントではメール通知を使えません')
  const email = z.string().trim().email().max(200).safeParse(formData.get('email'))
  if (!email.success) redirect('/settings?email=invalid')
  const token = randomToken()
  await sql`delete from email_verifications where profile_id = ${user.id}`
  await sql`
    insert into email_verifications (token_hash, profile_id, email, expires_at)
    values (${sha256(token)}, ${user.id}, ${email.data}, ${new Date(Date.now() + 24 * 3600 * 1000)})`
  await sendEmail(
    email.data,
    '【P-CONNECT Jr.】メールアドレスの確認',
    `${user.displayName} さん\n\n次のリンクを開くと、P-CONNECT Jr. からのメール通知が届くようになります（24時間有効）。\n\n${env.appUrl()}/api/email/verify?token=${token}\n\n心当たりがない場合はこのメールを破棄してください。`,
  )
  redirect('/settings?email=sent')
}

export async function removeEmail() {
  const user = await requireUser()
  await sql`update profiles set email = null, email_verified = false where id = ${user.id}`
  refresh()
}

/** 退会：個人データを削除し、過去の投稿は「退会したメンバー」と表示する */
export async function leaveClub(formData: FormData) {
  const user = await requireUser()
  if (formData.get('confirm') !== '退会') redirect('/settings?leave=confirm')
  if (user.isAdmin) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from profiles where role = 'admin' and account_kind = 'adult' and deleted_at is null`
    if (count <= 1) redirect('/settings?leave=last-admin')
  }
  await sql.begin(async (tx) => {
    await tx`
      update profiles set deleted_at = now(), display_name = '退会したメンバー', line_user_id = null, login_id = null, password_hash = null,
        email = null, email_verified = false, avatar_url = null, role = 'member'
      where id = ${user.id}`
    await tx`delete from guardian_children where profile_id = ${user.id}`
    await tx`update child_accounts set status = 'revoked' where profile_id = ${user.id}`
    await tx`delete from push_subscriptions where profile_id = ${user.id}`
    await tx`delete from notification_settings where profile_id = ${user.id}`
    await tx`delete from chat_members where profile_id = ${user.id}`
    await tx`delete from notification_queue where profile_id = ${user.id}`
  })
  await syncStaffRooms()
  await destroySession()
  redirect('/login')
}

/** 管理者が「保護者の表示」に切り替える／管理者の表示に戻す */
export async function setMemberPreview(on: boolean) {
  const user = await requireUser()
  if (!user.canAdmin) throw new ForbiddenError()
  const store = await cookies()
  if (on) store.set(VIEW_COOKIE, 'member', { httpOnly: true, secure: env.isProd(), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 })
  else store.delete(VIEW_COOKIE)
  redirect(on ? '/' : '/admin')
}

// ------------------------------------------------------------ ほかの端末でも同じアカウントを使う

/**
 * ログイン用リンクを作る（1回だけ・30分だけ使える）。子どもアカウントは不可。
 * 管理者は「使う人の名前」を付ける（その端末で書いたものに、管理者だけが見える目印として残る）
 */
export async function createLoginLink(name = ''): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  assertAdult(user)
  const label = user.isAdmin ? name.trim().slice(0, 20) : ''
  if (user.isAdmin && !label) return { error: '使う人の名前を入れてください（例：田中コーチ）' }
  return { url: await issueLoginLink(user.id, label || null) }
}

/** ログイン用リンクを開いた端末でログインする */
export async function loginWithLink(token: string) {
  const link = await consumeLoginLink(token)
  if (!link) redirect(`/login/link/${encodeURIComponent(token)}?error=1`)
  await destroySession()
  await createSession(link.profileId, true, link.label)
  redirect('/')
}

/** 管理者: この端末を使う人の名前を変える（空にすると本人） */
export async function setDeviceLabel(formData: FormData) {
  const user = await requireUser()
  if (!user.canAdmin) throw new ForbiddenError()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const label = String(formData.get('label') ?? '').trim().slice(0, 20)
  if (token) await sql`update sessions set label = ${label || null} where token_hash = ${sha256(token)} and profile_id = ${user.id}`
  redirect('/settings?devices=named')
}

/** この端末以外をすべてログアウトする */
export async function logoutOtherDevices() {
  const user = await requireUser()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return
  await sql`delete from sessions where profile_id = ${user.id} and token_hash <> ${sha256(token)}`
  redirect('/settings?devices=out')
}
