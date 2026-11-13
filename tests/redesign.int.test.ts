// 再設計（v1.3）で追加した操作の結合テスト。
// 参加・見送りの回答（定員・キャンセル待ち・繰り上げ）、催促、練習日程のまとめ入力を、
// 「未ログイン／他の保護者／子どもアカウント／管理者」それぞれの立場で呼んで確かめる。
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
let events: typeof import('@/app/actions/events')
let schedule: typeof import('@/app/actions/schedule')
let posts: typeof import('@/app/actions/posts')
let todo: typeof import('@/lib/todo')
let auth: typeof import('@/lib/auth')

const ids = { admin: '', parentA: '', parentB: '', childUser: '', kid1: '', kid2: '', kid3: '', event: '', post: '' }
const tokens: Record<string, string> = {}
const as = (who: keyof typeof tokens | null) => {
  token = who ? tokens[who] : undefined
}

async function profile(name: string, opts: { admin?: boolean; child?: boolean } = {}) {
  const [p] = await db<{ id: string }[]>`
    insert into profiles (display_name, role, account_kind, terms_agreed_at, onboarded_at)
    values (${name}, ${opts.admin ? 'admin' : 'member'}, ${opts.child ? 'child' : 'adult'}, now(), now()) returning id`
  return p.id
}
async function child(name: string) {
  const [c] = await db<{ id: string }[]>`insert into children (full_name, kana, grade) values (${name}, ${name}, 3) returning id`
  return c.id
}
const statusOf = async (kid: string) =>
  (await db<{ status: string }[]>`select status from rsvps where event_id = ${ids.event} and child_id = ${kid}`)[0]?.status ?? null

beforeAll(async () => {
  if (!/test/.test(URL_)) throw new Error('テスト用DBを指定してください')
  db = postgres(URL_, { max: 1, onnotice: () => {} })
  await db.unsafe('drop schema if exists public cascade; create schema public;')
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_ }, stdio: 'ignore' })
  auth = await import('@/lib/auth')
  events = await import('@/app/actions/events')
  schedule = await import('@/app/actions/schedule')
  posts = await import('@/app/actions/posts')
  todo = await import('@/lib/todo')

  ids.admin = await profile('管理者', { admin: true })
  ids.parentA = await profile('保護者A')
  ids.parentB = await profile('保護者B')
  ids.childUser = await profile('子ども本人', { child: true })
  ids.kid1 = await child('いちろう')
  ids.kid2 = await child('じろう')
  ids.kid3 = await child('さぶろう')
  for (const [p, k] of [[ids.parentA, ids.kid1], [ids.parentA, ids.kid2], [ids.parentB, ids.kid3]])
    await db`insert into guardian_children (profile_id, child_id, status) values (${p}, ${k}, 'approved')`
  await db`insert into child_accounts (profile_id, child_id, status) values (${ids.childUser}, ${ids.kid1}, 'active')`
  for (const who of ['admin', 'parentA', 'parentB', 'childUser'] as const) tokens[who] = (await auth.createSession(ids[who], false)).token

  // 定員1の大会（部内締めは3日後）と、その告知
  const [type] = await db<{ id: string }[]>`select id from event_types where uses_rsvp order by sort limit 1`
  const [e] = await db<{ id: string }[]>`
    insert into events (type_id, title, starts_at, member_deadline, capacity, created_by)
    values (${type.id}, 'テスト大会', now() + interval '20 days', now() + interval '3 days', 1, ${ids.admin}) returning id`
  ids.event = e.id
  const [p] = await db<{ id: string }[]>`
    insert into posts (title, event_id, published_at, created_by) values ('テスト大会', ${e.id}, now(), ${ids.admin}) returning id`
  ids.post = p.id
}, 120_000)

afterAll(async () => {
  await db.end()
  const { sql } = await import('@/lib/db')
  await sql.end()
})

beforeEach(() => notifyLater.mockClear())

