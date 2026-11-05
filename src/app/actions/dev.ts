'use server'

// 開発・テスト用ログイン。NODE_ENV=production では常に無効（env.devLoginEnabled）。
import { redirect } from 'next/navigation'
import { createSession } from '@/lib/auth'
import { randomToken } from '@/lib/crypto'
import { sql } from '@/lib/db'
import { env } from '@/lib/env'
import { resolveLogin } from '@/lib/invites'

function guard() {
  if (!env.devLoginEnabled()) throw new Error('開発用ログインは無効です')
}

export async function devLoginAs(formData: FormData) {
  guard()
  const id = String(formData.get('profileId'))
  await createSession(id)
  redirect('/')
}

export async function devCreateUser(formData: FormData) {
  guard()
  const name = String(formData.get('name') || 'テスト')
  const role = formData.get('role') === 'admin' ? 'admin' : 'member'
  const agreed = formData.get('agreed') === 'on'
  const [p] = await sql<{ id: string }[]>`
    insert into profiles (line_user_id, display_name, role, terms_agreed_at, onboarded_at)
    values (${'dev-' + randomToken(8)}, ${name}, ${role}, ${agreed ? new Date() : null}, ${agreed ? new Date() : null})
    returning id`
  await createSession(p.id)
  redirect('/')
}

export async function devJoin(formData: FormData) {
  guard()
  const result = await resolveLogin(
    { lineUserId: 'dev-' + randomToken(8), name: String(formData.get('name') || 'テスト'), picture: null, email: null },
    { inviteToken: String(formData.get('token')) },
  )
  if (!result.ok) redirect(`/login?error=${result.error}`)
  await createSession(result.profileId)
  redirect('/')
}

export async function devSetup(formData: FormData) {
  guard()
  const result = await resolveLogin(
    { lineUserId: 'dev-' + randomToken(8), name: String(formData.get('name') || '管理者'), picture: null, email: null },
    { setupSecret: env.setupSecret() },
  )
  if (!result.ok) redirect(`/login?error=${result.error}`)
  await createSession(result.profileId)
  redirect('/')
}
