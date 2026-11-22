// 参加曜日と振替の結合テスト。各操作を「未ログイン／他の保護者／子どもアカウント／管理者」の立場で呼んで確かめる。
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const URL_ = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test'
process.env.DATABASE_URL = URL_

// ---- Next.js のリクエスト依存の部分を差し替える
let token: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (token ? { value: token } : undefined), set: () => {}, delete: () => {} }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('next/cache', () => ({ refresh: () => {} }))
const notifyLater = vi.fn()
vi.mock('@/lib/notify', () => ({ notifyLater: (...a: unknown[]) => notifyLater(...a) }))

let db: postgres.Sql
let att: typeof import('@/app/actions/attendance')
let events: typeof import('@/app/actions/events')
let makeup: typeof import('@/lib/makeup')
let auth: typeof import('@/lib/auth')

const ids = { admin: '', parentA: '', parentB: '', childUser: '', taro: '', hana: '', jiro: '', regular: '', other: '' }
const tokens: Record<string, string> = {}
const as = (who: keyof typeof tokens | null) => {
  token = who ? tokens[who] : undefined
}
const balance = async (kid: string) =>
  (await db<{ b: number }[]>`select coalesce(sum(delta), 0)::int as b from makeup_credits where child_id = ${kid}`)[0].b

async function profile(name: string, opts: { admin?: boolean; child?: boolean } = {}) {
  const [p] = await db<{ id: string }[]>`
    insert into profiles (display_name, role, account_kind, terms_agreed_at, onboarded_at, guide_read_version)
    values (${name}, ${opts.admin ? 'admin' : 'member'}, ${opts.child ? 'child' : 'adult'}, now(), now(), 999) returning id`
  return p.id
}
async function child(name: string, weekdays: number[]) {
  const [c] = await db<{ id: string }[]>`insert into children (full_name, kana, grade, weekdays) values (${name}, ${name}, 3, ${weekdays}::int[]) returning id`
  return c.id
}
/** テストの基準日。振替は2026年12月1日以降の練習からたまるので、それより前なら12月1日にする */
const BASE = Math.max(Date.now(), Date.parse('2026-12-01T00:00:00+09:00'))
/** 日本時間の yyyy-mm-dd（n日後）と曜日 */
function jstDay(n: number) {
  const d = new Date(BASE + 9 * 3600e3 + n * 86400e3)
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay() }
}

beforeAll(async () => {
  if (!/test/.test(URL_)) throw new Error('テスト用DBを指定してください')
  db = postgres(URL_, { max: 1, onnotice: () => {} })
  await db.unsafe('drop schema if exists public cascade; create schema public;')
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_ }, stdio: 'ignore' })
  auth = await import('@/lib/auth')
  att = await import('@/app/actions/attendance')
  events = await import('@/app/actions/events')
  makeup = await import('@/lib/makeup')

  // 練習は「あした（太郎・花子の参加曜日）」と「あさって（花子だけの参加曜日）」の2つ
  const a = jstDay(1)
  const b = jstDay(2)
  ids.admin = await profile('管理者', { admin: true })
  ids.parentA = await profile('保護者A')
  ids.parentB = await profile('保護者B')
  ids.childUser = await profile('太郎本人', { child: true })
  ids.taro = await child('たろう', [a.dow])
  ids.hana = await child('はなこ', [a.dow, b.dow])
  ids.jiro = await child('じろう', [])
  for (const [p, k] of [[ids.parentA, ids.taro], [ids.parentA, ids.hana], [ids.parentB, ids.jiro]])
    await db`insert into guardian_children (profile_id, child_id, status) values (${p}, ${k}, 'approved')`
  await db`insert into child_accounts (profile_id, child_id, status) values (${ids.childUser}, ${ids.taro}, 'active')`
  for (const who of ['admin', 'parentA', 'parentB', 'childUser'] as const) tokens[who] = (await auth.createSession(ids[who], false)).token

  const [type] = await db<{ id: string }[]>`select id from event_types where uses_arrival order by sort limit 1`
  const mk = async (date: string) =>
    (await db<{ id: string }[]>`
      insert into events (type_id, title, starts_at, ends_at)
      values (${type.id}, '練習', ${date + 'T18:30:00+09:00'}::timestamptz, ${date + 'T20:30:00+09:00'}::timestamptz) returning id`)[0].id
  ids.regular = await mk(a.date)
  ids.other = await mk(b.date)
}, 120_000)

afterAll(async () => {
  await db.end()
  const { sql } = await import('@/lib/db')
  await sql.end()
})

beforeEach(() => notifyLater.mockClear())

