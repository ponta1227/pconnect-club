import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { classes } from '@/lib/events'
import { fmtDateTime } from '@/lib/time'
import { linkGuardianByAdmin, mergeChildren, unlinkGuardian } from '@/app/actions/admin'
import { revokeChildAccount } from '@/app/actions/children'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton, SubmitButton } from '@/components/client'
import { ChildForm } from '@/components/child-form'
import { GuardianAdder } from '@/components/guardian-adder'

export const metadata = { title: '子どもの詳細' }

export default async function ChildDetailPage({ params }: PageProps<'/admin/roster/[id]'>) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [child] = await sql<{ id: string; full_name: string; kana: string; grade: number; status: string; class_ids: string[] }[]>`
    select id, full_name, kana, grade, status, coalesce((select array_agg(class_id) from child_classes where child_id = c.id), '{}') as class_ids
    from children c where id = ${id}`
  if (!child) notFound()
  const [guardians, account, others, adults, stats] = await Promise.all([
    sql<{ profile_id: string; name: string; status: string; via: string }[]>`
      select gc.profile_id, p.display_name as name, gc.status, gc.via from guardian_children gc join profiles p on p.id = gc.profile_id
      where gc.child_id = ${id} and p.deleted_at is null order by gc.status, p.display_name`,
    sql<{ profile_id: string; status: string; created_at: Date }[]>`
      select profile_id, status, created_at from child_accounts where child_id = ${id} and status in ('pending', 'active')`,
    sql<{ id: string; full_name: string; kana: string }[]>`select id, full_name, kana from children where id <> ${id} order by kana`,
    sql<{ id: string; display_name: string }[]>`select id, display_name from profiles where account_kind = 'adult' and deleted_at is null order by display_name`,
    sql<{ arrivals: number; absences: number }[]>`
      select (select count(*)::int from arrivals where child_id = ${id} and cancelled_at is null) as arrivals,
             (select count(*)::int from absence_reports where child_id = ${id}) as absences`,
  ])
  const VIA = { roster: '本人申請', family_invite: '家族招待', admin: '管理者が登録' } as Record<string, string>

  return (
    <>
      <PageHeader title={child.full_name} back="/admin/roster" />
      <Page className="space-y-4">
        <ChildForm classes={await classes()} initial={child} />

        <section className="card space-y-3 p-4">
          <h2 className="font-bold">保護者・家族</h2>
          {guardians.length === 0 && <p className="text-sm text-muted">まだいません</p>}
          <ul className="divide-y divide-line">
            {guardians.map((g) => (
              <li key={g.profile_id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">
                  {g.name} <span className="text-xs text-muted">{VIA[g.via]}</span>
                </span>
                {g.status === 'pending' && <span className="badge bg-warn-soft text-warn">承認待ち</span>}
                <ActionButton action={unlinkGuardian.bind(null, id, g.profile_id)} className="btn-ghost btn-sm text-danger" confirm={`${g.name}さんの紐づけを外しますか？`}>
                  外す
                </ActionButton>
              </li>
            ))}
          </ul>
          <GuardianAdder
            adults={adults.filter((a) => !guardians.some((g) => g.profile_id === a.id))}
            action={linkGuardianByAdmin.bind(null, id)}
          />
        </section>

        <section className="card space-y-2 p-4">
          <h2 className="font-bold">子どもアカウント</h2>
          {account.length === 0 ? (
            <p className="text-sm text-muted">ありません（保護者が発行できます）</p>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">{account[0].status === 'active' ? '利用中' : '承認待ち'}・{fmtDateTime(account[0].created_at)}</span>
              <ActionButton action={revokeChildAccount.bind(null, id)} className="btn-secondary btn-sm text-danger" confirm="子どもアカウントを無効にしますか？">
                無効にする
              </ActionButton>
            </div>
          )}
        </section>

        <section className="card p-4 text-sm text-muted">
          到着記録 {stats[0].arrivals}回・欠席等の連絡 {stats[0].absences}回
        </section>

        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold">重複を統合する</summary>
          <form action={mergeChildren} className="mt-3 space-y-2">
            <input type="hidden" name="into" value={id} />
            <p className="text-sm text-muted">選んだ子どもの保護者・クラス・参加登録・到着記録をこの子にまとめ、選んだ方を削除します。</p>
            <select name="from" className="input" required>
              <option value="">統合する（削除される）子どもを選ぶ</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.full_name}（{o.kana}）</option>)}
            </select>
            <SubmitButton className="btn-secondary w-full text-danger" confirm="統合すると元に戻せません。よろしいですか？">統合する</SubmitButton>
          </form>
        </details>
      </Page>
    </>
  )
}
