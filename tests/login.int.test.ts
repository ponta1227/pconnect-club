// LINE 以外のログイン（メールの確認コード・子どものIDとパスワード）の結合テスト。
// 操作を「未ログイン／他の保護者／子どもアカウント／本人の保護者」の立場で呼んで確かめる。
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const URL_ = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test'
process.env.DATABASE_URL = URL_

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
const sent: { to: string; subject: string }[] = []
vi.mock('@/lib/notify', () => ({
  notifyLater: () => {},
  sendEmail: async (to: string, subject: string) => {
    sent.push({ to, subject })
  },
}))

let db: postgres.Sql
let children: typeof import('@/app/actions/children')
let login: typeof import('@/lib/login')
let invites: typeof import('@/lib/invites')
let auth: typeof import('@/lib/auth')

const ids = { admin: '', parentA: '', parentB: '', kidUser: '', taro: '', hana: '' }
const tokens: Record<string, string> = {}
const as = (who: string | null) => {
  token = who ? tokens[who] : undefined
}
const lastCode = () => sent.at(-1)!.subject.match(/(\d{6})/)![1]

async function profile(name: string, opts: { admin?: boolean; child?: boolean } = {}) {
  const [p] = await db<{ id: string }[]>`
    insert into profiles (display_name, role, account_kind, terms_agreed_at, onboarded_at, guide_read_version)
    values (${name}, ${opts.admin ? 'admin' : 'member'}, ${opts.child ? 'child' : 'adult'}, now(), now(), 999) returning id`
  return p.id
}