describe('参加・見送りの回答', () => {
  it('未ログイン・他の保護者・別の子の子どもアカウントからは回答できない', async () => {
    as(null)
    await expect(events.answerRsvp(ids.event, ids.kid1, 'going')).rejects.toThrow('REDIRECT:/login')
    as('parentB')
    await expect(events.answerRsvp(ids.event, ids.kid1, 'going')).rejects.toThrow('この子どもの回答はできません')
    await expect(events.clearRsvp(ids.event, ids.kid1)).rejects.toThrow('権限がありません')
    as('childUser')
    await expect(events.answerRsvp(ids.event, ids.kid2, 'going')).rejects.toThrow('この子どもの回答はできません')
    expect(await statusOf(ids.kid1)).toBeNull()
    expect(await statusOf(ids.kid2)).toBeNull()
  })

  it('回答前は「やること」に出て、告知の投稿は二重に出ない', async () => {
    as('parentA')
    const t = await todo.getTodos()
    expect(t.rsvps.map((e) => e.id)).toEqual([ids.event])
    expect(t.rsvps[0].kids.map((k) => k.status)).toEqual([null, null])
    expect(t.posts).toEqual([])
    expect(t.count).toBe(1)
  })

  it('定員を超えるとキャンセル待ち、見送りに変えると先頭が繰り上がって通知される', async () => {
    as('childUser')
    expect((await events.answerRsvp(ids.event, ids.kid1, 'going')).status).toBe('going')
    as('parentA')
    expect((await events.answerRsvp(ids.event, ids.kid2, 'going')).status).toBe('waitlist')
    expect((await events.answerRsvp(ids.event, ids.kid1, 'declined')).status).toBe('declined')
    expect(await statusOf(ids.kid2)).toBe('going')
    const promoted = notifyLater.mock.calls.find((c) => c[1] === 'waitlist')
    expect(promoted?.[0]).toEqual([ids.parentA])

    // 回答したら告知は既読になり、やることは空になる
    const [read] = await db`select 1 from post_reads where post_id = ${ids.post} and profile_id = ${ids.parentA}`
    expect(read).toBeTruthy()
    const t = await todo.getTodos()
    expect(t.rsvps).toEqual([])
    expect(t.answered.map((e) => e.id)).toEqual([ids.event])
    expect(t.count).toBe(0)
  })

  it('催促は管理者だけが送れて、未回答の子の保護者だけに届く', async () => {
    as('parentA')
    await expect(events.nudgeUnanswered(ids.event)).rejects.toThrow('権限')
    as('childUser')
    await expect(events.nudgeUnanswered(ids.event)).rejects.toThrow('権限')
    as('admin')
    expect(await events.nudgeUnanswered(ids.event)).toEqual({ sent: 1 })
    expect(notifyLater).toHaveBeenCalledTimes(1)
    expect(notifyLater.mock.calls[0][0]).toEqual([ids.parentB])
    expect(notifyLater.mock.calls[0][1]).toBe('reminder')
  })

  it('未読者への再通知も管理者だけ。読んだ人と自分には送らない', async () => {
    as('parentB')
    await expect(posts.nudgeUnread(ids.post)).rejects.toThrow('権限')
    as('admin')
    const r = await posts.nudgeUnread(ids.post)
    expect(r.sent).toBe(1)
    expect(notifyLater.mock.calls[0][0]).toEqual([ids.parentB])
  })

  it('部内締めを過ぎたら保護者は変更できず、管理者は代わりに入力できる', async () => {
    await db`update events set member_deadline = now() - interval '1 hour' where id = ${ids.event}`
    as('parentB')
    await expect(events.answerRsvp(ids.event, ids.kid3, 'going')).rejects.toThrow('部内締めを過ぎた')
    as('admin')
    expect((await events.answerRsvp(ids.event, ids.kid3, 'declined')).status).toBe('declined')
  })
})

describe('練習日程のまとめ入力', () => {
  // 2か月先の月（必ず全日が未来）
  const now = new Date(Date.now() + 9 * 3600e3)
  const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))
  const ym = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`
  const practices = () =>
    db<{ id: string; status: string; d: string; dow: number; t: string }[]>`
      select e.id, e.status, to_char(e.starts_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as d,
        extract(dow from e.starts_at at time zone 'Asia/Tokyo')::int as dow,
        to_char(e.starts_at at time zone 'Asia/Tokyo', 'HH24:MI') as t
      from events e join event_types t on t.id = e.type_id
      where t.uses_arrival and to_char(e.starts_at at time zone 'Asia/Tokyo', 'YYYY-MM') = ${ym} order by e.starts_at`

  it('保護者・子どもアカウントからは操作できない', async () => {
    for (const who of ['parentA', 'childUser'] as const) {
      as(who)
      await expect(schedule.fillMonth(ym)).rejects.toThrow('権限')
      await expect(schedule.addPractice({ date: `${ym}-10`, start: '18:30', end: '20:30', venueId: null, notify: false })).rejects.toThrow('権限')
      await expect(schedule.saveSlots(new FormData())).rejects.toThrow('権限')
    }
    as(null)
    await expect(schedule.fillMonth(ym)).rejects.toThrow('REDIRECT:/login')
    expect(await practices()).toHaveLength(0)
  })

  it('いつもの練習が曜日どおりに入り、もう一度押しても増えない。休みにした日も上書きしない', async () => {
    as('admin')
    const { created } = await schedule.fillMonth(ym)
    const rows = await practices()
    expect(created).toBe(rows.length)
    expect(rows.length).toBeGreaterThanOrEqual(24)
    expect(rows.every((r) => r.dow !== 0)).toBe(true) // 日曜は練習なし
    expect(rows.filter((r) => r.dow === 3).every((r) => r.t === '19:00')).toBe(true) // 水曜は 19:00
    expect(rows.filter((r) => r.dow === 1).every((r) => r.t === '18:30')).toBe(true)
    expect(notifyLater).not.toHaveBeenCalled() // まとめ入力では通知しない

    as('parentA')
    await expect(schedule.setPracticeOff(rows[0].id, true)).rejects.toThrow('権限')
    await expect(schedule.removePractice(rows[0].id)).rejects.toThrow('権限')
    as('admin')
    await schedule.setPracticeOff(rows[0].id, true)
    expect(notifyLater).toHaveBeenCalledTimes(1)
    expect(notifyLater.mock.calls[0][3]).toMatchObject({ childOk: true })
    expect((await schedule.fillMonth(ym)).created).toBe(0)
    const after = await practices()
    expect(after).toHaveLength(rows.length)
    expect(after[0].status).toBe('cancelled')
  })

  it('時間の変更は日付を保ったまま反映される', async () => {
    as('admin')
    const [first, second] = await practices()
    await schedule.updatePractice({ eventId: second.id, start: '17:00', end: '19:00', venueId: null, notify: false })
    const rows = await practices()
    const changed = rows.find((r) => r.id === second.id)!
    expect(changed.d).toBe(second.d)
    expect(changed.t).toBe('17:00')
    await expect(schedule.updatePractice({ eventId: first.id, start: '19:00', end: '18:00', venueId: null, notify: false })).rejects.toThrow('終了は開始より後')
  })
})
