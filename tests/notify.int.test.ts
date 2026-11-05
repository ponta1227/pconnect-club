// 通知の判定（夜間の保留・緊急・子どもアカウント・個人設定）をテスト用DBで確認する結合テスト。
// TEST_DATABASE_URL（既定: postgres://app:app@localhost:5432/pconnect_test）を初期化して使う。
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const URL_ = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test'
process.env.DATABASE_URL = URL_
delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
delete process.env.RESEND_API_KEY

let lib: typeof import('@/lib/notify')
let db: postgres.Sql
const logs: string[] = []

const jst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`)

async function profile(name: string, opts: { kind?: 'adult' | 'child'; email?: string } = {}) {
  const [p] = await db<{ id: string }[]>`
    insert into profiles (display_name, account_kind, email, email_verified)
    values (${name}, ${opts.kind ?? 'adult'}, ${opts.email ?? null}, ${!!opts.email}) returning id`
  await db`insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values (${p.id}, ${'https://push.example/' + p.id}, 'k', 'a')`
  return p.id
}

beforeAll(async () => {
  if (!/test/.test(URL_)) throw new Error('テスト用DBを指定してください')
  db = postgres(URL_, { max: 1, onnotice: () => {} })
  await db.unsafe('drop schema if exists public cascade; create schema public;')
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_ }, stdio: 'ignore' })
  lib = await import('@/lib/notify')
  vi.spyOn(console, 'info').mockImplementation((m: string) => void logs.push(m))
})

afterAll(async () => {
  vi.useRealTimers()
  await db.end()
  const { sql } = await import('@/lib/db')
  await sql.end()
})

beforeEach(() => {
  logs.length = 0
})

const pushes = (id: string) => logs.filter((l) => l.startsWith('[push:dev]') && l.includes(id)).length
const mails = (email: string) => logs.filter((l) => l.startsWith('[mail:dev]') && l.includes(email)).length

describe('通知', () => {
  it('日中は既定の設定でプッシュとメールを送る', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(jst('2026-11-05', '12:00'))
    const a = await profile('保護者A', { email: 'a@example.com' })
    await lib.notify([a], 'post', { title: 'お知らせ', body: '本文', url: '/board' })
    expect(pushes(a)).toBe(1)
    expect(mails('a@example.com')).toBe(1)
    // チャットは既定でメールなし
    await lib.notify([a], 'chat', { title: 'ルーム', body: 'こんにちは', url: '/chat' })
    expect(pushes(a)).toBe(2)
    expect(mails('a@example.com')).toBe(1)
  })

  it('22時〜7時のプッシュは保留し、7時にまとめて送る', async () => {
    vi.setSystemTime(jst('2026-11-05', '23:10'))
    const b = await profile('保護者B')
    await lib.notify([b], 'post', { title: '夜のお知らせ', body: '本文', url: '/board' })
    await lib.notify([b], 'event', { title: '予定変更', body: '本文', url: '/events' })
    expect(pushes(b)).toBe(0)
    const queued = await db<{ send_after: Date }[]>`select send_after from notification_queue where profile_id = ${b} and sent_at is null`
    expect(queued).toHaveLength(2)
    expect(queued[0].send_after.toISOString()).toBe(jst('2026-11-06', '07:00').toISOString())

    vi.setSystemTime(jst('2026-11-06', '07:00'))
    // flushQueue は DB の now() を使うため、送信予定を過去にずらして確認する
    await db`update notification_queue set send_after = now() - interval '1 minute' where profile_id = ${b}`
    const n = await lib.flushQueue()
    expect(n).toBe(2)
    expect(logs.some((l) => l.includes(b) && l.includes('夜間のお知らせ 2件'))).toBe(true)
  })

  it('緊急は夜間でもすぐ送り、メール通知をOFFにしていてもメールを送る', async () => {
    vi.setSystemTime(jst('2026-11-05', '23:30'))
    const c = await profile('保護者C', { email: 'c@example.com' })
    await db`insert into notification_settings (profile_id, kind, push, email) values (${c}, 'urgent', false, false)`
    await lib.notify([c], 'urgent', { title: '【緊急】休館', body: '本文', url: '/board' }, { urgent: true })
    expect(pushes(c)).toBe(1)
    expect(mails('c@example.com')).toBe(1)
  })

  it('メンションは夜間でもすぐ送る', async () => {
    vi.setSystemTime(jst('2026-11-05', '23:30'))
    const d = await profile('保護者D')
    await lib.notify([d], 'mention', { title: 'メンション', body: '本文', url: '/chat' }, { bypassQuiet: true })
    expect(pushes(d)).toBe(1)
  })

  it('個人設定でOFFにした種類は送らない', async () => {
    vi.setSystemTime(jst('2026-11-05', '12:00'))
    const e = await profile('保護者E', { email: 'e@example.com' })
    await db`insert into notification_settings (profile_id, kind, push, email) values (${e}, 'post', false, false)`
    await lib.notify([e], 'post', { title: 'お知らせ', body: '本文', url: '/board' })
    expect(pushes(e)).toBe(0)
    expect(mails('e@example.com')).toBe(0)
  })

  it('子どもアカウントには「予定の変更・中止」だけを送る', async () => {
    vi.setSystemTime(jst('2026-11-05', '12:00'))
    const k = await profile('子ども', { kind: 'child', email: 'kid@example.com' })
    await lib.notify([k], 'post', { title: 'お知らせ', body: '本文', url: '/board' })
    await lib.notify([k], 'arrival', { title: '到着', body: '本文', url: '/' })
    await lib.notify([k], 'urgent', { title: '緊急投稿', body: '本文', url: '/' }, { urgent: true })
    expect(pushes(k)).toBe(0)
    await lib.notify([k], 'event', { title: '予定が変更されました', body: '本文', url: '/events' }, { childOk: true })
    expect(pushes(k)).toBe(1)
    expect(mails('kid@example.com')).toBe(0)
  })

  it('退会したメンバーには送らない', async () => {
    vi.setSystemTime(jst('2026-11-05', '12:00'))
    const f = await profile('退会者')
    await db`update profiles set deleted_at = now() where id = ${f}`
    await lib.notify([f], 'post', { title: 'お知らせ', body: '本文', url: '/board' })
    expect(pushes(f)).toBe(0)
  })
})
