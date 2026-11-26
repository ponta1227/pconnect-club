# CLAUDE.md — このリポジトリで作業するときの約束

@AGENTS.md

## 概要
卓球クラブ P-CONNECT Jr. 専用の連絡アプリ（BAND の置き換え）。利用者は保護者が中心で、UIはすべて日本語・スマホ最優先。
運用者（木村さん）は非エンジニアなので、修正後は「何が変わったか」を平易な日本語で伝えること。

## 構成
- Next.js 16（App Router）。**Cache Components は無効**（全画面がユーザーごとの動的表示）。`middleware` ではなく各ページで `requireUser()` を呼ぶ。
- `cookies()` `params` `searchParams` は非同期。ページの props は `PageProps<'/path'>`、ルートは `RouteContext<'/path'>` を使う（`npx next typegen` で型生成）。
- DB: `src/lib/db.ts` の `sql`（postgres v4）。**v4 はパラメータの型をサーバーが決める**ため、配列は `${ids}::uuid[]`、型が決まらない場所の日付は `::timestamptz` のようにキャストする。
- スキーマ変更は `db/migrations/000N_xxx.sql` を**追加**する（既存ファイルは編集しない）。`npm run migrate` で適用。新しいテーブルにも RLS を有効化すること。
- 時刻はすべて日本時間で扱う。`src/lib/time.ts` の関数（`fromJst`, `jstDateStr`, `fmtDateTime` …）を使い、`toLocaleString` を直接使わない。

## 権限（必ず守る）
- `src/lib/auth.ts`: `requireUser` / `requireAdult`（子どもアカウント不可）/ `requireAdmin`、Server Action では `assertAdmin` / `assertAdult`。
- 子どもアカウントは「予定の閲覧・本人の欠席連絡と参加登録・掲示板の閲覧とコメント・写真資料の閲覧」だけ。到着一覧・メンバー一覧・他の子の氏名・欠席理由・チャット（追加されたルーム以外）を見せない。
- 欠席・遅刻・早退の一覧、出席集計、支払いメモ、既読者一覧、大会の申込締切は**管理者のみ**。
- 管理者でも参加していないチャットルームは見られない。
- 新しい Server Action / API を作ったら、未ログイン・他の保護者・子どもアカウントで呼んだときに弾かれることを確認する。

## 画面の考え方（v1.3 の再設計）
- 保護者のホームは「やること」が中心。回答が必要な大会・未読のお知らせ・未回答アンケートは `src/lib/todo.ts` の `getTodos()` が決める（下のタブのバッジも同じ数）。新しく「対応が必要なもの」を増やすときはここに足す。
- 大会・イベントの回答は `answerRsvp(eventId, childId, 'going' | 'declined')`。**未回答＝rsvps に行が無い**、見送り＝`status='declined'`（保護者の画面には見送るボタンは無く、管理者の代理入力だけ）。参加人数を数えるときは `declined` を除くこと。回答の部品は `src/components/rsvp.tsx`（ホーム・予定・掲示板で共通）。保護者は「参加する」と「取り消す」だけ。
- 出ない大会はホームのカードの「非表示」（`hideRsvpTodo` → `rsvp_hidden` テーブル）。やること・締切リマインド・催促から外れ、紐づくお知らせは既読になる。回答は変えないので、予定やお知らせからあとで参加できる。
- 参加費の徴収は `rsvps.paid` / `payment_note`（管理者のみ）。大会の画面の参加者ごとに「参加費 未徴収／✓ 徴収済み」ボタン（`PaymentCell`）と「徴収済み N / M人」。キャンセル待ちには出さない。
- 欠席・遅刻・早退は `src/components/absence.tsx`（下から出るシート）。
- 大会を登録すると掲示板のお知らせ（`posts.event_id`）が自動で作られる。回答するとそのお知らせは既読になる。
- 練習日程は `/admin/schedule`（`src/app/actions/schedule.ts`、「いつもの練習」は `practice_slots` テーブル）。
- 色は「卓球台の青（brand）＝骨組み」「ボールのオレンジ（ball）＝対応が必要なところだけ」。時刻・人数などの数字には `.num` クラスを付ける。
- ロゴは `public/logo.png` を置くと差し替わる（`src/components/logo.tsx`）。

