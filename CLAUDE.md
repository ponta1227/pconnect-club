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
