import { requireAdult } from '@/lib/auth'
import { sql } from '@/lib/db'
import { gradeLabel } from '@/lib/grades'
import { myLinks } from '@/lib/roster'
import { removeFamilyMember, revokeChildAccount } from '@/app/actions/children'
import { Page, PageHeader } from '@/components/ui'
import { ActionButton } from '@/components/client'
import { InitialCredits, NewChildForm, WeekdayPicker } from '@/components/enroll'
import { creditBalances } from '@/lib/makeup'
import { practiceSlots } from '@/lib/schedule'
import { enrollState } from '@/lib/enroll'
import { ChildAccountInvite, ChildPasswordReset, FamilyInvite } from '@/components/family-invites'

export const metadata = { title: 'お子さん・家族の管理' }

export default async function ChildrenPage() {
  const user = await requireAdult()
  const links = await myLinks(user.id)
  const approved = links.filter((l) => l.status === 'approved').map((l) => l.child_id)
  const pendingIds = links.filter((l) => l.status === 'pending').map((l) => l.child_id)
  const pendingKids = pendingIds.length
    ? await sql<{ id: string; full_name: string }[]>`select id, full_name from children where id = any(${pendingIds}::uuid[]) order by kana`
    : []
  const kids = approved.length
    ? await sql<{ id: string; full_name: string; grade: number; weekdays: number[]; declared: boolean; class_names: string[] }[]>`
        select c.id, c.full_name, c.grade, c.weekdays,
          exists (select 1 from makeup_credits m where m.child_id = c.id and m.reason = 'initial') as declared,
          coalesce((select array_agg(cl.name order by cl.sort) from child_classes cc join classes cl on cl.id = cc.class_id where cc.child_id = c.id), '{}') as class_names
        from children c where c.id = any(${approved}::uuid[]) and c.status = 'active' order by c.kana`
    : []
  const ids = kids.map((k) => k.id)
  const [balances, slots, enroll] = await Promise.all([creditBalances(ids), practiceSlots(), enrollState(user.id)])
  const slotList = slots.map((sl) => ({ weekday: sl.weekday, label: `${sl.start_time}〜` }))
  const [family, accounts] = ids.length
    ? await Promise.all([
        sql<{ child_id: string; profile_id: string; name: string; via: string }[]>`
          select gc.child_id, gc.profile_id, p.display_name as name, gc.via from guardian_children gc join profiles p on p.id = gc.profile_id
          where gc.child_id = any(${ids}::uuid[]) and gc.status = 'approved' and gc.profile_id <> ${user.id} and p.deleted_at is null`,
        sql<{ child_id: string; status: string; login_id: string | null }[]>`
          select ca.child_id, ca.status, p.login_id from child_accounts ca join profiles p on p.id = ca.profile_id
          where ca.child_id = any(${ids}::uuid[]) and ca.status in ('pending', 'active')`,
      ])
    : [[], []]

  return (
    <>
      <PageHeader title="お子さん・家族の管理" back="/more" />
      <Page className="space-y-4">
        <section>
          <h2 className="section-title pt-0">お子さんの登録</h2>
          {pendingKids.length > 0 && (
            <ul className="card mb-3 divide-y divide-line">
              {pendingKids.map((k) => (
                <li key={k.id} className="flex items-center gap-2 px-4 py-3">
                  <span className="flex-1 font-semibold">{k.full_name}</span>
                  <span className="chip-muted">管理者の確認待ち</span>
                </li>
              ))}
            </ul>
          )}
          <NewChildForm />
          <p className="hint mt-2">
            ご夫婦など2人目の保護者は、ここで同じお子さんを登録せず、下の「家族を招待」から招待してください。同じお子さんにつながります。
          </p>
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
              <div className="space-y-2 rounded-xl bg-bg p-3">
                <WeekdayPicker kid={{ id: k.id, full_name: k.full_name, weekdays: k.weekdays, declared: k.declared, status: 'approved' }} slots={slotList} />
                <p className="text-[0.95rem]">
                  振替の残り: <b className="num text-lg">{balances.get(k.id) ?? 0}</b>回
                </p>
                {enroll.route === 'existing' && !k.declared && (
                  <InitialCredits kid={{ id: k.id, full_name: k.full_name, weekdays: k.weekdays, declared: k.declared, status: 'approved' }} />
                )}
                <p className="hint">
                  参加曜日の練習は自動で参加になります。休んだ日は振替が1回たまり、週1日の方はほかの曜日の練習で使えます（期限なし）。参加曜日の変更はクラブの管理者に連絡してください。
                </p>
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
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">{acc.status === 'active' ? '利用中' : '管理者の承認待ち'}</span>
                      <ActionButton action={revokeChildAccount.bind(null, k.id)} className="btn-ghost btn-sm text-danger" confirm="子どもアカウントを無効にしますか？">無効にする</ActionButton>
                    </div>
                    {acc.login_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1">ログインID: <b className="num select-all">{acc.login_id}</b></span>
                        <ChildPasswordReset childId={k.id} childName={k.full_name} />
                      </div>
                    ) : (
                      <p className="text-xs text-muted">LINEでログインする子どもアカウントです。</p>
                    )}
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
