import { requireAdmin } from '@/lib/auth'
import { membersWithChildren } from '@/lib/members'
import { createRoom } from '@/app/actions/chat'
import { Page, PageHeader } from '@/components/ui'
import { MemberPicker } from '@/components/member-picker'
import { SubmitButton } from '@/components/client'

export const metadata = { title: 'ルームを作成' }

export default async function NewRoomPage() {
  const user = await requireAdmin()
  const members = (await membersWithChildren()).filter((m) => m.id !== user.id)
  return (
    <>
      <PageHeader title="トークルームを作成" back="/chat" />
      <Page>
        <form action={createRoom} className="space-y-4">
          <label className="block">
            <span className="label">ルーム名</span>
            <input name="name" className="input" required maxLength={50} placeholder="例: 選手コース保護者" />
          </label>
          <div>
            <span className="label">メンバー（あなたは自動で入ります）</span>
            <MemberPicker members={members} selected={[]} />
          </div>
          <SubmitButton>作成する</SubmitButton>
        </form>
      </Page>
    </>
  )
}