describe('振替がたまる', () => {
  it('参加曜日の欠席連絡で1回たまり、取り消すと消える。遅刻ではたまらない', async () => {
    as('parentA')
    await events.reportAbsence({ eventId: ids.regular, childId: ids.taro, kind: 'absent' })
    expect(await balance(ids.taro)).toBe(1)
    await events.reportAbsence({ eventId: ids.regular, childId: ids.taro, kind: 'late', atTime: '19:00' })
    expect(await balance(ids.taro)).toBe(0)
    await events.reportAbsence({ eventId: ids.regular, childId: ids.taro, kind: 'absent' })
    await events.withdrawAbsence(ids.regular, ids.taro)
    expect(await balance(ids.taro)).toBe(0)
  })

  it('クラブ都合の休みで参加曜日の子だけにたまり、練習ありに戻すと消える', async () => {
    as('admin')
    await events.cancelEvent(ids.regular, false)
    expect(await balance(ids.taro)).toBe(1)
    expect(await balance(ids.hana)).toBe(1)
    expect(await balance(ids.jiro)).toBe(0)
    await events.reopenEvent(ids.regular)
    expect(await balance(ids.taro)).toBe(0)
    expect(await balance(ids.hana)).toBe(0)
  })

  it('練習のあと、到着も欠席連絡もない参加曜日の子にたまる。あとで到着を登録すると消える', async () => {
    const later = new Date(BASE + 3 * 86400e3)
    expect(await makeup.settleNoShows(later)).toBe(3)
    // あした: 太郎・花子 ／ あさって: 花子 の3件
    expect(await balance(ids.taro)).toBe(1)
    expect(await balance(ids.hana)).toBe(2)
    expect(await makeup.settleNoShows(later)).toBe(0) // 二重にはたまらない
    as('admin')
    await events.addArrivalManually(ids.regular, ids.taro)
    expect(await balance(ids.taro)).toBe(0)
    // 次のテストのために元に戻す
    await db`delete from makeup_credits`
    await db`delete from arrivals`
  })
})

describe('振替を使う', () => {
  it('他の保護者・未ログインは使えない。参加曜日がない子は使えない', async () => {
    as(null)
    await expect(att.joinExtra(ids.other, ids.taro)).rejects.toThrow('REDIRECT:/login')
    as('parentB')
    await expect(att.joinExtra(ids.other, ids.taro)).rejects.toThrow('参加登録はできません')
    await expect(att.joinExtra(ids.other, ids.jiro)).rejects.toThrow('参加曜日を設定')
  })

  it('週1日の子は残りがないと参加できず、あれば1回使う。取り消すと戻る', async () => {
    as('childUser')
    await expect(att.joinExtra(ids.other, ids.taro)).rejects.toThrow('振替の残りがありません')
    as('admin')
    await att.adjustCredits(ids.taro, 2, 'テスト')
    as('childUser')
    expect((await att.joinExtra(ids.other, ids.taro)).usedCredit).toBe(true)
    expect(await balance(ids.taro)).toBe(1)
    await att.joinExtra(ids.other, ids.taro) // 二度押しても1回だけ
    expect(await balance(ids.taro)).toBe(1)
    const exp = await makeup.expectedAttendees(ids.other)
    expect(exp.map((e) => [e.id, e.kind])).toContainEqual([ids.taro, 'credit'])
    await att.leaveExtra(ids.other, ids.taro)
    expect(await balance(ids.taro)).toBe(2)
  })

  it('参加曜日の日には使えない。週2日以上の子は使わずに参加できる', async () => {
    as('parentA')
    await expect(att.joinExtra(ids.regular, ids.taro)).rejects.toThrow('もともと参加の曜日')
    await db`update children set weekdays = ${[jstDay(1).dow, (jstDay(1).dow + 3) % 7]}::int[] where id = ${ids.hana}`
    expect((await att.joinExtra(ids.other, ids.hana)).usedCredit).toBe(false)
    expect(await balance(ids.hana)).toBe(0)
  })

  it('振替で参加予定の日が休みになると、使った振替が戻る', async () => {
    as('parentA')
    await att.joinExtra(ids.other, ids.taro)
    expect(await balance(ids.taro)).toBe(1)
    as('admin')
    await events.cancelEvent(ids.other, false)
    expect(await balance(ids.taro)).toBe(2)
    await events.reopenEvent(ids.other)
  })
})

