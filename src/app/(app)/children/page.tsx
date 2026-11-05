import { requireAdult } from '@/lib/auth'
import { sql } from '@/lib/db'
import { gradeLabel } from '@/lib/grades'
import { myLinks, rosterForLinking } from '@/lib/roster'
import { removeFamilyMember, revokeChildAccount } from '@/app/actions/children'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'
import { ChildLinker } from '@/components/child-linker'
import { ChildAccountInvite, FamilyInvite } from '@/components/family-invites'

export const metadata = { title: 'お子さん・家族の管理' }

export default async function ChildrenPage() {
  const user = await requireAdult()
  const [roster, links] = await Promise.all([rosterForLinking(), myLinks(user.id)])
  const approved = links.filter((l) => l.status === 'approved').map((l) => l.child_id)
  const kids = approved.length
    ? await sql<{ id: string; full_name: string; grade: number; class_names: string[] }[]>`
        select c.id, c.full_name, c.grade,
          coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_names
        from children c where c.id = any(${approved}::uuid[]) and c.status = 'active' order by c.kana`
    : []
  const ids = kids.map((k) => k.id)
  const [family, accounts] = ids.length
    ? await Promise.all([
        sql<{ child_id: string; profile_id: string; name: string; via: string }[]>`
          select gc.child_id, gc.profile_id, p.display_name as name, gc.via from guardian_children gc join profiles p on p.id = gc.profile_id
          where gc.child_id = any(${ids}::uuid[]) and gc.status = 'approved' and gc.profile_id <> ${user.id} and p.deleted_at is null`,
        sql<{ child_id: string; status: string }[]>`select child_id, status from child_accounts where child_id = any(${ids}::uuid[]) and status in ('pending', 'active')`,
      ])
    : [[], []]

  return (
    <>
      <PageHeader title="お子さん・家族の管理" back="/more" />
      <Page className="space-y-4">
        <section>
          <h2 className="section-title pt-0">お子さんの登録</h2>
          <ChildLinker roster={roster} mine={links} />
        </section>

        {kids.map((k) => {
          const fam = family.filter((f) => f.child_id === k.id)
          const acc = accounts.find((a) => a.child_id === k.id)
          return (
            <section key={k.id} className="card space-y-3 p-4">
              <div>
                <p className="font-bold">{k.full_name}</p>
                <p className="text-xs text-muted">{gradeLabel(k.grade)}{k.class_names.length > 0 && `・${k.class_names.join('・')}`}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-muted">ほかの保護者・家族</p>
                {fam.length === 0 ? (
                  <p className="text-sm text-muted">いません</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {fam.map((f) => (
                      <li key={f.profile_id} className="flex items-center gap-2">
                        <span className="flex-1">{f.name}</span>
                        {f.via === 'family_invite' && (
                          <ActionButton action={removeFamilyMember.bind(null, k.id, f.profile_id)} className="btn-ghost btn-sm text-danger" confirm={`${f.name}さんを外しますか？`}>外す</ActionButton>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-line pt-3">
                <p className="mb-1 text-xs font-bold text-muted">子どもアカウント（本人用）</p>
                {acc ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{acc.status === 'active' ? '利用中' : '管理者の承認待ち'}</span>
                    <ActionButton action={revokeChildAccount.bind(null, k.id)} className="btn-ghost btn-sm text-danger" confirm="子どもアカウントを無効にしますか？">無効にする</ActionButton>
                  </div>
                ) : (
                  <ChildAccountInvite childId={k.id} childName={k.full_name} />
                )}
              </div>
            </section>
          )
        })}

        {kids.length > 0 && (
          <section className="card space-y-3 p-4">
            <h2 className="font-bold">家族を招待</h2>
            <p className="text-sm text-muted">祖父母や送迎をお願いしている方などを招待できます。招待された方は保護者と同じように予定の確認・連絡・通知の受け取りができます。リンクは1回だけ使えます。</p>
            <FamilyInvite kids={kids.map((k) => ({ id: k.id, full_name: k.full_name }))} />
          </section>
        )}
      </Page>
    </>
  )
}
