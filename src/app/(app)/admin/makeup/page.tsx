import { requireAdmin } from '@/lib/auth'
import { sql } from '@/lib/db'
import { creditBalances } from '@/lib/makeup'
import { practiceSlots, selectableSlots } from '@/lib/schedule'
import { fmtDate } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'
import { MakeupAdminRow } from '@/components/enroll'

export const metadata = { title: '参加曜日・振替' }

const REASON = { absent: '欠席連絡', no_show: '連絡なしで休み', club_cancel: 'クラブ都合の休み', initial: 'BANDからの申告', used: '振替で参加', admin: '管理者が修正' } as const

export default async function MakeupPage({ searchParams }: PageProps<'/admin/makeup'>) {
  await requireAdmin()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const filter = sp.filter === 'unset' ? 'unset' : sp.filter === 'credits' ? 'credits' : 'all'
  const [kids, slots] = await Promise.all([
    sql<{ id: string; full_name: string; kana: string; weekdays: number[] }[]>`
      select id, full_name, kana, weekdays from children
      where status = 'active' and (${q} = '' or full_name like ${'%' + q + '%'} or kana like ${'%' + q + '%'})
      order by kana, full_name`,
    practiceSlots(),
  ])
  const balances = await creditBalances(kids.map((k) => k.id))
  const shown = kids.filter((k) =>
    filter === 'unset' ? k.weekdays.length === 0 : filter === 'credits' ? (balances.get(k.id) ?? 0) > 0 : true,
  )
  const history = shown.length
    ? await sql<{ child_id: string; delta: number; reason: keyof typeof REASON; note: string; created_at: Date; event_at: Date | null }[]>`
        select m.child_id, m.delta, m.reason, m.note, m.created_at, e.starts_at as event_at
        from makeup_credits m left join events e on e.id = m.event_id
        where m.child_id = any(${shown.map((k) => k.id)}::uuid[]) and m.delta <> 0
        order by m.created_at desc`
    : []
  const slotList = selectableSlots(slots).map((s) => ({ weekday: s.weekday, label: `${s.start_time}〜` }))
  const unset = kids.filter((k) => k.weekdays.length === 0).length

  return (
    <>
      <PageHeader title="参加曜日・振替" back="/admin" />
      <Page className="space-y-3">
        <p className="text-sm text-muted">
          参加曜日の練習は自動で参加になります。休むと振替が1回たまり（欠席連絡・連絡なしで来なかった・クラブ都合の休み）、週1日の子はほかの曜日で使えます。期限はありません。
        </p>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="input flex-1" placeholder="名前・よみがなで検索" aria-label="検索" />
          <select name="filter" defaultValue={filter} className="input w-auto" aria-label="絞り込み">
            <option value="all">全員</option>
            <option value="unset">曜日が未設定（{unset}人）</option>
            <option value="credits">振替が残っている</option>
          </select>
          <button className="btn-secondary">表示</button>
        </form>
        {shown.length === 0 ? (
          <Empty>該当するお子さんはいません</Empty>
        ) : (
          <ul className="space-y-2">
            {shown.map((k) => {
              const h = history.filter((x) => x.child_id === k.id)
              return (
                <li key={k.id} className="card space-y-2 p-4">
                  <p className="font-bold">{k.full_name}</p>
                  <MakeupAdminRow kid={k} balance={balances.get(k.id) ?? 0} slots={slotList} />
                  {h.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm text-brand">振替の記録（{h.length}件）</summary>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {h.slice(0, 30).map((x, i) => (
                          <li key={i} className="flex gap-2">
                            <span className={`num w-8 text-right ${x.delta > 0 ? 'text-ok' : 'text-danger'}`}>{x.delta > 0 ? `+${x.delta}` : x.delta}</span>
                            <span className="flex-1">
                              {REASON[x.reason]}
                              {x.event_at && `（${fmtDate(x.event_at)}の練習）`}
                              {x.note && ` ${x.note}`}
                            </span>
                            <span className="text-xs text-muted">{fmtDate(x.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Page>
    </>
  )
}
