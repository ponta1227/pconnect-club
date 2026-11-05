'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { destroySession, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { randomToken, sha256 } from '@/lib/crypto'
import { env } from '@/lib/env'
import { sendEmail } from '@/lib/notify'
import { FORCED_KINDS, NOTIFY_KINDS, type NotifyKind } from '@/lib/notify-kinds'

export async function agreeTerms(formData: FormData) {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  if (formData.get('agree') !== 'on') redirect('/onboarding?error=agree')
  const name = String(formData.get('displayName') ?? '').trim().slice(0, 40)
  if (!user.isChild && !name) redirect('/onboarding?error=name')
  if (user.isChild) await sql`update profiles set terms_agreed_at = now() where id = ${user.id}`
  else await sql`update profiles set terms_agreed_at = now(), display_name = ${name} where id = ${user.id}`
  if (user.isChild) {
    await sql`update profiles set onboarded_at = now() where id = ${user.id}`
    redirect('/')
  }
  redirect('/onboarding?step=children')
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
      update profiles set deleted_at = now(), display_name = '退会したメンバー', line_user_id = null,
        email = null, email_verified = false, avatar_url = null, role = 'member'
      where id = ${user.id}`
    await tx`delete from guardian_children where profile_id = ${user.id}`
    await tx`update child_accounts set status = 'revoked' where profile_id = ${user.id}`
    await tx`delete from push_subscriptions where profile_id = ${user.id}`
    await tx`delete from notification_settings where profile_id = ${user.id}`
    await tx`delete from chat_members where profile_id = ${user.id}`
    await tx`delete from notification_queue where profile_id = ${user.id}`
  })
  await destroySession()
  redirect('/login')
}
