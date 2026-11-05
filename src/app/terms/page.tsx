import { PageHeader } from '@/components/ui'

export const metadata = { title: '利用規約' }

// 雛形。公開前に管理者が内容・運営者名を確認すること。
export default function TermsPage() {
  return (
    <>
      <PageHeader title="利用規約" back="/" />
      <main className="mx-auto max-w-xl space-y-4 px-5 py-6 text-sm leading-7">
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">※ 雛形です。公開前にクラブ運営者が内容を確認してください。</p>
        <p>この規約は、P-CONNECT Jr.（以下「クラブ」）が提供する連絡アプリ「P-CONNECT Jr.」（以下「本アプリ」）の利用条件を定めるものです。</p>
        <h2 className="font-bold">第1条（利用者）</h2>
        <p>本アプリは、クラブに所属する選手の保護者・家族、クラブの指導者・運営者、および保護者が同意し運営者が承認した選手本人が利用できます。</p>
        <h2 className="font-bold">第2条（アカウント）</h2>
        <p>利用者はLINEアカウントでログインします。アカウントを第三者に利用させてはいけません。招待リンクを関係者以外に共有してはいけません。</p>
        <h2 className="font-bold">第3条（禁止事項）</h2>
        <ul className="list-disc pl-5">
          <li>他の利用者や選手を誹謗中傷する行為</li>
          <li>本アプリで知った個人情報・写真をクラブ外に公開する行為</li>
          <li>法令または公序良俗に反する行為</li>
          <li>本アプリの運営を妨げる行為</li>
        </ul>
        <h2 className="font-bold">第4条（投稿の削除・利用停止）</h2>
        <p>運営者は、不適切と判断した投稿を削除し、または利用者の利用を停止することがあります。</p>
        <h2 className="font-bold">第5条（免責）</h2>
        <p>通知の遅延・不達、システムの停止等により生じた損害について、クラブは故意または重大な過失がある場合を除き責任を負いません。重要な連絡は複数の手段で確認してください。</p>
        <h2 className="font-bold">第6条（退会）</h2>
        <p>利用者はいつでも退会できます。退会すると、利用者の個人データは削除され、過去の投稿は「退会したメンバー」と表示されます。</p>
        <h2 className="font-bold">第7条（規約の変更）</h2>
        <p>クラブは必要に応じて本規約を変更できます。変更後の規約は本アプリに掲示した時点から効力を生じます。</p>
        <p className="text-muted">制定日: 2026年　月　日 ／ 運営: P-CONNECT Jr.（株式会社ASKスポーツ）</p>
      </main>
    </>
  )
}