## 参加曜日と振替（v1.4）
- 子どもごとに `children.weekdays`（参加曜日）。その曜日の練習は何もしなくても参加。仕組みは `src/lib/makeup.ts` の冒頭コメントを参照。
- 振替の残り = `makeup_credits.delta` の合計（期限なし）。**たまるのは2026年12月1日以降の練習から**（`MAKEUP_EARN_FROM`、`earnCredit` で判定。移行時の申告 initial は別）。練習を削除するとDBのトリガーでその練習の振替（たまった分・使った分）も消える。たまる: 参加曜日の欠席連絡／連絡なしで来なかった（毎朝の定期処理 `settleNoShows`）／クラブ都合の休み。遅刻・早退ではたまらない。到着が記録されると、その練習でたまった分は取り消す。
- 参加曜日以外の練習への参加は `practice_extras`。週1日の子は振替を1回使う（`joinExtra`）、週2日以上は使わない。
- 予定の中止・休み（`cancelEvent` / `setPracticeOff`）は `onPracticeCancelled`、戻すときは `onPracticeRestored` を必ず呼ぶ。
- いつもの練習の曜日ごとに `practice_slots.mode`（regular=参加曜日に選べる／dropin=都度参加・金曜日は必ずこれ／self=自主練）。参加曜日の選択肢は `selectableSlots()`、`setWeekdays` は金曜と regular 以外を拒否。
- 自主練は `events.self_practice`（タイトル「自主練」）。だれの参加曜日にもならず、都度 `joinExtra` で参加・振替は使わない・欠席や無断でもたまらない。プランナーで「自主練」を選んで入れる／「自主練に切り替える」（`setSelfPractice`、切り替え時にその日の振替の動きは元に戻す）。
- お子さんは保護者が名前・よみがな・学年を入力して登録（`registerNewChild`）。名簿に同じ名前の子が1人だけいればその子につなぐ。どちらも管理者の承認待ち。承認画面では同じ名前の子がいると注意を出し、却下すると誰ともつながっていない子は消える。2人目の保護者は「家族を招待」で。
- お子さんを1人も登録していない保護者には、ホームのいちばん上に「お子さんの情報が登録されていません」とオレンジの枠で出す（承認待ちのときは承認待ちの表示）。管理者の「メンバーと権限」には「お子さん未登録」の印と人数が出る。
- 入会の流れ: 招待リンクに `audience`（existing=BANDから移行／new=新規）。手順は `src/lib/enroll.ts`。GoogleフォームURL・決済URLは `app_settings`（管理者メニュー → 招待リンク）。
- BANDから移行する人（`profiles.join_route='existing'`）がお子さんを登録するとき、`migration_roster`（会費ペイの支払い一覧の氏名）と苗字が合わなければ「クラブにお問い合わせください」で止める（`src/lib/migration-roster.ts` の `surnameMatches`、表記ゆれ 髙/高・﨑/崎 などは吸収）。名簿が空なら確認しない。名簿は管理者メニュー → 招待リンク でCSVを入れ直すか手で編集（`saveMigrationRoster`）。新規入会の人は対象外。

## ログインの方法
- 保護者: LINE（`/api/auth/line/*`）か、メールアドレス＋6桁の確認コード（`/login/email`、`src/lib/login.ts`・`src/app/actions/login.ts`）。メールは `RESEND_API_KEY` があるときだけ画面に出る（`env.emailLoginEnabled()`）。新しい人は招待リンクが必要。どちらも最後は `resolveLogin()`（`src/lib/invites.ts`）。
- 子ども: 保護者が「お子さん・家族の管理」でログインIDとパスワードを決めて作る（`createChildLogin`）。管理者の承認で使える。`/login/kid` で入る。パスワードは保護者が `resetChildPassword` で変える（端末はログアウト）。5回まちがえると15分ロック。無効にするとIDは空く。
- ほかの端末でも同じアカウントを使う: 設定 →「ほかの端末でも使う」でログイン用リンク（`login_links`、30分・1回だけ、`src/lib/login-link.ts`）を作り、相手の端末で `/login/link/[token]` を開いて「ログインする」を押す（開いただけでは使われない）。コーチは木村さんのアカウントをこの方法で共用する。「ほかの端末をログアウト」（`logoutOtherDevices`）で取り消せる。子どもアカウントは作れない。
- E2E ではメールが届かないので `e2e/helpers.ts` の `setEmailCode` でDBのコードを置きかえる。

