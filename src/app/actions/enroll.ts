'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds } from '@/lib/access'
import { notifyLater } from '@/lib/notify'
import { nextEnrollStep } from '@/lib/enroll'

// 入会の流れ（招待リンクから参加した保護者）
//   BANDから移行: Googleフォーム → お子さん（名簿から選ぶ・参加曜日・いまの振替） → 通知
//   新規入会:     Googleフォーム → 決済 → お子さん（名前を入力・参加曜日） → 通知

/** Googleフォームを送信した（アプリからは確認できないため自己申告） */
export async function markFormSubmitted() {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  await sql`update profiles set form_submitted_at = coalesce(form_submitted_at, now()) where id = ${user.id}`
  redirect(`/onboarding?step=${await nextEnrollStep(user.id, 'form')}`)
}

/** 決済ページで支払いを済ませた（自己申告。管理者があとで入金を確認する） */
export async function markPaymentReported() {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  await sql`update profiles set payment_reported_at = coalesce(payment_reported_at, now()) where id = ${user.id}`
  notifyLater(await adminIds(), 'approval', {
    title: '新規入会: 支払いの確認をお願いします',
    body: `${user.displayName}さんが決済を済ませたと申告しました`,
    url: '/admin/approvals',
  })
  redirect(`/onboarding?step=${await nextEnrollStep(user.id, 'payment')}`)
}

const NewChild = z.object({
  full_name: z.string().trim().min(1, 'お子さんの名前を入力してください').max(40),
  kana: z.string().trim().min(1, 'よみがなを入力してください').max(40),
  grade: z.coerce.number().int().min(0).max(12),
})

/** 新規入会: 名簿にまだいないお子さんを登録する（管理者の承認待ちになる） */
export async function registerNewChild(fd: FormData): Promise<{ error?: string }> {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  const parsed = NewChild.safeParse({ full_name: fd.get('full_name'), kana: fd.get('kana'), grade: fd.get('grade') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }
  const v = parsed.data
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from guardian_children where profile_id = ${user.id}`
  if (count >= 8) return { error: '登録できるお子さんの数を超えています。管理者に連絡してください' }
  await sql.begin(async (tx) => {
    const [c] = await tx<{ id: string }[]>`
      insert into children (full_name, kana, grade) values (${v.full_name}, ${v.kana}, ${v.grade}) returning id`
    await tx`insert into guardian_children (profile_id, child_id, status, via) values (${user.id}, ${c.id}, 'pending', 'roster')`
  })
  notifyLater(await adminIds(), 'approval', {
    title: '新規入会のお子さんの承認待ち',
    body: `${user.displayName}さんが ${v.full_name}さんを登録しました`,
    url: '/admin/approvals',
  })
  refresh()
  return {}
}

/** 管理者: 新規入会の支払いを確認した */
export async function confirmPayment(profileId: string) {
  const user = await requireUser()
  assertAdmin(user)
  await sql`update profiles set payment_confirmed_at = now() where id = ${z.string().uuid().parse(profileId)}`
  refresh()
}

const Url = z.union([z.literal(''), z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'https:// で始まるURLを入力してください')])

/** 管理者: 入会の流れで開くGoogleフォームと決済ページのURL */
export async function saveEnrollSettings(fd: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const form = Url.safeParse(String(fd.get('form_url') ?? '').trim())
  const pay = Url.safeParse(String(fd.get('payment_url') ?? '').trim())
  if (!form.success || !pay.success) redirect('/admin/invites?error=url')
  await sql`update app_settings set form_url = ${form.data}, payment_url = ${pay.data}, updated_at = now() where id = 1`
  redirect('/admin/invites?saved=1')
}