beforeAll(async () => {
  if (!/test/.test(URL_)) throw new Error('テスト用DBを指定してください')
  db = postgres(URL_, { max: 1, onnotice: () => {} })
  await db.unsafe('drop schema if exists public cascade; create schema public;')
  execFileSync('npx', ['tsx', 'scripts/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_ }, stdio: 'ignore' })
  auth = await import('@/lib/auth')
  children = await import('@/app/actions/children')
  login = await import('@/lib/login')
  invites = await import('@/lib/invites')

  ids.admin = await profile('管理者', { admin: true })
  ids.parentA = await profile('保護者A')
  ids.parentB = await profile('保護者B')
  ids.kidUser = await profile('はなこ本人', { child: true })
  ;[{ id: ids.taro }] = await db<{ id: string }[]>`insert into children (full_name, kana, grade) values ('たろう', 'たろう', 3) returning id`
  ;[{ id: ids.hana }] = await db<{ id: string }[]>`insert into children (full_name, kana, grade) values ('はなこ', 'はなこ', 5) returning id`
  for (const k of [ids.taro, ids.hana]) await db`insert into guardian_children (profile_id, child_id, status) values (${ids.parentA}, ${k}, 'approved')`
  await db`insert into child_accounts (profile_id, child_id, status) values (${ids.kidUser}, ${ids.hana}, 'active')`
  for (const who of ['admin', 'parentA', 'parentB', 'kidUser'] as const) tokens[who] = (await auth.createSession(ids[who], false)).token
})

afterAll(async () => {
  await db?.end()
})

describe('子ども用アカウント（IDとパスワード）', () => {
  it('作れるのは、その子の保護者だけ', async () => {
    as(null)
    await expect(children.createChildLogin(ids.taro, 'taro01', 'pass123', true)).rejects.toThrow()
    as('kidUser')
    await expect(children.createChildLogin(ids.taro, 'taro01', 'pass123', true)).rejects.toThrow()
    as('parentB')
    expect(await children.createChildLogin(ids.taro, 'taro01', 'pass123', true)).toMatchObject({ ok: false })
    as('parentA')
    expect(await children.createChildLogin(ids.taro, 'taro01', 'pass123', false)).toMatchObject({ ok: false })
    expect(await children.createChildLogin(ids.taro, 'た', 'pass123', true)).toMatchObject({ ok: false })
    expect(await children.createChildLogin(ids.taro, 'taro01', '123', true)).toMatchObject({ ok: false })
    expect(await children.createChildLogin(ids.taro, 'Taro01', 'pass123', true)).toEqual({ ok: true })
    // 同じ子にもう1つは作れない・同じIDは使えない
    expect(await children.createChildLogin(ids.taro, 'taro02', 'pass123', true)).toMatchObject({ ok: false })
    const [acc] = await db<{ status: string; login_id: string }[]>`
      select ca.status, p.login_id from child_accounts ca join profiles p on p.id = ca.profile_id where ca.child_id = ${ids.taro}`
    expect(acc).toEqual({ status: 'pending', login_id: 'taro01' })
  })

  it('IDは大文字小文字を区別せずにログインでき、5回まちがえると15分ロック', async () => {
    expect(await login.passwordLogin('TARO01', 'pass123')).toMatchObject({ ok: true })
    expect(await login.passwordLogin('taro01', 'nope')).toMatchObject({ ok: false })
    expect(await login.passwordLogin('nobody', 'pass123')).toMatchObject({ ok: false })
    for (let i = 0; i < 5; i++) await login.passwordLogin('taro01', 'nope')
    const locked = await login.passwordLogin('taro01', 'pass123')
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.error).toMatch(/15分/)
  })

  it('パスワードを変えられるのは保護者（と管理者）だけ。変えるとロック解除・ログアウト', async () => {
    const [{ id: kid }] = await db<{ id: string }[]>`select id from profiles where login_id = 'taro01'`
    await auth.createSession(kid, false)
    as('parentB')
    expect(await children.resetChildPassword(ids.taro, 'newpass1')).toMatchObject({ ok: false })
    as('kidUser')
    await expect(children.resetChildPassword(ids.taro, 'newpass1')).rejects.toThrow()
    as('parentA')
    expect(await children.resetChildPassword(ids.taro, 'newpass1')).toEqual({ ok: true })
    expect((await db`select 1 from sessions where profile_id = ${kid}`).length).toBe(0)
    expect(await login.passwordLogin('taro01', 'pass123')).toMatchObject({ ok: false })
    expect(await login.passwordLogin('taro01', 'newpass1')).toMatchObject({ ok: true })
  })

  it('保護者以外の大人・LINEの子どもアカウントは、IDとパスワードでは入れない', async () => {
    await db`update profiles set login_id = 'parenta', password_hash = (select password_hash from profiles where login_id = 'taro01') where id = ${ids.parentA}`
    expect(await login.passwordLogin('parenta', 'newpass1')).toMatchObject({ ok: false })
    await db`update profiles set login_id = null, password_hash = null where id = ${ids.parentA}`
  })

  it('無効にすると入れなくなり、IDはほかの子が使える', async () => {
    as('parentA')
    await children.revokeChildAccount(ids.taro)
    expect(await login.passwordLogin('taro01', 'newpass1')).toMatchObject({ ok: false })
    expect(await children.createChildLogin(ids.taro, 'taro01', 'again12', true)).toEqual({ ok: true })
  })
})

describe('メールアドレスでログイン（確認コード）', () => {
  let inviteToken = ''
  beforeAll(async () => {
    inviteToken = (await invites.createInvite('club', ids.admin, [], false, 'new')).token
  })

  it('登録のないメールは、招待がないとコードを送らない', async () => {
    const r = await login.requestEmailCode({ email: 'new@example.com', inviteToken: null, name: null })
    expect(r.ok).toBe(false)
    expect(sent.length).toBe(0)
    expect((await login.requestEmailCode({ email: 'bad-address', inviteToken, name: 'X' })).ok).toBe(false)
    expect((await login.requestEmailCode({ email: 'new@example.com', inviteToken, name: ' ' })).ok).toBe(false)
  })

  it('招待＋確認コードで新しい保護者になり、次からはメールだけで同じアカウントに入る', async () => {
    const r = await login.requestEmailCode({ email: 'New@Example.com', inviteToken, name: '新井母' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(sent.at(-1)!.to).toBe('new@example.com')
    const code = lastCode()
    const wrong = code === '000000' ? '111111' : '000000'
    expect(await login.checkEmailCode(r.id, wrong)).toMatchObject({ ok: false, retry: true })
    const ok = await login.checkEmailCode(r.id, code)
    expect(ok).toMatchObject({ ok: true, email: 'new@example.com', name: '新井母' })
    // 同じコードは2回使えない
    expect((await login.checkEmailCode(r.id, code)).ok).toBe(false)
    if (!ok.ok) return
    const first = await invites.resolveLogin(
      { lineUserId: null, name: ok.name!, picture: null, email: ok.email, emailVerified: true },
      { inviteToken: ok.inviteToken },
    )
    expect(first.ok).toBe(true)
    const [p] = await db<{ join_route: string; email_verified: boolean; account_kind: string }[]>`
      select join_route, email_verified, account_kind from profiles where email = 'new@example.com'`
    expect(p).toEqual({ join_route: 'new', email_verified: true, account_kind: 'adult' })

    const again = await login.requestEmailCode({ email: 'new@example.com', inviteToken: null, name: null })
    expect(again.ok).toBe(true)
    if (!again.ok) return
    const ok2 = await login.checkEmailCode(again.id, lastCode())
    if (!ok2.ok) throw new Error('code')
    const second = await invites.resolveLogin({ lineUserId: null, name: 'x', picture: null, email: ok2.email, emailVerified: true }, { inviteToken: null })
    expect(second).toEqual(first)
  })

  it('コードを5回まちがえると、そのコードは使えなくなる', async () => {
    const r = await login.requestEmailCode({ email: 'new@example.com', inviteToken: null, name: null })
    if (!r.ok) throw new Error('send')
    const code = lastCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await login.checkEmailCode(r.id, wrong)
    expect(await login.checkEmailCode(r.id, code)).toMatchObject({ ok: false, retry: false })
  })

  it('1時間に送れるのは5回まで', async () => {
    // ここまでで3回送っている
    for (let i = 0; i < 2; i++) expect((await login.requestEmailCode({ email: 'new@example.com', inviteToken: null, name: null })).ok).toBe(true)
    const r = await login.requestEmailCode({ email: 'new@example.com', inviteToken: null, name: null })
    expect(r.ok).toBe(false)
  })

  it('確認していないメールでは、他人のアカウントに入れない', async () => {
    const r = await invites.resolveLogin({ lineUserId: null, name: 'x', picture: null, email: 'new@example.com', emailVerified: false }, { inviteToken: null })
    expect(r.ok).toBe(false)
  })
})

describe('全体チャット', () => {
  let chat: typeof import('@/app/actions/chat')
  beforeAll(async () => {
    chat = await import('@/app/actions/chat')
  })
  const everyone = async () => (await db<{ id: string }[]>`select id from chat_rooms where is_everyone`)[0].id
  const isMember = async (room: string, p: string) => (await db`select 1 from chat_members where room_id = ${room} and profile_id = ${p}`).length > 0

  it('大人は自動で入り、子どもアカウントは入らない', async () => {
    const room = await everyone()
    expect(await isMember(room, ids.parentA)).toBe(true)
    expect(await isMember(room, ids.admin)).toBe(true)
    expect(await isMember(room, ids.kidUser)).toBe(false)
    const [p] = await db<{ id: string }[]>`insert into profiles (display_name) values ('あとから入った保護者') returning id`
    expect(await isMember(room, p.id)).toBe(true)
  })

  it('管理者でもメンバーを外せず、削除もできない', async () => {
    const room = await everyone()
    as('admin')
    const fd = new FormData()
    fd.set('roomId', room)
    fd.set('name', 'みんなのチャット')
    await expect(chat.updateRoom(fd)).rejects.toThrow(/REDIRECT/)
    expect(await isMember(room, ids.parentA)).toBe(true)
    expect((await db<{ name: string }[]>`select name from chat_rooms where id = ${room}`)[0].name).toBe('みんなのチャット')
    await expect(chat.deleteRoom(room)).rejects.toThrow(/削除できません/)
    as('parentA')
    await expect(chat.deleteRoom(room)).rejects.toThrow()
  })
})
