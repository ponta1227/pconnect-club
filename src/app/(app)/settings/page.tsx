import { requireUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { FORCED_KINDS, NOTIFY_KINDS, type NotifyKind } from '@/lib/notify-kinds'
import { leaveClub, removeEmail, requestEmailVerification, updateDisplayName } from '@/app/actions/account'
import { Notice, Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'
import { PushToggle } from '@/components/push'
import { FontSizeToggle, NotifySwitch } from '@/components/settings-controls'

export const metadata = { title: '設定' }

const EMAIL_MSG: Record<string, [string, 'ok' | 'warn' | 'danger']> = {
  sent: ['確認メールを送りました。メール内のリンクを開くと登録が完了します。', 'ok'],
  verified: ['メールアドレスを登録しました。', 'ok'],
  expired: ['確認リンクの有効期限が切れています。もう一度登録してください。', 'warn'],
  invalid: ['メールアドレスの形式が正しくありません。', 'danger'],
}

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const user = await requireUser()
  const sp = await searchParams
  const overrides = await sql<{ kind: string; push: boolean; email: boolean }[]>`select kind, push, email from notification_settings where profile_id = ${user.id}`
  const map = new Map(overrides.map((o) => [o.kind, o]))
  const kinds = (Object.keys(NOTIFY_KINDS) as NotifyKind[]).filter((k) => !FORCED_KINDS.includes(k) && (user.isAdmin || !NOTIFY_KINDS[k].adminOnly))
  const emailMsg = typeof sp.email === 'string' ? EMAIL_MSG[sp.email] : undefined

  return (
    <>
      <PageHeader title="設定" back="/more" />
      <Page className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">この端末の通知</h2>
          <PushToggle />
        </section>

        {user.isChild ? (
          <Notice>子どもアカウントには「予定の変更・中止」だけが通知されます。</Notice>
        ) : (
          <>
            <section className="card p-4">
              <h2 className="mb-1 font-bold">通知する内容</h2>
              <p className="mb-2 text-xs text-muted">22時〜7時のプッシュ通知は朝7時にまとめて届きます（緊急連絡・中止・メンションはすぐ届きます）。緊急連絡は常に通知されます。</p>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 text-sm">
                <span />
                <span className="text-center text-xs text-muted">プッシュ</span>
                <span className="text-center text-xs text-muted">メール</span>
                {kinds.map((k) => {
                  const d = NOTIFY_KINDS[k]
                  const o = map.get(k)
                  return (
                    <div key={k} className="contents">
                      <span>{d.label}</span>
                      <NotifySwitch kind={k} channel="push" value={o?.push ?? d.push} />
                      <NotifySwitch kind={k} channel="email" value={o?.email ?? d.email} disabled={!user.emailVerified} />
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="card space-y-3 p-4">
              <h2 className="font-bold">メール通知の宛先</h2>
              {emailMsg && <Notice tone={emailMsg[1]}>{emailMsg[0]}</Notice>}
              {user.email && user.emailVerified ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 break-all">{user.email}</span>
                  <ActionButton action={removeEmail} className="btn-ghost btn-sm text-danger" confirm="メールアドレスを削除しますか？">削除</ActionButton>
                </div>
              ) : (
                <p className="text-sm text-muted">メールアドレスが未登録のため、メール通知は届きません。</p>
              )}
              <form action={requestEmailVerification} className="flex gap-2">
                <input name="email" type="email" className="input flex-1" placeholder="example@mail.com" required maxLength={200} />
                <SubmitButton className="btn-secondary">{user.email ? '変更' : '登録'}</SubmitButton>
              </form>
            </section>

            <section className="card space-y-2 p-4">
              <h2 className="font-bold">表示名</h2>
              <form action={updateDisplayName} className="flex gap-2">
                <input name="displayName" defaultValue={user.displayName} className="input flex-1" maxLength={40} required />
                <SubmitButton className="btn-secondary">保存</SubmitButton>
              </form>
            </section>
          </>
        )}

        <section className="card space-y-2 p-4">
          <h2 className="font-bold">文字の大きさ</h2>
          <FontSizeToggle value={user.fontSize} />
        </section>

        {!user.isChild && (
          <details className="card p-4" open={!!sp.leave}>
            <summary className="cursor-pointer text-sm font-bold text-danger">退会する</summary>
            {sp.leave === 'last-admin' && <Notice tone="danger">管理者が1人だけのため退会できません。先に他の人を管理者にしてください。</Notice>}
            <form action={leaveClub} className="mt-3 space-y-2">
              <p className="text-sm text-muted">退会すると、あなたの個人データ（表示名・メール・お子さんとの紐づけ・通知設定）が削除されます。過去の投稿やコメントは「退会したメンバー」と表示されます。</p>
              <input name="confirm" className="input" placeholder="確認のため「退会」と入力" required />
              <SubmitButton className="btn-danger w-full" confirm="本当に退会しますか？">退会する</SubmitButton>
            </form>
          </details>
        )}
      </Page>
    </>
  )
}
