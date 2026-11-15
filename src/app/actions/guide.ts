'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { assertAdmin, assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { nextEnrollStep } from '@/lib/enroll'

/** ご案内を「確認しました」。入会の手順中なら次の手順へ */
export async function confirmGuide(fromOnboarding: boolean) {
  const user = await requireUser({ allowOnboarding: true, allowPending: true })
  assertAdult(user)
  await sql`update profiles set guide_read_version = (select guide_version from app_settings where id = 1) where id = ${user.id}`
  if (fromOnboarding) redirect(`/onboarding?step=${await nextEnrollStep(user.id, 'guide')}`)
  refresh()
}

/** 管理者: ご案内の文章を保存。reconfirm のときは全員にもう一度確認してもらう */
export async function saveGuide(fd: FormData) {
  const user = await requireUser()
  assertAdmin(user)
  const text = String(fd.get('guide_text') ?? '').replace(/\r\n/g, '\n').trim().slice(0, 20000)
  const reconfirm = fd.get('reconfirm') === 'on'
  await sql`update app_settings set guide_text = ${text},
    guide_version = guide_version + ${reconfirm ? 1 : 0}::int, updated_at = now() where id = 1`
  // 保存した本人は確認済みにする
  await sql`update profiles set guide_read_version = (select guide_version from app_settings where id = 1) where id = ${user.id}`
  redirect('/admin/rules?saved=1')
}
