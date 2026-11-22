'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds } from '@/lib/access'
import { notifyLater } from '@/lib/notify'
import { migrationRoster, namesFromPaymentCsv, surnameMatches } from '@/lib/migration-roster'
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
  // BANDから移行する人は、会費の支払い一覧に苗字が載っている子だけ登録できる
  const [me] = await sql<{ join_route: string | null }[]>`select join_route from profiles where id = ${user.id}`
  if (me?.join_route === 'existing') {
    const roster = await migrationRoster()
    if (roster.length > 0 && !surnameMatches(v.full_name, roster))
      return {
        error:
          'BANDから移行する方の名簿に、このお名前が見つかりませんでした。お手数ですが、クラブ（P-CONNECT Jr. の管理者）にお問い合わせください。苗字と名前の間にスペースを入れると見つかる場合があります。',
      }
  }
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from guardian_children where profile_id = ${user.id}`
  if (count >= 8) return { error: '登録できるお子さんの数を超えています。管理者に連絡してください' }
  // 名簿に同じ名前の子が1人だけいれば、新しく作らずにその子へつなぐ（管理者の承認は必要）
  const norm = (x: string) => x.replace(/[\s　]/g, '')
  const same = await sql<{ id: string }[]>`
    select id from children where status = 'active'
      and regexp_replace(full_name, '[[:space:]　]', '', 'g') = ${norm(v.full_name)}`
  const mine = same.length === 1
    ? (await sql`select 1 from guardian_children where profile_id = ${user.id} and child_id = ${same[0].id}`).length > 0
    : false
  if (mine) return { error: 'このお子さんはすでに登録しています' }
  await sql.begin(async (tx) => {
    const childId =
      same.length === 1
        ? same[0].id
        : (await tx<{ id: string }[]>`
            insert into children (full_name, kana, grade) values (${v.full_name}, ${v.kana}, ${v.grade}) returning id`)[0].id
    await tx`insert into guardian_children (profile_id, child_id, status, via) values (${user.id}, ${childId}, 'pending', 'roster')`
  })
  notifyLater(await adminIds(), 'approval', {
    title: 'お子さんの登録の確認待ち',
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
/** 管理者: BANDから移行する人の名簿（会費の支払い一覧）を入れ替える。CSVファイルか、1行に1人の氏名 */
export async function saveMigrationRoster(fd: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const file = fd.get('csv')
  let names: string[] = []
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) redirect('/admin/invites?roster=toobig')
    names = namesFromPaymentCsv(await file.arrayBuffer())
    if (names.length === 0) redirect('/admin/invites?roster=nocol')
  } else {
    names = String(fd.get('names') ?? '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  names = [...new Set(names.map((n) => n.slice(0, 60)))].slice(0, 2000)
  await sql.begin(async (tx) => {
    await tx`delete from migration_roster`
    if (names.length) await tx`insert into migration_roster (name) select unnest(${names}::text[]) on conflict do nothing`
  })
  redirect(`/admin/invites?roster=${names.length}`)
}

export async function saveEnrollSettings(fd: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const form = Url.safeParse(String(fd.get('form_url') ?? '').trim())
  const pay = Url.safeParse(String(fd.get('payment_url') ?? '').trim())
  if (!form.success || !pay.success) redirect('/admin/invites?error=url')
  await sql`update app_settings set form_url = ${form.data}, payment_url = ${pay.data}, updated_at = now() where id = 1`
  redirect('/admin/invites?saved=1')
}
