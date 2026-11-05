import { requireUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { InstallGuide } from '@/components/install-guide'
import { PushToggle } from '@/components/push'

export const metadata = { title: 'ホーム画面に追加・通知' }

export default async function GuidePage() {
  await requireUser()
  return (
    <>
      <PageHeader title="ホーム画面に追加・通知" back="/more" />
      <Page className="space-y-4">
        <InstallGuide />
        <section className="card space-y-2 p-4">
          <h2 className="font-bold">通知をオンにする</h2>
          <p className="text-sm text-muted">ホーム画面に追加したアプリから開いて、下のボタンを押してください。</p>
          <PushToggle />
        </section>
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-bold">通知が届かないとき</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>iPhoneは iOS 16.4 以降で、Safariからホーム画面に追加したアプリでのみ通知が届きます。</li>
            <li>端末の「設定」→「通知」で、P-CONNECT Jr. の通知が許可されているか確認してください。</li>
            <li>機種変更した場合は、新しい端末で通知をオンにし直してください。</li>
            <li>確実に受け取りたい場合は「設定」からメール通知も登録してください。</li>
          </ul>
        </section>
      </Page>
    </>
  )
}
