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

describe('スタッフ連絡のチャット（家族ごと）', () => {
  const staffRoomsOf = async (p: string) =>
    (await db<{ id: string }[]>`select r.id from chat_rooms r join chat_members cm on cm.room_id = r.id where r.is_staff and cm.profile_id = ${p}`).map((r) => r.id)
  const membersOf = async (room: string) => (await db<{ profile_id: string }[]>`select profile_id from chat_members where room_id = ${room}`).map((r) => r.profile_id)
  const adult = async (name: string) => (await db<{ id: string }[]>`insert into profiles (display_name, terms_agreed_at, onboarded_at) values (${name}, now(), now()) returning id`)[0].id
  const link = (p: string, c: string) => db`insert into guardian_children (profile_id, child_id, status, via) values (${p}, ${c}, 'approved', 'admin')`

  it('保護者ごとに自動で作られ、同じ子の保護者は1つにまとまる。管理者は全部に入り、子どもは入らない', async () => {
    const { syncStaffRooms } = await import('@/lib/staff-chat')
    const chat = await import('@/app/actions/chat')
    const admin2 = (await db<{ id: string }[]>`insert into profiles (display_name, role) values ('コーチ', 'admin') returning id`)[0].id
    const [father, mother, other] = [await adult('父'), await adult('母'), await adult('よその保護者')]
    const [kid] = await db<{ id: string }[]>`insert into children (full_name, kana, grade) values ('連絡 太郎', 'れんらくたろう', 3) returning id`
    await link(father, kid.id)
    await syncStaffRooms()

    // まだ家族になっていない母は、いったん自分だけの部屋を持つ
    const [firstRoom] = await staffRoomsOf(father)
    const [motherRoom] = await staffRoomsOf(mother)
    expect(firstRoom).toBeTruthy()
    expect(motherRoom).not.toBe(firstRoom)
    expect((await membersOf(firstRoom)).sort()).toEqual([father, ids.admin, admin2].sort())
    expect((await db<{ name: string }[]>`select name from chat_rooms where id = ${firstRoom}`)[0].name).toBe('スタッフ連絡｜連絡 太郎')
    expect(await staffRoomsOf(ids.kidUser)).toEqual([])
    expect((await staffRoomsOf(ids.admin)).length).toBeGreaterThanOrEqual(3)
    await db`insert into chat_messages (room_id, sender_id, body) values (${motherRoom}, ${mother}, '母からの連絡')`

    // 同じ子の保護者になったら1つにまとまり、それまでのメッセージも引き継ぐ
    await link(mother, kid.id)
    await syncStaffRooms()
    const [fatherRoom, ...rest] = await staffRoomsOf(father)
    expect(rest).toEqual([])
    expect(await staffRoomsOf(mother)).toEqual([fatherRoom])
    expect((await db`select 1 from chat_rooms where id = any(${[firstRoom, motherRoom]}::uuid[])`).length).toBe(1)
    expect((await db`select 1 from chat_messages where room_id = ${fatherRoom} and body = '母からの連絡'`).length).toBe(1)
    // 何度呼んでも増えない
    await syncStaffRooms()
    expect((await staffRoomsOf(father)).length).toBe(1)
    // ほかの家族は入っていない・入れない
    expect(await membersOf(fatherRoom)).not.toContain(other)
    expect((await staffRoomsOf(other)).length).toBe(1)

    // 管理者でも、メンバーの変更・削除はできない
    as('admin')
    const fd = new FormData()
    fd.set('roomId', fatherRoom)
    fd.set('name', '勝手な名前')
    fd.append('members', other)
    await expect(chat.updateRoom(fd)).rejects.toThrow(/REDIRECT/)
    expect(await membersOf(fatherRoom)).not.toContain(other)
    await expect(chat.deleteRoom(fatherRoom)).rejects.toThrow(/削除できません/)

    // 家族から外れたら、その部屋からも外れて自分の部屋になる
    await db`delete from guardian_children where profile_id = ${mother}`
    await syncStaffRooms()
    const [f2, m2] = [await staffRoomsOf(father), await staffRoomsOf(mother)]
    expect([f2.length, m2.length]).toEqual([1, 1])
    expect(f2[0]).not.toBe(m2[0])

    // 管理者でなくなった人は、ほかの家族の部屋から外れる
    const adminActions = await import('@/app/actions/admin')
    await adminActions.setRole(admin2, 'member').catch(() => {})
    expect(await membersOf(f2[0])).not.toContain(admin2)
    expect((await staffRoomsOf(admin2)).length).toBe(1)
    expect(await staffRoomsOf(father)).toEqual(f2)
    expect(await staffRoomsOf(mother)).toEqual(m2)
  })
})

