'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { assertAdmin, assertAdult, requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminIds, canActForChild, eventTargetChildIds } from '@/lib/access'
import { notifyLater } from '@/lib/notify'
import { isRegularDay, loadPractice, planOf, practiceEnded } from '@/lib/makeup'

const uuid = z.string().uuid()
const Weekdays = z.array(z.number().int().min(0).max(6)).max(7)

/** 入会手続き中（承認前）の保護者も、自分が申請した子の参加曜日・振替の申告はできる */
async function canSetupChild(user: { id: string; isAdmin: boolean }, childId: string) {
  if (user.isAdmin) return true
  const [row] = await sql`select 1 from guardian_children where profile_id = ${user.id} and child_id = ${uuid.parse(childId)}`
  return !!row
}

async function childRow(childId: string) {
  const [c] = await sql<{ id: string; full_name: string; weekdays: number[] }[]>`
    select id, full_name, weekdays from children where id = ${uuid.parse(childId)} and status = 'active'`
  if (!c) throw new Error('お子さんが見つかりません')
  return c
}

/**
 * 参加曜日以外の練習に参加する。
 * 参加曜日が1日の子は振替を1回使う（残りがないと参加できない）。2日以上の子は使わない。
 */
export async function joinExtra(eventId: string, childId: string) {
  const user = await requireUser()
  if (!(await canActForChild(user, childId))) throw new Error('この子どもの参加登録はできません')
  const e = await loadPractice(uuid.parse(eventId))
  if (!e || e.status !== 'active') throw new Error('この練習には参加できません')
  if (!user.isAdmin && practiceEnded(e)) throw new Error('この練習は終わっています')
  if (!(await eventTargetChildIds(e.id)).includes(childId)) throw new Error('この練習の対象ではありません')
  const c = await childRow(childId)
  const plan = planOf(c.weekdays)
  if (plan === 'none') throw new Error('先に参加曜日を設定してください')
  if (isRegularDay(c.weekdays, e.starts_at)) throw new Error('この日はもともと参加の曜日です')

  const usesCredit = plan === 'weekly1'
  await sql.begin(async (tx) => {
    // 同じ子の振替を同時に使われないように、子どもの行をロック
    await tx`select id from children where id = ${childId} for update`
    const [exists] = await tx`select 1 from practice_extras where event_id = ${e.id} and child_id = ${childId}`
    if (exists) return
    if (usesCredit) {
      const [{ balance }] = await tx<{ balance: number }[]>`
        select coalesce(sum(delta), 0)::int as balance from makeup_credits where child_id = ${childId}`
      if (balance < 1) throw new Error('振替の残りがありません')
      await tx`
        insert into makeup_credits (child_id, event_id, delta, reason, created_by)
        values (${childId}, ${e.id}, -1, 'used', ${user.id})`
    }
    await tx`
      insert into practice_extras (event_id, child_id, uses_credit, created_by)
      values (${e.id}, ${childId}, ${usesCredit}, ${user.id})`
    // 以前に出していた欠席連絡は取り消す
    await tx`delete from absence_reports where event_id = ${e.id} and child_id = ${childId} and kind = 'absent'`
  })
  refresh()
  return { usedCredit: usesCredit }
}

/** 参加曜日以外の練習への参加を取り消す（使った振替は戻る） */
export async function leaveExtra(eventId: string, childId: string) {
  const user = await requireUser()
  if (!(await canActForChild(user, childId))) throw new Error('権限がありません')
  const e = await loadPractice(uuid.parse(eventId))
  if (!e) throw new Error('練習が見つかりません')
  if (!user.isAdmin && practiceEnded(e)) throw new Error('この練習は終わっています')
  await sql.begin(async (tx) => {
    await tx`delete from practice_extras where event_id = ${e.id} and child_id = ${childId}`
    await tx`delete from makeup_credits where event_id = ${e.id} and child_id = ${childId} and reason = 'used'`
  })
  refresh()
}

/**
 * 参加曜日を決める。保護者は「まだ決めていないとき」だけ（変更は管理者に依頼）。管理者はいつでも変更できる。
 */
export async function setWeekdays(childId: string, weekdays: number[]) {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  const days = [...new Set(Weekdays.parse(weekdays))].sort()
  if (!(await canSetupChild(user, childId))) throw new Error('権限がありません')
  const c = await childRow(childId)
  if (!user.isAdmin && c.weekdays.length > 0) throw new Error('参加曜日の変更は、クラブの管理者に連絡してください')
  if (!user.isAdmin && days.length === 0) throw new Error('参加する曜日を1つ以上選んでください')
  const slots = (await sql<{ weekday: number }[]>`select weekday from practice_slots`).map((s) => s.weekday)
  if (slots.length > 0 && days.some((d) => !slots.includes(d))) throw new Error('練習のない曜日は選べません')
  await sql`update children set weekdays = ${days}::int[] where id = ${c.id}`
  if (!user.isAdmin) {
    notifyLater(await adminIds(), 'approval', {
      title: '参加曜日が登録されました',
      body: `${c.full_name}さん: ${days.map((d) => '日月火水木金土'[d]).join('・')}曜日`,
      url: '/admin/makeup',
    })
  }
  refresh()
}

/**
 * BANDから移行する保護者が、いまたまっている振替の回数を申告する（1人1回だけ）。
 * 管理者には通知が届き、違っていれば管理者が直せる。
 */
export async function declareInitialCredits(childId: string, count: number) {
  const user = await requireUser({ allowOnboarding: true })
  assertAdult(user)
  if (!(await canSetupChild(user, childId))) throw new Error('権限がありません')
  const n = z.number().int().min(0).max(60).parse(count)
  const c = await childRow(childId)
  const [already] = await sql`select 1 from makeup_credits where child_id = ${c.id} and reason = 'initial'`
  if (already && !user.isAdmin) throw new Error('振替の回数はすでに申告されています。変更は管理者に連絡してください')
  // 0回でも「申告済み」として記録する
  await sql`
    insert into makeup_credits (child_id, delta, reason, note, created_by)
    values (${c.id}, ${n}, 'initial', 'BANDからの移行時に申告', ${user.id})`
  if (n > 0) {
    notifyLater(await adminIds(), 'approval', {
      title: '振替の回数が申告されました',
      body: `${c.full_name}さん: ${n}回（BANDからの移行）`,
      url: '/admin/makeup',
    })
  }
  refresh()
}

/** 管理者: 振替の回数を増やす・減らす（理由のメモつき） */
export async function adjustCredits(childId: string, delta: number, note: string) {
  const user = await requireUser()
  assertAdmin(user)
  const d = z.number().int().min(-60).max(60).refine((v) => v !== 0).parse(delta)
  const c = await childRow(childId)
  await sql`
    insert into makeup_credits (child_id, delta, reason, note, created_by)
    values (${c.id}, ${d}, 'admin', ${note.trim().slice(0, 200)}, ${user.id})`
  refresh()
}
