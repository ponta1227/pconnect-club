import { PageHeader } from '@/components/ui'

export const metadata = { title: 'プライバシーポリシー' }

// 雛形。公開前に管理者が内容・運営者名・問い合わせ先を確認すること。
export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="プライバシーポリシー" back="/" />
      <main className="mx-auto max-w-xl space-y-4 px-5 py-6 text-sm leading-7">
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">※ 雛形です。公開前にクラブ運営者が内容を確認してください。</p>
        <h2 className="font-bold">1. 取得する情報</h2>
        <ul className="list-disc pl-5">
          <li>LINEログインで提供される情報（ユーザー識別子、表示名、プロフィール画像、メールアドレス〔許可された場合〕）</li>
          <li>利用者が入力した情報（表示名、メールアドレス、選手の氏名・よみがな・学年・所属クラス）</li>
          <li>利用に伴う情報（到着記録、欠席・遅刻・早退の連絡、参加登録、投稿・コメント・チャット、写真・資料）</li>
          <li>通知のための端末情報（プッシュ通知の購読情報）</li>
        </ul>
        <p>住所・電話番号・緊急連絡先などの詳細情報は本アプリでは取得せず、クラブが別途管理します。</p>
        <h2 className="font-bold">2. 利用目的</h2>
        <p>クラブの練習・大会等の連絡、出欠・到着の管理、保護者への通知、クラブ運営のための集計に利用します。</p>
        <h2 className="font-bold">3. 公開範囲</h2>
        <p>表示名・選手の氏名・到着状況・大会の参加者は、クラブの利用者（保護者・家族・運営者）に表示されます。欠席等の連絡内容、出席の集計、支払い状況のメモは運営者のみが閲覧します。</p>
        <h2 className="font-bold">4. 第三者提供・委託</h2>
        <p>法令に基づく場合を除き、本人の同意なく第三者に提供しません。システムの運用のため、データの保管（Supabase）、配信（Vercel）、メール送信（Resend）、ログイン（LINE）の各サービスを利用します。</p>
        <h2 className="font-bold">5. 保管と削除</h2>
        <p>退会時に利用者の個人データを削除します。選手が在籍終了した後も、クラブ運営のため出席記録を保持します。削除を希望する場合は運営者にご連絡ください。</p>
        <h2 className="font-bold">6. お問い合わせ</h2>
        <p>P-CONNECT Jr. 運営（株式会社ASKスポーツ）　連絡先: （公開前に記入）</p>
        <p className="text-muted">制定日: 2026年　月　日</p>
      </main>
    </>
  )
}
