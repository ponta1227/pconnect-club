# P-CONNECT Jr. 連絡アプリ

卓球クラブ「P-CONNECT Jr.」専用の連絡アプリ（LINE BAND の置き換え）。スマホ向けWebアプリ（PWA）として `https://club.pconnect.jp` で動かす想定です。

- 予定表（繰り返し・中止・月表示）、大会・イベントの参加受付（定員・キャンセル待ち・同行者・二段階締切・CSV/印刷出力）
- 会場の共用タブレットでの到着登録 → 保護者へ通知、欠席・遅刻・早退の連絡、月次の出席集計
- 掲示板（管理者投稿、コメント・スタンプ、既読、ピン留め、緊急）、アンケート・日程調整
- チャット（管理者が作るトークルーム、メンション、検索、ノート、投票）
- アルバム（ZIP一括ダウンロード）・資料配布（PDF）、横断検索
- LINEログイン、招待リンク、家族招待、子どもアカウント（保護者発行＋管理者承認）
- Webプッシュ通知＋メール通知（夜間保留・緊急は強制送信）

要件の詳細は claude.ai の BAND プロジェクトにある「要件定義書」を参照してください。

## 技術構成

| 役割 | 使うもの |
|---|---|
| 画面・サーバー | Next.js 16（App Router）＋ TypeScript ＋ Tailwind CSS 4 |
| データベース | Supabase の Postgres（`postgres` ドライバで直接接続） |
| ファイル | Supabase Storage（非公開バケット、署名付きURLで表示） |
| ホスティング | Vercel（東京リージョン `hnd1`）＋ Vercel Cron |
| ログイン | LINE ログイン（OpenID Connect） |
| 通知 | Web Push（VAPID）＋ Resend（メール） |

### 認可の考え方
すべてのテーブルで RLS を有効にし、**ポリシーは作っていません**（= Supabase の公開キーからは何も読めない）。
アプリはサーバー側だけが `DATABASE_URL` で接続し、権限チェックはサーバーのコード（`src/lib/auth.ts`、`src/lib/access.ts`、各 Server Action）で行います。
ブラウザに Supabase のキーは一切渡しません。

---

## 本番の準備（最初の1回）

### 1. Supabase
1. 新しいプロジェクトを作成（リージョン: Tokyo `ap-northeast-1`）。
   - 無料プランは「有効なプロジェクト2つまで」です。上限に達している場合は、使っていないプロジェクトを一時停止・削除するか Pro にしてください。
2. **Storage** で `club-files` という名前のバケットを **Private（非公開）** で作成。
3. **Connect → Transaction pooler** の接続文字列を `DATABASE_URL` に使います（ポート 6543）。
4. テーブルを作成（手元のPCで1回実行）:
   ```bash
   npm install
   DATABASE_URL="（3の接続文字列）" npm run migrate
   ```
   `db/migrations/*.sql` が順番に適用されます（会場3つ・種別「練習／大会／イベント」も入ります）。
5. **Project Settings → API** の `URL` と `service_role` キーを控えます。

### 2. LINE ログイン
1. LINE Developers の既存プロバイダーに「LINEログイン」チャネルを追加。
2. 「LINEログイン設定」→ コールバックURL に `https://club.pconnect.jp/api/auth/line/callback` を登録。
3. 「OpenID Connect」→ メールアドレス取得権限を申請（任意。許可されるとメール通知の初期設定が楽になります）。
4. チャネルID・チャネルシークレットを控えます。
5. チャネルを「公開」にします。

### 3. 通知のキー
```bash
npx web-push generate-vapid-keys
```
表示された Public Key を `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、Private Key を `VAPID_PRIVATE_KEY` に設定します。

### 4. メール（Resend）
1. Resend で `club.pconnect.jp`（または `pconnect.jp`）のドメインを追加し、表示される SPF/DKIM の DNS レコードを登録。
2. API キーを `RESEND_API_KEY` に設定。送信元は `MAIL_FROM`。
   - 未設定の場合、メールは送られません（サーバーのログに出るだけ）。

### 5. Vercel
1. GitHub の `ponta1227/pconnect-club` を Vercel にインポート（Framework: Next.js、設定は既定のまま）。
2. **Environment Variables** に `.env.example` の「必須」「ファイル保存」「Webプッシュ」「メール」を設定。
   - `ALLOW_DEV_LOGIN` は**設定しない**（本番ビルドではもともと無効です）。
3. デプロイ。`vercel.json` の Cron（毎日 22:00 UTC = 日本時間 7:00）が自動で登録されます。
4. **Settings → Domains** で `club.pconnect.jp` を追加。表示される値で DNS に CNAME を登録します:
   ```
   club   CNAME   cname.vercel-dns.com.   （Vercel の画面に表示された値を使う）
   ```
   pconnect.jp の DNS を管理しているサービス（お名前.com・ムームードメイン等）の管理画面で設定します。

> **料金について**: Vercel の Hobby（無料）プランは個人の非商用利用向けです。クラブ（株式会社ASKスポーツ）の運営で使う場合は Pro（月額）を検討してください。Supabase は無料枠で始められますが、写真が増えて容量（1GB）を超えたら Pro が必要です。

### 6. 最初の管理者
1. ブラウザで `https://club.pconnect.jp/setup?secret=（SETUP_SECRET の値）` を開く。
2. 「LINEでログインして管理者になる」→ ここでログインした人が最初の管理者になります。
3. 以降は `/setup` を使っても何も起きません（2人目以降は招待リンクから参加）。

