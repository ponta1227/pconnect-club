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
- 大会・イベントの回答は `answerRsvp(eventId, childId, 'going' | 'declined')`。**未回答＝rsvps に行が無い**、見送り＝`status='declined'`。参加人数を数えるときは `declined` を除くこと。回答の部品は `src/components/rsvp.tsx`（ホーム・予定・掲示板で共通）。
- 欠席・遅刻・早退は `src/components/absence.tsx`（下から出るシート）。
- 大会を登録すると掲示板のお知らせ（`posts.event_id`）が自動で作られる。回答するとそのお知らせは既読になる。
- 練習日程は `/admin/schedule`（`src/app/actions/schedule.ts`、「いつもの練習」は `practice_slots` テーブル）。
- 色は「卓球台の青（brand）＝骨組み」「ボールのオレンジ（ball）＝対応が必要なところだけ」。時刻・人数などの数字には `.num` クラスを付ける。
- ロゴは `public/logo.png` を置くと差し替わる（`src/components/logo.tsx`）。

## 参加曜日と振替（v1.4）
- 子どもごとに `children.weekdays`（参加曜日）。その曜日の練習は何もしなくても参加。仕組みは `src/lib/makeup.ts` の冒頭コメントを参照。
- 振替の残り = `makeup_credits.delta` の合計（期限なし）。たまる: 参加曜日の欠席連絡／連絡なしで来なかった（毎朝の定期処理 `settleNoShows`）／クラブ都合の休み。遅刻・早退ではたまらない。到着が記録されると、その練習でたまった分は取り消す。
- 参加曜日以外の練習への参加は `practice_extras`。週1日の子は振替を1回使う（`joinExtra`）、週2日以上は使わない。
- 予定の中止・休み（`cancelEvent` / `setPracticeOff`）は `onPracticeCancelled`、戻すときは `onPracticeRestored` を必ず呼ぶ。
- 入会の流れ: 招待リンクに `audience`（existing=BANDから移行／new=新規）。手順は `src/lib/enroll.ts`。GoogleフォームURL・決済URLは `app_settings`（管理者メニュー → 招待リンク）。

## クラブのご案内
- 文章は `app_settings.guide_text`（`## ` で始まる行が見出し・目次）。管理者メニュー → クラブのご案内 で編集。表示は `/rules`、部品は `src/components/club-guide.tsx`。
- 入会の手順に「クラブのご案内」（step=guide）があり、「確認しました」で `profiles.guide_read_version` を更新。編集時に「もう一度確認してもらう」で `guide_version` が上がり、未確認の大人は「やること」に出る（`src/lib/guide.ts` の `guideUnread`）。子どもアカウントは対象外。

## 保護者の表示（管理者のプレビュー）
- 管理者が「保護者の表示で見る」を押すと Cookie `pc_view=member` が付き、`getCurrentUser()` が `isAdmin=false`（`previewingMember=true`, `canAdmin=true`）を返す。画面も Server Action も一般の保護者と同じ扱いになる。
- 切り替えは `setMemberPreview(on)`（`src/app/actions/account.ts`）。画面上の帯は `src/components/preview-toggle.tsx`。
- 新しく管理者専用の判定を書くときも `user.isAdmin` を使う（`canAdmin` は切り替えボタン以外で使わない）。

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
