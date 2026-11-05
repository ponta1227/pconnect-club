import { expect, test, type Page } from '@playwright/test'
import { addDaysJst, agreeTerms, finishOnboarding, loginAs, newUser, todayJst } from './helpers'

// 要件定義書 §19 の受け入れ基準に沿った一連の流れ
test.describe.serial('主要フロー', () => {
  let admin: Page
  let parent: Page
  let invitePath = ''
  let practiceUrl = ''
  let tournamentUrl = ''

  test.beforeAll(async ({ browser }) => {
    admin = (await newUser(browser)).page
    parent = (await newUser(browser)).page
  })

  test('管理者の初期設定', async () => {
    await admin.goto('/dev-login')
    await admin.getByRole('button', { name: '管理者として開始' }).click()
    await agreeTerms(admin)
    await finishOnboarding(admin)
    await expect(admin.getByText('木村直登')).toBeVisible()
  })

  test('クラス・名簿CSV・タブレットPIN・予定の登録', async () => {
    for (const name of ['選手', '初心者']) {
      await admin.goto('/admin/classes')
      await admin.getByPlaceholder('新しいクラス名').fill(name)
      await admin.getByRole('button', { name: '追加' }).click()
      await expect(admin.locator(`input[value="${name}"]`)).toBeVisible()
    }

    await admin.goto('/admin/roster/import')
    await admin.locator('input[name=file]').setInputFiles({
      name: 'roster.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('\uFEFF氏名,よみがな,学年,クラス\n山田太郎,やまだたろう,小3,選手\n山田花子,やまだはなこ,小1,初心者\n佐藤一郎,さとういちろう,中1,選手\n'),
    })
    await admin.getByRole('button', { name: '登録する' }).click()
    await expect(admin.getByText('3人を登録しました')).toBeVisible()

    await admin.goto('/admin/kiosk')
    await admin.locator('input[name=pin]').fill('1234')
    await admin.getByRole('button', { name: '保存' }).click()
    await expect(admin.getByText('PINを保存しました')).toBeVisible()

    // 今日の練習（集計に入るよう早い時刻にする）
    await admin.goto(`/events/new?date=${todayJst()}`)
    await admin.locator('input[name=title]').fill('練習')
    await admin.locator('input[name=start_time]').fill('00:05')
    await admin.getByRole('button', { name: '登録する' }).click()
    await admin.waitForURL(/\/events\/[0-9a-f-]{36}$/)
    practiceUrl = new URL(admin.url()).pathname

    // 大会（定員1・同行者あり・申込締切19日後 → 部内締めは5日後）
    await admin.goto('/events/new')
    await admin.locator('label').filter({ hasText: /^大会$/ }).click()
    await admin.locator('input[name=title]').fill('市民大会')
    await admin.locator('input[name=date]').fill(addDaysJst(20))
    await admin.locator('input[name=entry_deadline]').fill(`${addDaysJst(19)}T23:59`)
    await admin.locator('input[name=capacity]').fill('1')
    await admin.locator('input[name=allow_companions]').check()
    await admin.getByRole('button', { name: '登録する' }).click()
    await admin.waitForURL(/\/events\/[0-9a-f-]{36}$/)
    tournamentUrl = new URL(admin.url()).pathname
    await expect(admin.getByText(/部内締め:/)).toBeVisible()
    await expect(admin.getByText(/大会の申込締切（管理者のみ表示）/)).toBeVisible()
  })

  test('保護者が招待リンクで参加し、子どもを申請 → 管理者が承認', async () => {
    await admin.goto('/admin/invites')
    await admin.getByRole('button', { name: '招待リンクを発行' }).click()
    const url = await admin.locator('p.break-all').textContent()
    invitePath = new URL(url!).pathname

    await parent.goto(invitePath)
    await parent.locator('input[name=name]').fill('山田母')
    await parent.getByRole('button', { name: 'この名前で参加' }).click()
    await agreeTerms(parent)
    await expect(parent).toHaveURL(/step=children/)
    await parent.getByPlaceholder(/お子さんの名前/).fill('山田')
    for (const name of ['山田太郎', '山田花子']) {
      await parent.locator('li').filter({ hasText: name }).getByRole('button', { name: 'この子の保護者として申請' }).click()
      await expect(parent.locator('li').filter({ hasText: name }).getByText('承認待ち')).toBeVisible()
    }
    await finishOnboarding(parent)
    await expect(parent.getByText('お子さんの登録は管理者の承認待ちです')).toBeVisible()

    await admin.goto('/admin/approvals')
    await expect(admin.getByText('保護者の紐づけ申請 2件')).toBeVisible()
    for (let i = 0; i < 2; i++) {
      await admin.getByRole('button', { name: '承認', exact: true }).first().click()
      await expect(admin.getByText(`保護者の紐づけ申請 ${1 - i}件`)).toBeVisible()
    }
    await parent.goto('/')
    await expect(parent.getByText('今日の練習')).toBeVisible()
    await expect(parent.getByText('山田太郎')).toBeVisible()
    await expect(parent.getByText('未到着').first()).toBeVisible()
  })

  test('大会の参加登録：同行者・定員・キャンセル待ち・自動繰り上げ', async () => {
    await parent.goto(tournamentUrl)
    await expect(parent.getByText(/大会の申込締切/)).toHaveCount(0)
    await parent.locator('label').filter({ hasText: '山田太郎' }).locator('input').check()
    await parent.locator('select').filter({ hasText: '0人' }).selectOption('2')
    await parent.getByRole('button', { name: '参加する' }).click()
    const taro = parent.locator('li').filter({ hasText: '山田太郎' }).first()
    await expect(taro.getByText('参加', { exact: true })).toBeVisible()

    // 残り1人なので選択欄は出ず、ボタンに名前が出る
    await parent.getByRole('button', { name: '山田花子さん 参加する' }).click()
    await expect(parent.getByText('定員に達しているため、キャンセル待ちで登録しました')).toBeVisible()

    await taro.getByRole('button', { name: '取消' }).click()
    const hanako = parent.locator('li').filter({ hasText: '山田花子' }).first()
    await expect(hanako.getByText('参加', { exact: true })).toBeVisible()
  })

  test('会場タブレットで到着 → 保護者の画面に反映', async ({ browser }) => {
    const { page: kiosk } = await newUser(browser)
    await kiosk.goto('/kiosk')
    for (const d of ['1', '2', '3', '4']) await kiosk.getByRole('button', { name: d, exact: true }).click()
    await kiosk.getByRole('button', { name: 'OK' }).click()
    await expect(kiosk.getByText('到着 0 / 3')).toBeVisible()
    await kiosk.getByRole('button', { name: /山田太郎/ }).click()
    await kiosk.getByRole('button', { name: '到着！' }).click()
    await expect(kiosk.getByText('おつかれさま！到着を記録しました')).toBeVisible()

    await parent.goto(practiceUrl)
    await expect(parent.getByText('到着済み 1人')).toBeVisible()
    await parent.goto('/')
    await expect(parent.getByText(/✓ \d\d:\d\d 到着/)).toBeVisible()
  })

  test('欠席連絡は管理者だけが見られる', async ({ browser }) => {
    await parent.goto(practiceUrl)
    await parent.getByRole('button', { name: '山田花子さんの欠席・遅刻・早退を連絡' }).click()
    await parent.locator('input[name=reason]').fill('発熱のため')
    await parent.getByRole('button', { name: '連絡する' }).click()
    await expect(parent.getByText('発熱のため')).toBeVisible()

    await admin.goto(practiceUrl)
    await expect(admin.getByText('欠席・遅刻・早退（管理者のみ） 1件')).toBeVisible()
    await expect(admin.getByText('発熱のため')).toBeVisible()

    // 別の保護者には見えない
    const { page: other } = await newUser(browser)
    await other.goto(invitePath)
    await other.locator('input[name=name]').fill('佐藤父')
    await other.getByRole('button', { name: 'この名前で参加' }).click()
    await agreeTerms(other)
    await finishOnboarding(other)
    await other.goto(practiceUrl)
    await expect(other.getByText('到着済み 1人')).toBeVisible()
    await expect(other.getByText('発熱のため')).toHaveCount(0)
    await expect(other.getByText(/管理者のみ/)).toHaveCount(0)

    // 権限：管理画面・管理者用CSVには入れない
    await other.goto('/admin')
    await expect(other).toHaveURL(/\/$/)
    const res = await other.request.get(`/api${tournamentUrl}/participants.csv`)
    expect(res.status()).toBe(403)

    // 退会
    await other.goto('/settings')
    await other.getByText('退会する', { exact: true }).first().click()
    await other.locator('input[name=confirm]').fill('退会')
    await other.getByRole('button', { name: '退会する' }).click()
    await expect(other).toHaveURL(/\/login/)
  })

  test('子どもアカウント：保護者が発行 → 管理者が承認 → 機能制限', async ({ browser }) => {
    await parent.goto('/children')
    const section = parent.locator('section').filter({ hasText: '山田太郎' }).filter({ hasText: '子どもアカウント（本人用）' })
    await section.getByRole('button', { name: '子どもアカウントを作る' }).click()
    await section.locator('input[type=checkbox]').check()
    await section.getByRole('button', { name: '招待リンクを作る' }).click()
    const url = await section.locator('p.break-all').textContent()

    const { page: child } = await newUser(browser)
    await child.goto(new URL(url!).pathname)
    await child.locator('input[name=name]').fill('たろう')
    await child.getByRole('button', { name: 'この名前で参加' }).click()
    await expect(child).toHaveURL(/\/pending/)
    await expect(child.getByRole('heading', { name: '承認をお待ちください' })).toBeVisible()

    await admin.goto('/admin/approvals')
    await expect(admin.getByText('子どもアカウント 1件')).toBeVisible()
    await admin.getByRole('button', { name: '承認', exact: true }).click()
    await expect(admin.getByText('子どもアカウント 0件')).toBeVisible()

    await child.goto('/')
    await agreeTerms(child)
    await expect(child).toHaveURL(/\/$/)
    await expect(child.getByRole('link', { name: 'チャット' })).toHaveCount(0)
    await child.goto(practiceUrl)
    await expect(child.getByText(/に到着しました/)).toBeVisible()
    await expect(child.getByText(/到着済み/)).toHaveCount(0)
    await child.goto(tournamentUrl)
    await expect(child.getByRole('heading', { name: '参加者' })).toHaveCount(0)
    await child.goto('/members')
    await expect(child).toHaveURL(/\/$/)
  })

  test('掲示板：緊急投稿＋アンケート、既読・コメント・スタンプ', async () => {
    await admin.goto('/board/new')
    await admin.locator('input[name=title]').fill('台風のため練習中止')
    await admin.locator('textarea[name=body]').fill('本日の練習は中止です。')
    await admin.locator('input[name=urgent]').check()
    await admin.getByText('アンケート・日程調整を付ける').click()
    await admin.locator('input[name=poll_question]').fill('振替練習に参加しますか')
    await admin.locator('textarea[name=poll_options]').fill('参加する\n参加しない')
    await admin.getByRole('button', { name: '緊急で投稿する' }).click()
    await admin.waitForURL(/\/board\/[0-9a-f-]{36}$/)
    const postUrl = new URL(admin.url()).pathname

    await parent.goto('/')
    await parent.getByText('台風のため練習中止').click()
    await expect(parent).toHaveURL(postUrl)
    await parent.locator('label').filter({ hasText: '参加する' }).click()
    await parent.getByRole('button', { name: '回答する' }).click()
    await expect(parent.getByText('回答 1/')).toBeVisible()
    await parent.getByPlaceholder('コメントを書く').fill('ありがとうございます')
    await parent.getByRole('button', { name: '送信' }).click()
    await expect(parent.getByText('ありがとうございます')).toBeVisible()
    await parent.getByRole('button', { name: '＋スタンプ' }).click()
    await parent.getByRole('button', { name: '👍' }).click()
    await expect(parent.getByRole('button', { name: /👍\s*1/ })).toBeVisible()

    await admin.goto(postUrl)
    const readers = admin.locator('details').filter({ hasText: '管理者のみ一覧を表示' })
    await readers.locator('summary').click()
    await expect(readers.getByText(/山田母/)).toBeVisible()
  })

  test('チャット：ルーム作成・送信・新着の反映', async () => {
    await admin.goto('/chat/new')
    await admin.locator('input[name=name]').fill('大会連絡')
    await admin.locator('label').filter({ hasText: '山田母' }).locator('input').check()
    await admin.getByRole('button', { name: '作成する' }).click()
    await admin.waitForURL(/\/chat\/[0-9a-f-]{36}$/)
    await admin.getByPlaceholder('メッセージ').fill('よろしくお願いします')
    await admin.getByRole('button', { name: '送信' }).click()
    await expect(admin.getByText('よろしくお願いします')).toBeVisible()

    await parent.goto('/chat')
    await parent.getByText('大会連絡').click()
    await expect(parent.getByText('よろしくお願いします')).toBeVisible()
    await parent.getByPlaceholder('メッセージ').fill('こちらこそ')
    await parent.getByRole('button', { name: '送信' }).click()
    await expect(admin.getByText('こちらこそ')).toBeVisible({ timeout: 20_000 })
  })

  test('月次の出席集計とCSV出力', async () => {
    await admin.goto('/admin/attendance')
    const row = admin.locator('tr').filter({ hasText: '山田太郎' })
    await expect(row.locator('td').nth(2)).toHaveText('1')
    await expect(admin.locator('tr').filter({ hasText: '山田花子' }).locator('td').nth(5)).toHaveText('1')

    const csv = await admin.request.get(`/api${tournamentUrl}/participants.csv`)
    expect(csv.status()).toBe(200)
    const text = await csv.text()
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain('山田花子')

    const anon = await admin.context().browser()!.newContext()
    const res = await anon.request.get('/api/files/00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(401)
    await anon.close()
  })
})