describe('ほかの端末でも同じアカウントを使う（ログイン用リンク）', () => {
  it('1回だけ・期限内だけ使える。子どもアカウントは作れない。ほかの端末をログアウトできる', async () => {
    const account = await import('@/app/actions/account')
    const link = await import('@/lib/login-link')
    as('kidUser')
    await expect(account.createLoginLink()).rejects.toThrow()
    as(null)
    await expect(account.createLoginLink()).rejects.toThrow()

    as('admin')
    expect(await account.createLoginLink('')).toHaveProperty('error') // 管理者は、使う人の名前が必要
    const made = await account.createLoginLink('田中コーチ')
    if ('error' in made) throw new Error(made.error)
    const tok = made.url.split('/login/link/')[1]
    expect(tok.length).toBeGreaterThan(20)
    expect((await db`select 1 from login_links where token_hash = ${tok}`).length).toBe(0) // 生のトークンは保存しない
    expect(await link.peekLoginLink(tok)).toEqual({ name: '管理者' })
    expect(await link.peekLoginLink(tok)).toEqual({ name: '管理者' }) // 見ただけでは使われない

    const before = (await db`select 1 from sessions where profile_id = ${ids.admin}`).length
    as(null)
    await expect(account.loginWithLink(tok)).rejects.toThrow(/REDIRECT:\/$/)
    expect((await db`select 1 from sessions where profile_id = ${ids.admin}`).length).toBe(before + 1)
    expect((await db`select 1 from sessions where profile_id = ${ids.admin} and label = '田中コーチ'`).length).toBe(1)
    // 2回目は使えない
    await expect(account.loginWithLink(tok)).rejects.toThrow(/error=1/)
    expect(await link.peekLoginLink(tok)).toBeNull()
    await expect(account.loginWithLink('でたらめ')).rejects.toThrow(/error=1/)

    // 期限切れ
    as('admin')
    const made2 = await account.createLoginLink('期限切れ')
    if ('error' in made2) throw new Error(made2.error)
    const old = made2.url.split('/login/link/')[1]
    await db`update login_links set expires_at = now() - interval '1 minute' where used_at is null`
    expect(await link.consumeLoginLink(old)).toBeNull()

    // この端末以外をログアウト（自分のセッションと、ほかの人のセッションは残る）
    const others = (await db`select 1 from sessions where profile_id <> ${ids.admin}`).length
    await expect(account.logoutOtherDevices()).rejects.toThrow(/devices=out/)
    expect((await db`select 1 from sessions where profile_id = ${ids.admin}`).length).toBe(1)
    expect((await db`select 1 from sessions where profile_id <> ${ids.admin}`).length).toBe(others)
    expect((await auth.getCurrentUser())?.id).toBe(ids.admin)
  })

  it('共用している端末で書くと、だれが書いたかが管理者にだけ分かる', async () => {
    const account = await import('@/app/actions/account')
    const chat = await import('@/app/actions/chat')
    const { fetchMessages } = await import('@/lib/chat')
    const posts = await import('@/app/actions/posts')
    const [room] = await db<{ id: string }[]>`select id from chat_rooms where is_everyone`
    tokens.coach = (await auth.createSession(ids.admin, false, '田中コーチ')).token
    const input = (body: string) => ({ roomId: room.id, body, replyTo: null, mentions: [], attachments: [] })

    as('coach')
    await chat.sendMessage(input('コーチが書いた'))
    as('admin')
    await chat.sendMessage(input('本人が書いた'))
    // 保護者の端末には名前を付けられず、付いていても記録しない
    tokens.parentLabeled = (await auth.createSession(ids.parentA, false, 'なりすまし')).token
    as('parentLabeled')
    await chat.sendMessage(input('保護者が書いた'))
    expect(await account.createLoginLink('自分で名乗る')).toHaveProperty('url')
    expect((await db`select 1 from login_links where label is not null and profile_id = ${ids.parentA}`).length).toBe(0)

    const label = (list: { body: string; staff_label: string | null }[], body: string) => list.find((m) => m.body === body)!.staff_label
    const forAdmin = await fetchMessages(room.id, { limit: 100, staff: true })
    expect(label(forAdmin, 'コーチが書いた')).toBe('田中コーチ')
    expect(label(forAdmin, '本人が書いた')).toBeNull()
    expect(label(forAdmin, '保護者が書いた')).toBeNull()
    const forParent = await fetchMessages(room.id, { limit: 100 })
    expect(forParent.every((m) => m.staff_label === null)).toBe(true)

    // 掲示板のコメントにも控える
    const [post] = await db<{ id: string }[]>`insert into posts (title, body, published_at, created_by) values ('お知らせ', '', now(), ${ids.admin}) returning id`
    as('coach')
    await posts.addComment(post.id, 'コーチのコメント')
    expect((await db<{ staff_label: string | null }[]>`select staff_label from post_comments where post_id = ${post.id}`)[0].staff_label).toBe('田中コーチ')
  })
})