describe('参加曜日・振替の設定', () => {
  it('保護者は未設定のときだけ曜日を決められる。子どもアカウント・他の保護者は不可', async () => {
    as('childUser')
    await expect(att.setWeekdays(ids.jiro, [1])).rejects.toThrow()
    as('parentA')
    await expect(att.setWeekdays(ids.jiro, [1])).rejects.toThrow('権限がありません')
    as('parentB')
    await att.setWeekdays(ids.jiro, [1])
    await expect(att.setWeekdays(ids.jiro, [2])).rejects.toThrow('管理者に連絡')
    as('admin')
    await att.setWeekdays(ids.jiro, [2, 4])
    expect((await db<{ w: number[] }[]>`select weekdays as w from children where id = ${ids.jiro}`)[0].w).toEqual([2, 4])
  })

  it('移行時の振替の申告は1回だけ。管理者以外は回数を直せない', async () => {
    as('parentB')
    await att.declareInitialCredits(ids.jiro, 3)
    expect(await balance(ids.jiro)).toBe(3)
    await expect(att.declareInitialCredits(ids.jiro, 5)).rejects.toThrow('すでに申告')
    await expect(att.adjustCredits(ids.jiro, 5, '')).rejects.toThrow('権限')
    as('childUser')
    await expect(att.adjustCredits(ids.taro, 5, '')).rejects.toThrow()
    expect(await balance(ids.jiro)).toBe(3)
  })
})

describe('金曜日と自主練', () => {
  it('金曜日は参加曜日にできない（管理者も）', async () => {
    as('admin')
    await expect(att.setWeekdays(ids.jiro, [5])).rejects.toThrow('参加曜日にできません')
    await expect(att.setWeekdays(ids.jiro, [2, 5])).rejects.toThrow('参加曜日にできません')
  })

  it('自主練はだれの参加曜日にもならず、参加しても振替は使わない。休んでも・来なくてもたまらない', async () => {
    const [type] = await db<{ id: string }[]>`select id from event_types where uses_arrival order by sort limit 1`
    // 太郎（週1）の参加曜日と同じ曜日の自主練
    const d = new Date(BASE + 9 * 3600e3 + 8 * 86400e3).toISOString().slice(0, 10)
    const [{ id: selfId }] = await db<{ id: string }[]>`
      insert into events (type_id, title, starts_at, ends_at, self_practice)
      values (${type.id}, '自主練', ${d + 'T18:00:00+09:00'}::timestamptz, ${d + 'T21:00:00+09:00'}::timestamptz, true) returning id`
    const e = (await makeup.loadPractice(selfId))!
    expect(await makeup.regularChildrenFor(e)).toEqual([])

    as('parentA')
    const before = await balance(ids.taro)
    const r = await att.joinExtra(selfId, ids.taro)
    expect(r.usedCredit).toBe(false)
    expect(await balance(ids.taro)).toBe(before)
    // 休みの連絡は参加の取り消しになり、振替はたまらない
    await events.reportAbsence({ eventId: selfId, childId: ids.taro, kind: 'absent' })
    expect(await balance(ids.taro)).toBe(before)
    expect((await db`select 1 from practice_extras where event_id = ${selfId}`).length).toBe(0)

    // 終わったあとも「来なかった」でたまらない
    await makeup.settleNoShows(new Date(Date.parse(d + 'T23:00:00+09:00')))
    expect((await db`select 1 from makeup_credits where event_id = ${selfId}`).length).toBe(0)
  })
})

describe('振替がたまり始める日', () => {
  it('2026年11月までの練習は、欠席しても・来なくても振替がたまらない', async () => {
    const [type] = await db<{ id: string }[]>`select id from event_types where uses_arrival order by sort limit 1`
    const [{ id: nov }] = await db<{ id: string }[]>`
      insert into events (type_id, title, starts_at, ends_at)
      values (${type.id}, '練習', '2026-11-30T18:30:00+09:00', '2026-11-30T20:30:00+09:00') returning id`
    await makeup.earnCredit(ids.taro, nov, 'absent')
    await makeup.earnCredit(ids.hana, nov, 'no_show')
    await makeup.earnCredit(ids.hana, nov, 'club_cancel')
    expect((await db`select 1 from makeup_credits where event_id = ${nov}`).length).toBe(0)
  })
})

describe('予定の削除', () => {
  it('練習を削除すると、その練習でたまった振替も使った振替も消える', async () => {
    const [type] = await db<{ id: string }[]>`select id from event_types where uses_arrival order by sort limit 1`
    const d = new Date(BASE + 9 * 3600e3 + 20 * 86400e3).toISOString().slice(0, 10)
    const [{ id: ev }] = await db<{ id: string }[]>`
      insert into events (type_id, title, starts_at, ends_at)
      values (${type.id}, '練習', ${d + 'T18:30:00+09:00'}::timestamptz, ${d + 'T20:30:00+09:00'}::timestamptz) returning id`
    await makeup.earnCredit(ids.hana, ev, 'absent')
    await db`insert into makeup_credits (child_id, event_id, delta, reason) values (${ids.taro}, ${ev}, -1, 'used')`
    expect((await db`select 1 from makeup_credits where event_id = ${ev}`).length).toBe(2)
    await db`delete from events where id = ${ev}`
    expect((await db`select 1 from makeup_credits where event_id is null and reason <> 'initial' and reason <> 'admin'`).length).toBe(0)
  })
})