### 7. 初期設定（管理者メニュー）
1. **クラス**: 「初心者」「選手」など
2. **名簿**: 「CSVで一括登録」（列: 氏名, よみがな, 学年, クラス）
3. **練習予定の一括作成**: いつもの曜日・会場で1年分を登録
4. **会場のタブレット**: PIN を設定
5. **招待リンク**: 発行して保護者に LINE で送る
6. 保護者が参加してお子さんを申請したら、**承認待ちの申請**から承認

---

## 開発

```bash
# 1. ローカルの Postgres（例）
createdb pconnect
# 2. 環境変数
cp .env.example .env.local   # DATABASE_URL をローカルに。ALLOW_DEV_LOGIN=1、SETUP_SECRET を何か設定
# 3. テーブル作成と起動
npm install
DATABASE_URL=postgres://localhost/pconnect npm run migrate
npm run dev
```
- `ALLOW_DEV_LOGIN=1` のとき、`/dev-login` から LINE なしでログイン・ユーザー作成ができます（本番では無効）。
- `SUPABASE_URL` を設定しない場合、アップロードは `.data/uploads/` に保存されます。
- VAPID・Resend を設定しない場合、通知はサーバーのログに `[push:dev]` `[mail:dev]` として出ます。

### テスト
```bash
npm run typecheck   # 型チェック
npx eslint src      # lint
npm test            # 単体テスト＋通知の結合テスト（テスト用DB pconnect_test を初期化して使う）
npm run e2e         # ブラウザでの通しテスト（テスト用DBを初期化し、ポート3100で起動）
```
- テスト用DBは `TEST_DATABASE_URL`（既定 `postgres://app:app@localhost:5432/pconnect_test`）。名前に `test` を含むDBしか初期化しません。
- Playwright のブラウザが入っていない場合は `npx playwright install chromium`、または `CHROME_PATH=/path/to/chrome npm run e2e`。

---

## 運用メモ

| やりたいこと | 方法 |
|---|---|
| コーチを管理者にする | 管理者メニュー → メンバーと権限 |
| 練習を休みにする | 予定を開いて「中止にする」（緊急扱いなら通知OFFの人にもメール） |
| 台風・休館の連絡 | 掲示板で「緊急」にチェックして投稿 |
| 子どもが退会 | 名簿 → その子 → 在籍を「在籍終了」（出席記録は残る） |
| 4月の進級 | 4月1日以降の最初の朝7時に自動で学年+1（高3は「卒業」になり管理者に通知）。名簿画面から手動実行も可 |
| タブレットの終了 | 画面右上の「終了」を長押し → PIN |
| 招待リンクを止める | 管理者メニュー → 招待リンク → 無効にする |

### 定期処理（毎朝7:00）
`/api/cron/daily` で次を行います。
- 夜間（22:00〜7:00）に保留したプッシュ通知の送信
- 大会・イベントの部内締め **3日前・前日** のリマインド（未反応の子の保護者へ）
- アンケートの締切前日の催促
- 4月の進級処理
- 使われなかったアップロード・期限切れデータの掃除

### バックアップ
- Supabase の日次バックアップ（Pro）に加え、管理者メニューから名簿CSV・出席集計CSVを出力できます。

---

## 要件定義書からの変更点・補足

| 項目 | 実装 | 理由 |
|---|---|---|
| チャットのリアルタイム更新 | Supabase Realtime ではなく **4秒ごとの新着確認** | LINEログインのセッションをサーバー側で管理しており、ブラウザに Supabase のキーを渡さない設計にしたため。〜200人規模なら負荷は問題ありません |
| 権限の制御 | RLS は「全拒否」、権限チェックはサーバーのコード | 同上。E2E テストで子どもアカウント・他の保護者から見えないことを確認済み |
| 参加者一覧の PDF | 印刷用ページ（A4）→ ブラウザの「PDFに保存」 | 日本語フォントをサーバーに持たずに済むため |
| リマインドの時刻 | 朝8時 → **朝7時**（夜間保留の送信と同じ定期処理） | Vercel 無料プランの Cron は1日1回のため |
| チャット通知のまとめ | 同じルームでは30秒に1回までに間引く | 「30秒でまとめる」を、送信側で間引く形で実現 |
| 子どもアカウント | 1人の子に1つ、本人の連絡は保護者にも通知、緊急投稿・リマインドは送らない | 要件定義書 §17-8 の既定値どおり |
| タブレットの名前一覧 | 五十音順・クラスに加えて「あ・か・さ…」の行で絞り込み可 | 人数が多いときに探しやすくするため |
| 招待リンク | セキュリティのためDBにはハッシュのみ保存。表示は発行直後だけ（再発行で旧リンク無効） | — |
| ログインのレート制限 | LINE 側の認証に任せる。タブレットPINは 10分に5回まで | 招待トークンは推測不能な長さ（24バイト） |