describe('BANDから移行する人の名簿', () => {
  const list = ['山﨑琥珀', '入野　昊', '髙木　優月', '湊 玲皇', '王瑞豪', '渡邉　晴香', '齋藤　暖斗', '持田凌太朗']

  it('苗字が合えば通る（表記ゆれ・スペースの有無を吸収）', async () => {
    const { surnameMatches } = await import('@/lib/migration-roster')
    for (const ok of ['山崎 次郎', '山﨑二郎', '入野 花', '高木 一', '湊 琉碧', '湊琉碧', '渡辺 夏', '斉藤 二', '持田 陽飛', '王 小明'])
      expect([ok, surnameMatches(ok, list)]).toEqual([ok, true])
    for (const ng of ['佐藤 花子', '山田太郎', '湊谷 一郎', '高橋 優'])
      expect([ng, surnameMatches(ng, list)]).toEqual([ng, false])
  })

  it('移行用の招待で入った保護者は、名簿にない苗字のお子さんを登録できない（新規入会の人は関係ない）', async () => {
    const enroll = await import('@/app/actions/enroll')
    await db`insert into migration_roster (name) select unnest(${list}::text[])`
    const [mover] = await db<{ id: string }[]>`
      insert into profiles (display_name, join_route, terms_agreed_at, onboarded_at, guide_read_version)
      values ('移行母', 'existing', now(), now(), 999) returning id`
    tokens.mover = (await auth.createSession(mover.id, false)).token
    as('mover')
    const fd = (name: string) => {
      const f = new FormData()
      f.set('full_name', name)
      f.set('kana', 'てすと')
      f.set('grade', '3')
      return f
    }
    expect((await enroll.registerNewChild(fd('佐藤 花子'))).error).toMatch(/お問い合わせください/)
    expect(await enroll.registerNewChild(fd('山崎 次郎'))).not.toHaveProperty('error')

    // 新規入会の人は確認しない
    as('parentB')
    await db`update profiles set join_route = 'new' where id = ${ids.parentB}`
    expect(await enroll.registerNewChild(fd('佐藤 花子'))).not.toHaveProperty('error')

    // 管理者だけが名簿を入れ替えられる
    const rf = new FormData()
    rf.set('names', '佐藤 太郎')
    as('parentA')
    await expect(enroll.saveMigrationRoster(rf)).rejects.toThrow(/権限|管理者|Forbidden/i)
    as('admin')
    await expect(enroll.saveMigrationRoster(rf)).rejects.toThrow(/REDIRECT/)
    expect((await db`select name from migration_roster`).map((r) => r.name)).toEqual(['佐藤 太郎'])
  })

  it('会費ペイのCSV（Shift_JIS）から氏名を取り出せる', async () => {
    const { namesFromPaymentCsv } = await import('@/lib/migration-roster')
    const iconv = await import('node:child_process')
    const csv = '"請求番号","会員番号","氏名","コース"\r\n"1","10","山田 太郎","ジュニア教室"\r\n"2","11","鈴木花子","ジュニア教室"\r\n'
    const sjis = iconv.execFileSync('iconv', ['-f', 'UTF-8', '-t', 'CP932'], { input: csv })
    expect(namesFromPaymentCsv(sjis.buffer.slice(sjis.byteOffset, sjis.byteOffset + sjis.byteLength) as ArrayBuffer)).toEqual(['山田 太郎', '鈴木花子'])
  })
})
