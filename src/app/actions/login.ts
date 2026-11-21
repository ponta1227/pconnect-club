'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSession } from '@/lib/auth'
import { env } from '@/lib/env'
import { resolveLogin } from '@/lib/invites'
import { checkEmailCode, EMAIL_COOKIE, passwordLogin, requestEmailCode } from '@/lib/login'

/** 送信後に入力欄が空にならないよう、入れた値も返す */
export type LoginFormState = { error?: string; email?: string; name?: string; loginId?: string } | null

const LOGIN_ERRORS: Record<string, string> = {
  invite: 'はじめての方は、クラブから届いた招待リンクから参加してください。',
  used: 'この招待リンクは使用済みか、無効になっています。管理者に新しいリンクをもらってください。',
  setup: '初期設定のリンクが正しくありません。',
}

/** メール: 確認コードを送る */
export async function sendLoginCode(_prev: LoginFormState, fd: FormData): Promise<LoginFormState> {
  if (!env.emailLoginEnabled()) return { error: 'メールでのログインは、いまは使えません。' }
  const invite = String(fd.get('invite') ?? '') || null
  const result = await requestEmailCode({
    email: String(fd.get('email') ?? ''),
    inviteToken: invite,
    name: fd.get('name') == null ? null : String(fd.get('name')),
  })
  if (!result.ok) return { error: result.error, email: String(fd.get('email') ?? ''), name: String(fd.get('name') ?? '') }
  ;(await cookies()).set(EMAIL_COOKIE, result.id, { httpOnly: true, secure: env.isProd(), sameSite: 'lax', path: '/', maxAge: 20 * 60 })
  redirect(`/login/email?step=code${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`)
}

/** メール: 確認コードを入れてログイン */
export async function verifyLoginCode(_prev: LoginFormState, fd: FormData): Promise<LoginFormState> {
  const store = await cookies()
  const id = store.get(EMAIL_COOKIE)?.value
  if (!id) return { error: '時間がたったため、もう一度メールアドレスを入力してください。' }
  const check = await checkEmailCode(id, String(fd.get('code') ?? ''))
  if (!check.ok) {
    if (!check.retry) store.delete(EMAIL_COOKIE)
    return { error: check.error }
  }
  const result = await resolveLogin(
    { lineUserId: null, name: check.name ?? 'メンバー', picture: null, email: check.email, emailVerified: true },
    { inviteToken: check.inviteToken },
  )
  store.delete(EMAIL_COOKIE)
  if (!result.ok) return { error: LOGIN_ERRORS[result.error] ?? 'ログインできませんでした' }
  await createSession(result.profileId)
  redirect('/')
}

/** 子ども: ログインIDとパスワード */
export async function loginWithPassword(_prev: LoginFormState, fd: FormData): Promise<LoginFormState> {
  const loginId = String(fd.get('login_id') ?? '')
  const result = await passwordLogin(loginId, String(fd.get('password') ?? ''))
  if (!result.ok) return { error: result.error, loginId }
  await createSession(result.profileId)
  redirect('/')
}