## 招待リンクとホーム画面への追加
- スマホで招待リンク（`/join/[token]`）を開くと、まず「ホーム画面に追加」を案内する（`src/components/join-gate.tsx`）。LINEの中で開いたときはブラウザで開き直すよう案内。「追加せずに、このまま登録する」で先に進める。
- 招待リンクの画面は専用の manifest（`/join/[token]/manifest.webmanifest`、start_url＝その招待リンク）を使うので、そこから追加したアイコンは招待の続きを開く（iPhoneはホーム画面のアプリとSafariでログインが別のため）。ふだんの manifest は `/manifest.webmanifest`（`src/lib/manifest.ts`）。
- ログイン済みの人が招待リンクを開いたら（家族招待以外）ホームへ移る。
- 検索エンジン対策: `robots.ts` で全体を拒否、全レスポンスに `X-Robots-Tag: noindex`。

## クラブのご案内
- 文章は `app_settings.guide_text`（`## ` で始まる行が見出し・目次、`![説明](/guide/xxx.jpg)` の行は写真。写真は `public/guide/` に置く）。管理者メニュー → クラブのご案内 で編集。表示は `/rules`、部品は `src/components/club-guide.tsx`。
- 入会の手順に「クラブのご案内」（step=guide）があり、「確認しました」で `profiles.guide_read_version` を更新。編集時に「もう一度確認してもらう」で `guide_version` が上がり、未確認の大人は「やること」に出る（`src/lib/guide.ts` の `guideUnread`）。子どもアカウントは対象外。

## 保護者の表示（管理者のプレビュー）
- 管理者が「保護者の表示で見る」を押すと Cookie `pc_view=member` が付き、`getCurrentUser()` が `isAdmin=false`（`previewingMember=true`, `canAdmin=true`）を返す。画面も Server Action も一般の保護者と同じ扱いになる。
- 切り替えは `setMemberPreview(on)`（`src/app/actions/account.ts`）。画面上の帯は `src/components/preview-toggle.tsx`。
- 新しく管理者専用の判定を書くときも `user.isAdmin` を使う（`canAdmin` は切り替えボタン以外で使わない）。

## 全体チャット
- `chat_rooms.is_everyone` の部屋が1つだけある（名前の初期値「全体チャット」）。大人のアカウントは作成時にDBのトリガー（`join_everyone_chat`）で自動参加。子どもアカウントは入らない。
- 管理者でもメンバーの変更・削除はできない（名前だけ変えられる）。ミュートはできる。チャット一覧ではいちばん上。

## スタッフ連絡のチャット（家族ごと）
- `chat_rooms.is_staff` の部屋。保護者（管理者ではない大人）の家族ごとに1つで、同じ子の保護者（承認済み）は同じ部屋。管理者は全員すべての部屋に入る。子どもアカウントは入らない。
- 作成・メンバー・名前（「スタッフ連絡｜お子さんの名前」）はすべて `src/lib/staff-chat.ts` の `syncStaffRooms()` が決める（何度呼んでもよい）。チャット一覧を開いたときと、家族のつながり・権限・退会・新規登録が変わる Server Action から呼ぶ。**`guardian_children` や `profiles.role` を変える処理を足したら、最後に `syncStaffRooms()` を呼ぶ**。
- 別々の部屋だった保護者が同じ子でつながると1つにまとめる（メッセージも移す）。管理者でも名前・メンバーの変更や削除はできない。
- 一覧では、保護者には「スタッフへの連絡」と表示し全体チャットの次に置く。管理者にはお子さんの名前で表示し、まだ何も書かれていない部屋は「まだやりとりのない保護者」にたたむ。

## 通知
`src/lib/notify.ts` の `notifyLater(受信者, 種類, {title, body, url}, opts)` を使う。
- 種類は `src/lib/notify-kinds.ts`。子どもアカウントには `childOk: true` のときだけ届く（予定の変更・中止のみ）。
- 22:00〜7:00 は保留され朝7時に送信。`urgent` / `bypassQuiet` で即時。

## 'use server' ファイルの注意
`src/app/actions/*.ts` からは **async 関数しか export できない**（定数・zod スキーマ・型以外の値は `src/lib/` に置く）。

## 確認コマンド（修正後は必ず実行）
```bash
npm run typecheck && npx eslint src && npm test && npm run e2e
```
- E2E は `e2e/main-flow.spec.ts`。画面の文言を変えたらテストのセレクタも直す。
- 見た目を変えたら、スマホ幅（390px）でスクリーンショットを撮って確認する。

## 既知の環境依存
- 最近の Chrome では `scrollIntoView()` が Promise を返す。`useEffect(() => el.scrollIntoView())` のように**式で返さない**（ブロックで書く）。
