import { expect, test, type Page } from '@playwright/test'
import { addDaysJst, agreeTerms, finishOnboarding, loginAs, newUser, setEmailCode, todayDow, todayJst } from './helpers'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

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
    await expect(admin.getByRole('heading', { name: 'やること' })).toBeVisible()
    await expect(admin.getByRole('heading', { name: 'クラブの状況（管理者）' })).toBeVisible()
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

    // 今日の練習（種別・タイトルは最初から「練習」。まだ終わっていない時間帯にしてホームの帯に出す）
    await admin.goto(`/events/new?date=${todayJst()}`)
    await expect(admin.locator('input[name=title]')).toHaveValue('練習')
    await admin.locator('input[name=start_time]').fill('00:05')
    await admin.locator('input[name=end_time]').fill('23:55')
    await admin.getByRole('button', { name: '登録する' }).click()
    await admin.waitForURL(/\/events\/[0-9a-f-]{36}$/)
    practiceUrl = new URL(admin.url()).pathname

    // 大会（定員1・同行者あり・申込締切19日後 → 部内締めは自動で5日後）。登録と同時に掲示板へお知らせも出す
    await admin.goto('/events/new?kind=rsvp')
    await admin.locator('label').filter({ hasText: /^大会$/ }).click()
    await admin.locator('input[name=title]').fill('市民大会')
    await admin.locator('input[name=date]').fill(addDaysJst(20))
    await admin.locator('textarea[name=fee_note]').fill('参加費 1,500円')
    await admin.locator('input[name=entry_deadline]').fill(`${addDaysJst(19)}T23:59`)
    await expect(admin.getByText('申込締切の2週間前に自動で決まります')).toBeVisible()
    await admin.getByText('くわしい設定').click()
    await admin.locator('input[name=capacity]').fill('1')
    await admin.locator('input[name=allow_companions]').check()
    await admin.getByRole('button', { name: '登録して、お知らせを出す' }).click()
    await admin.waitForURL(/\/events\/[0-9a-f-]{36}$/)
    tournamentUrl = new URL(admin.url()).pathname
    await expect(admin.getByText(/部内締め: /)).toBeVisible()
    await expect(admin.getByText(/大会の申込締切:/)).toBeVisible()
    await expect(admin.getByRole('heading', { name: 'まだ何もしていない 3人' })).toBeVisible()

    // お知らせが自動で作られ、予定が付いている
    await admin.goto('/board')
    const card = admin.locator('a').filter({ hasText: '市民大会' })
    await expect(card.getByText('予定つき')).toBeVisible()
  })

  test('練習日程：1か月ぶんをまとめて入れて、1日だけ休みにする', async () => {
    const next = addDaysJst(32).slice(0, 7)
    await admin.goto(`/admin/schedule?ym=${next}`)
    await admin.getByRole('button', { name: /いつもの練習をまとめて入れる/ }).click()
    await expect(admin.getByText(/日ぶんの練習を入れました/)).toBeVisible()
    await expect(admin.getByText('この月は、いつもの練習がすべて入っています。')).toBeVisible()
    await admin.getByRole('button', { name: /日\(月\) 18:30から 朝霞市総合体育館/ }).first().click()
    await admin.getByRole('button', { name: '休みにする' }).click()
    await expect(admin.getByRole('button', { name: /日\(月\) 休み/ })).toHaveCount(1)
    // 休みにした日は、まとめて入れ直しても上書きされない
    await admin.getByRole('button', { name: /日\(月\) 休み/ }).click()
    await admin.getByRole('button', { name: '休みを取り消す（練習あり）' }).click()
    await expect(admin.getByRole('button', { name: /日\(月\) 休み/ })).toHaveCount(0)
  })

  test('保護者が招待リンクで参加し、子どもを申請 → 管理者が承認', async () => {
    await admin.goto('/admin/invites')
    await admin.getByRole('button', { name: '移行用の招待リンクを発行' }).click()
    const url = await admin.locator('p.break-all').textContent()
    invitePath = new URL(url!).pathname

    await parent.goto(invitePath)
    await parent.locator('input[name=name]').fill('山田母')
    await parent.getByRole('button', { name: 'この名前で参加' }).click()
    await agreeTerms(parent)
    await expect(parent).toHaveURL(/step=children/)
    // 保護者が名前を入力して登録する（名簿に同じ名前の子がいれば、その子につながる）
    for (const [name, kana] of [['山田 太郎', 'やまだ たろう'], ['山田花子', 'やまだ はなこ']]) {
      await parent.locator('input[name=full_name]').fill(name)
      await parent.locator('input[name=kana]').fill(kana)
      await parent.getByRole('button', { name: 'このお子さんを登録' }).click()
      await expect(parent.locator('section').filter({ hasText: name.replace(' ', '') }).getByText('承認待ち')).toBeVisible()
    }
    // 同じ子を2回は登録できない
    await parent.locator('input[name=full_name]').fill('山田花子')
    await parent.locator('input[name=kana]').fill('やまだ はなこ')
    await parent.getByRole('button', { name: 'このお子さんを登録' }).click()
    await expect(parent.getByText('このお子さんはすでに登録しています')).toBeVisible()
    // 参加曜日：太郎はきょうの曜日だけ（週1日）、花子はきょう＋もう1日（週2日以上）
    const today = DOW[todayDow()]
    const other = DOW[(todayDow() + 2) % 7 === 5 ? (todayDow() + 3) % 7 : (todayDow() + 2) % 7] // 金曜日は参加曜日にできない
    const taroCard = parent.locator('section').filter({ hasText: '山田太郎' })
    await taroCard.getByRole('button', { name: new RegExp(`^${today}`) }).click()
    await taroCard.getByRole('button', { name: 'この曜日で決める' }).click()
    await expect(taroCard.getByText(`参加曜日: ${today}`)).toBeVisible()
    await taroCard.getByRole('button', { name: '増やす' }).click()
    await taroCard.getByRole('button', { name: '増やす' }).click()
    await taroCard.getByRole('button', { name: '申告する' }).click()
    await expect(taroCard.getByText('いまの振替の回数は申告済みです')).toBeVisible()
    const hanaCard = parent.locator('section').filter({ hasText: '山田花子' })
    await hanaCard.getByRole('button', { name: new RegExp(`^${today}`) }).click()
    await hanaCard.getByRole('button', { name: new RegExp(`^${other}`) }).click()
    await hanaCard.getByRole('button', { name: 'この曜日で決める' }).click()
    await expect(hanaCard.getByText('（週2日以上）')).toBeVisible()
    await hanaCard.getByRole('button', { name: '申告する' }).click()
    await expect(parent.getByRole('link', { name: '次へ', exact: true })).toBeVisible()
    await finishOnboarding(parent)
    await expect(parent.getByText('お子さんの登録は管理者の承認待ちです')).toBeVisible()

    await admin.goto('/admin/approvals')
    await expect(admin.getByText('保護者の紐づけ申請 2件')).toBeVisible()
    await expect(admin.getByText('申告した振替: 2回')).toBeVisible()
    for (let i = 0; i < 2; i++) {
      await admin.getByRole('button', { name: '承認', exact: true }).first().click()
      await expect(admin.getByText(`保護者の紐づけ申請 ${1 - i}件`)).toBeVisible()
    }
    await parent.goto('/')
    await expect(parent.getByText(/きょうの練習/)).toBeVisible()
    await expect(parent.getByRole('button', { name: '山田太郎 欠席・遅刻を連絡' })).toBeVisible()
  })

  test('大会の回答：ホームからそのまま参加・非表示、定員・キャンセル待ち・自動繰り上げ', async () => {
    // ホームの「やること」に大会が出て、その場で回答できる
    await parent.goto('/')
    const todo = parent.locator('article').filter({ hasText: '市民大会' })
    await expect(todo.getByText('参加費 1,500円')).toBeVisible()
    await parent.getByRole('button', { name: '山田太郎 参加する' }).click()
    const taro = parent.locator('li').filter({ hasText: '山田太郎' }).filter({ hasText: '同行する人' })
    await expect(taro.getByText('✓ 参加')).toBeVisible()
    await taro.getByRole('button', { name: '同行者を増やす' }).click()
    await expect(taro.getByText('1人')).toBeVisible()

    // 定員1なので、2人目はキャンセル待ち
    await parent.getByRole('button', { name: '山田花子 参加する' }).click()
    const answered = parent.locator('article').filter({ hasText: '市民大会' })
    await expect(answered.getByText('キャンセル待ち', { exact: true })).toBeVisible()
    // 全員ぶん回答したので「やること」は空になる（お知らせも既読になる）
    await expect(parent.getByText('いま対応が必要なことはありません')).toBeVisible()

    // 見送るボタンは無い
    await expect(parent.getByRole('button', { name: /見送る/ })).toHaveCount(0)
    // 太郎の参加を取り消すと、花子が自動で繰り上がる。太郎はまた「参加する」を押せる
    await parent.getByRole('button', { name: '山田太郎 の参加を取り消す' }).click()
    await expect(answered.getByRole('button', { name: '山田太郎 参加する' })).toBeVisible()
    await expect(answered.getByText('✓ 参加')).toBeVisible()
    await expect(answered.getByText('キャンセル待ち', { exact: true })).toHaveCount(0)

    // 出ない大会は「非表示」でホームから消せる
    await parent.getByRole('button', { name: '市民大会 を非表示にする' }).click()
    await expect(parent.getByText('いま対応が必要なことはありません')).toBeVisible()

    // 掲示板のお知らせの中でも回答が見える。申込締切は保護者には見えない
    await parent.goto('/board')
    await parent.locator('a').filter({ hasText: '市民大会' }).click()
    await expect(parent.getByText('参加しますか？')).toBeVisible()
    await expect(parent.getByRole('button', { name: '山田花子 の参加を取り消す' })).toBeVisible()
    // 非表示にしても、予定・お知らせからはあとで参加できる
    await expect(parent.getByRole('button', { name: '山田太郎 参加する' })).toBeVisible()
    await parent.goto(tournamentUrl)
    await expect(parent.getByText(/大会の申込締切/)).toHaveCount(0)
    await expect(parent.getByText(/回答の状況/)).toHaveCount(0)

    // 管理者：回答状況が数字で見え、聞き取った回答を代わりに入力できる
    await admin.goto(tournamentUrl)
    await expect(admin.getByRole('heading', { name: 'まだ何もしていない 1人' })).toBeVisible()
    await expect(admin.getByText('保護者が未登録のため、通知が届きません')).toBeVisible()
    await expect(admin.getByRole('button', { name: '未回答の保護者に催促を送る' })).toBeDisabled()
    await admin.getByRole('button', { name: '佐藤一郎 を見送りにする' }).click()
    await expect(admin.getByText('全員が回答済みです。')).toBeVisible()
    await expect(admin.getByText('非表示・見送り 2人')).toBeVisible()
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
    // ホームの青い帯から、そのまま欠席を連絡できる
    await parent.goto('/')
    await parent.getByRole('button', { name: '山田花子 欠席・遅刻を連絡' }).click()
    await parent.getByPlaceholder('例: 学校行事のため').fill('発熱のため')
    await parent.getByRole('button', { name: '欠席を連絡する' }).click()
    await expect(parent.getByText(/欠席\s*連絡済み/)).toBeVisible()
    await expect(parent.getByRole('button', { name: '山田花子 連絡を変更' })).toBeVisible()

    await admin.goto(practiceUrl)
    await expect(admin.getByText('欠席・遅刻・早退（管理者のみ） 1件')).toBeVisible()
    await expect(admin.getByText('発熱のため')).toBeVisible()
    // 参加曜日の欠席なので、花子に振替が1回たまり、参加予定から外れる
    await expect(admin.getByRole('heading', { name: '参加予定 1人（管理者のみ）' })).toBeVisible()
    await parent.goto('/children')
    const hana = parent.locator('section').filter({ hasText: '山田花子' }).filter({ hasText: '振替の残り' })
    await expect(hana.getByText(/振替の残り:\s*1回/)).toBeVisible()

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
    await other.goto('/admin/schedule')
    await expect(other).toHaveURL(/\/$/)
    await other.goto('/events/new')
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


  test('参加曜日以外の練習は、振替を使って参加できる（取り消すと戻る）', async () => {
    // 来月の練習（練習日程のテストで入れたもの）から、太郎の参加曜日ではない日を開く
    const otherDow = DOW[(todayDow() + 1) % 7]
    await admin.goto(`/admin/schedule?ym=${addDaysJst(32).slice(0, 7)}`)
    const day = admin.getByRole('button', { name: new RegExp(`日\\(${otherDow}\\) \\d\\d:\\d\\dから`) }).first()
    test.skip((await day.count()) === 0, 'この曜日の練習枠がないため')
    await day.click()
    await admin.getByRole('link', { name: '予定の画面を開く' }).click()
    await admin.waitForURL(/\/events\/[0-9a-f-]{36}$/)
    const otherPractice = new URL(admin.url()).pathname

    await parent.goto(otherPractice)
    await expect(parent.getByText(/振替の残り\s*2回/)).toBeVisible()
    await parent.getByRole('button', { name: '山田太郎 振替でこの練習に参加する' }).click()
    await expect(parent.locator('li').filter({ hasText: '山田太郎' }).getByText('振替で参加')).toBeVisible()
    await expect(parent.getByText(/振替の残り\s*1回/)).toBeVisible()
    // 週2日以上の花子は、振替を使わずに参加できる
    await expect(parent.getByRole('button', { name: '山田花子 この練習に参加する' })).toBeVisible()

    await admin.goto(otherPractice)
    await expect(admin.locator('section').filter({ hasText: '参加予定' }).getByText('振替')).toBeVisible()

    await parent.goto(otherPractice)
    await parent.getByRole('button', { name: '山田太郎 の参加を取り消す' }).click()
    await expect(parent.getByText(/振替の残り\s*2回/)).toBeVisible()

    // 管理者が自主練に切り替えると、だれでも振替なしで「参加する」を押せる
    await admin.goto(`/admin/schedule?ym=${addDaysJst(32).slice(0, 7)}`)
    await admin.getByRole('button', { name: new RegExp(`日\\(${otherDow}\\) \\d\\d:\\d\\dから`) }).first().click()
    await admin.getByRole('button', { name: '自主練に切り替える' }).click()
    await expect(admin.getByRole('button', { name: new RegExp(`日\\(${otherDow}\\) 自主練`) }).first()).toBeVisible()
    await parent.goto(otherPractice)
    await expect(parent.getByRole('heading', { name: '自主練に参加' })).toBeVisible()
    await parent.getByRole('button', { name: '山田太郎 この自主練に参加する' }).click()
    await expect(parent.locator('li').filter({ hasText: '山田太郎' }).getByText('参加', { exact: true })).toBeVisible()
    await expect(parent.getByText(/振替の残り/)).toHaveCount(0)
  })
  test('子どもアカウント：保護者が発行 → 管理者が承認 → 機能制限', async ({ browser }) => {
    await parent.goto('/children')
    const section = parent.locator('section').filter({ hasText: '山田太郎' }).filter({ hasText: '子どもアカウント（本人用）' })
    await section.getByRole('button', { name: '子どもアカウントを作る' }).click()
    await section.getByLabel('山田太郎 のログインID').fill('ab')
    await section.getByLabel('山田太郎 のパスワード').fill('taro123')
    await section.locator('input[type=checkbox]').check()
    await section.getByRole('button', { name: 'このIDとパスワードで作る' }).click()
    await expect(section.getByText(/ログインIDは、半角/)).toBeVisible()
    await section.getByLabel('山田太郎 のログインID').fill('Taro2015')
    await section.getByRole('button', { name: 'このIDとパスワードで作る' }).click()
    await expect(section.getByText('taro2015')).toBeVisible()

    // 子どもはLINEなしで、IDとパスワードでログイン（まちがえると入れない）
    const { page: child } = await newUser(browser)
    await child.goto('/login')
    await child.getByRole('link', { name: '子ども用アカウントでログイン' }).click()
    await child.locator('input[name=login_id]').fill('taro2015')
    await child.locator('input[name=password]').fill('wrong-pass')
    await child.getByRole('button', { name: 'ログイン' }).click()
    await expect(child.getByText('ログインIDかパスワードがちがいます')).toBeVisible()
    await child.locator('input[name=password]').fill('taro123')
    await child.getByRole('button', { name: 'ログイン' }).click()
    await expect(child).toHaveURL(/\/pending/)
    await expect(child.getByRole('heading', { name: '承認をお待ちください' })).toBeVisible()

    await admin.goto('/admin/approvals')
    await expect(admin.getByText('子どもアカウント 1件')).toBeVisible()
    await admin.getByRole('button', { name: '承認', exact: true }).click()
    await expect(admin.getByText('子どもアカウント 0件')).toBeVisible()

    await child.goto('/')
    await agreeTerms(child)
    await expect(child).toHaveURL(/\/$/)
    await expect(child.getByText(/クラブの状況/)).toHaveCount(0)
    await expect(child.getByRole('link', { name: 'チャット' })).toHaveCount(0)
    await child.goto(practiceUrl)
    await expect(child.getByText(/✓ \d\d:\d\d 到着/)).toBeVisible()
    await expect(child.getByText(/到着済み/)).toHaveCount(0)
    await child.goto(tournamentUrl)
    await expect(child.getByText('参加しますか？')).toBeVisible()
    await expect(child.getByRole('heading', { name: /参加者/ })).toHaveCount(0)
    await expect(child.getByText(/回答の状況/)).toHaveCount(0)
    await child.goto('/members')
    await expect(child).toHaveURL(/\/$/)

    // 保護者がパスワードを変えると、子どもの端末はログアウトされ、新しいパスワードで入れる
    await parent.goto('/children')
    const sec2 = parent.locator('section').filter({ hasText: '山田太郎' }).filter({ hasText: '利用中' })
    await expect(sec2.getByText('taro2015')).toBeVisible()
    await sec2.getByRole('button', { name: 'パスワードを変える' }).click()
    await sec2.getByLabel('山田太郎 の新しいパスワード').fill('newpass9')
    await sec2.getByRole('button', { name: '変える', exact: true }).click()
    await expect(sec2.getByText('新しいパスワードにしました')).toBeVisible()
    await child.goto('/')
    await expect(child).toHaveURL(/\/login/)
    await child.goto('/login/kid')
    await child.locator('input[name=login_id]').fill('taro2015')
    await child.locator('input[name=password]').fill('newpass9')
    await child.getByRole('button', { name: 'ログイン' }).click()
    await expect(child).toHaveURL(/\/$/)

    // 保護者が無効にしたら、APIからも何も読めない
    await parent.goto('/children')
    await parent.locator('section').filter({ hasText: '山田太郎' }).filter({ hasText: '利用中' }).getByRole('button', { name: '無効にする' }).click()
    await expect(parent.locator('section').filter({ hasText: '山田太郎' }).getByRole('button', { name: '子どもアカウントを作る' })).toBeVisible()
    const api = await child.request.get('/api/chat/00000000-0000-0000-0000-000000000000/messages')
    expect(api.status()).toBe(401)
    await child.goto('/')
    await expect(child).toHaveURL(/\/login|\/pending/)
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
    await expect(parent.getByText('アンケートに回答')).toBeVisible()
    await parent.getByText('台風のため練習中止').first().click()
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
    await expect(admin.getByRole('heading', { name: '読まれた状況（管理者のみ）' })).toBeVisible()
    const readers = admin.locator('details').filter({ hasText: '読んだ人' })
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
  test('管理者が「保護者の表示」に切り替えて、管理者に戻す', async () => {
    await admin.goto('/admin')
    await admin.getByRole('button', { name: '保護者の表示で見る' }).click()
    await expect(admin.getByText('保護者の表示で見ています')).toBeVisible()
    await admin.goto('/more')
    await expect(admin.getByText('管理者メニュー')).toHaveCount(0)
    // 管理者の画面には入れない（一般の保護者と同じ）
    await admin.goto('/admin/roster')
    await expect(admin).not.toHaveURL(/\/admin/)
    const csv = await admin.request.get('/api/admin/attendance.csv')
    expect(csv.status()).not.toBe(200)
    await admin.getByRole('button', { name: '管理者に戻す' }).click()
    await expect(admin).toHaveURL(/\/admin$/)
    await expect(admin.getByText('保護者の表示で見ています')).toHaveCount(0)
    await expect(admin.getByRole('link', { name: /名簿/ })).toBeVisible()
  })
  test('クラブのご案内：いつでも見られて、更新したら保護者にもう一度確認してもらう', async () => {
    await parent.goto('/more')
    await parent.getByRole('link', { name: /クラブのご案内/ }).click()
    await expect(parent.getByRole('heading', { name: /自主練の利用/ })).toBeVisible()
    await expect(parent.getByRole('button', { name: '確認しました' })).toHaveCount(0)

    await admin.goto('/admin/rules')
    const box = admin.locator('textarea[name=guide_text]')
    await box.fill((await box.inputValue()) + '\n\n## ⑦ テストの追記\n新しいお約束です。')
    await admin.locator('input[name=reconfirm]').check()
    await admin.getByRole('button', { name: '保存する' }).click()
    await expect(admin.getByText('保存しました。')).toBeVisible()

    await parent.goto('/')
    await parent.getByRole('link', { name: /クラブのご案内/ }).click()
    await expect(parent.getByText('新しいお約束です。')).toBeVisible()
    await parent.getByRole('button', { name: '確認しました' }).click()
    await expect(parent.getByRole('button', { name: '確認しました' })).toHaveCount(0)
    await parent.goto('/')
    await expect(parent.getByRole('link', { name: /クラブのご案内/ })).toHaveCount(0)
  })
  test('LINEを使っていない保護者：メールアドレスと確認コードで参加・ログイン', async ({ browser }) => {
    const { page: mom } = await newUser(browser)
    // 招待なしで知らないメールアドレスは入れない
    await mom.goto('/login')
    await mom.getByRole('link', { name: 'メールアドレスでログイン' }).click()
    await mom.locator('input[name=email]').fill('stranger@example.com')
    await mom.getByRole('button', { name: '確認コードを送る' }).click()
    await expect(mom.getByText(/このメールアドレスは登録されていません/)).toBeVisible()

    // 招待リンクから、名前とメールで参加
    await mom.goto(invitePath)
    // テストはスマホの画面なので、まずホーム画面への追加が案内される
    await mom.getByRole('button', { name: '追加せずに、このまま登録する' }).click()
    await mom.getByRole('link', { name: /メールアドレスで参加/ }).click()
    await mom.waitForURL(/\/login\/email\?invite=/)
    await mom.waitForLoadState('networkidle') // 開発サーバーの再コンパイルで入力が消えないように
    await mom.locator('input[name=name]').fill('鈴木母')
    await mom.locator('input[name=email]').fill('Suzuki@Example.com')
    await mom.getByRole('button', { name: '確認コードを送る' }).click()
    await expect(mom).toHaveURL(/step=code/)
    await setEmailCode('suzuki@example.com', '246810')
    await mom.locator('input[name=code]').fill('111111')
    await mom.getByRole('button', { name: 'ログイン' }).click()
    await expect(mom.getByText(/確認コードがちがいます/)).toBeVisible()
    await mom.locator('input[name=code]').fill('246810')
    await mom.getByRole('button', { name: 'ログイン' }).click()
    await agreeTerms(mom)
    await finishOnboarding(mom)
    await mom.goto('/more')
    await expect(mom.getByText('鈴木母')).toBeVisible()

    // 別の端末から、同じメールアドレスでログインすると同じアカウントに入る
    const { page: again } = await newUser(browser)
    await again.goto('/login/email')
    await again.waitForLoadState('networkidle')
    await again.locator('input[name=email]').fill('suzuki@example.com')
    await expect(again.locator('input[name=name]')).toHaveCount(0)
    await again.getByRole('button', { name: '確認コードを送る' }).click()
    await expect(again).toHaveURL(/step=code/)
    await setEmailCode('suzuki@example.com', '135790')
    await again.locator('input[name=code]').fill('135 790')
    await again.getByRole('button', { name: 'ログイン' }).click()
    await expect(again).toHaveURL(/\/$/)
    await again.goto('/more')
    await expect(again.getByText('鈴木母')).toBeVisible()
  })
  test('招待リンクをスマホで開くと、まずホーム画面への追加を案内する', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    })
    const phone = await ctx.newPage()
    await phone.goto(invitePath)
    await expect(phone.getByText('まず、このアプリをホーム画面に追加してください')).toBeVisible()
    await expect(phone.getByText('「ホーム画面に追加」を選ぶ')).toBeVisible()
    await expect(phone.getByRole('link', { name: 'LINEでログインして参加' })).toHaveCount(0)
    await phone.getByRole('button', { name: '追加せずに、このまま登録する' }).click()
    await expect(phone.getByRole('link', { name: 'LINEでログインして参加' })).toBeVisible()

    // ここから追加したアイコンは、この招待の続きを開く
    const m = await (await phone.request.get(`${invitePath}/manifest.webmanifest`)).json()
    expect(m.start_url).toBe(invitePath)
    expect((await (await phone.request.get('/manifest.webmanifest')).json()).start_url).toBe('/')

    // LINEの中で開いたときは、ブラウザで開き直すよう案内する
    const lineCtx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.0.0' })
    const inLine = await lineCtx.newPage()
    await inLine.goto(invitePath)
    await expect(inLine.getByText('LINEの中で開いています')).toBeVisible()

    // 登録済みの人がアイコン（招待リンク）から開いたら、ホームへ
    await parent.goto(invitePath)
    await expect(parent).toHaveURL(/\/$/)
    await ctx.close()
    await lineCtx.close()
  })
  test('Googleフォーム：BANDから移行する人には別のフォームだと目立たせ、開くまで進めない', async ({ browser }) => {
    await admin.goto('/admin/invites')
    await admin.locator('input[name=form_url]').fill('https://example.com/new-form')
    await admin.getByRole('button', { name: '保存する' }).click()
    await expect(admin.getByText('保存しました。')).toBeVisible()

    const { page: mover } = await newUser(browser)
    await mover.goto(invitePath)
    await mover.locator('input[name=name]').fill('移行テスト母')
    await mover.getByRole('button', { name: 'この名前で参加' }).click()
    await agreeTerms(mover)
    await expect(mover).toHaveURL(/step=form/)
    await expect(mover.getByText('以前のGoogleフォームとは別のフォームです')).toBeVisible()
    const done = mover.getByRole('button', { name: '送信しました' })
    await expect(done).toBeDisabled()
    const popup = mover.waitForEvent('popup')
    await mover.getByRole('link', { name: 'Googleフォームを開く' }).click()
    await (await popup).close()
    await expect(done).toBeEnabled()
    await done.click()
    await expect(mover).toHaveURL(/step=guide/)

    // ほかのテストに影響しないよう戻す
    await admin.goto('/admin/invites')
    await admin.locator('input[name=form_url]').fill('')
    await admin.getByRole('button', { name: '保存する' }).click()
    await expect(admin.getByText('保存しました。')).toBeVisible()
  })
})
