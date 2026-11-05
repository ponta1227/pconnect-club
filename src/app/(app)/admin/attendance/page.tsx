import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { monthlyAttendance } from '@/lib/attendance'
import { gradeLabel } from '@/lib/grades'
import { jstParts } from '@/lib/time'
import { Empty, Page, PageHeader } from '@/components/ui'

export const metadata = { title: '月次の出席集計' }

export default async function AttendancePage({ searchParams }: PageProps<'/admin/attendance'>) {
  await requireAdmin()
  const sp = await searchParams
  const now = jstParts(new Date())
  const ym = typeof sp.ym === 'string' && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : `${now.year}-${String(now.month).padStart(2, '0')}`
  const [year, month] = ym.split('-').map(Number)
  const data = await monthlyAttendance(year, month)
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`

  return (
    <>
      <PageHeader title="月次の出席集計" back="/admin" />
      <Page className="space-y-4">
        <div className="card flex items-center justify-between px-2 py-2">
          <Link href={`/admin/attendance?ym=${prev}`} className="btn-ghost btn-sm">‹</Link>
          <span className="font-bold">{year}年{month}月</span>
          <Link href={`/admin/attendance?ym=${next}`} className="btn-ghost btn-sm">›</Link>
        </div>
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted">練習 {data.practiceCount}回（今日まで・中止を除く）</span>
          <a href={`/api/admin/attendance.csv?ym=${ym}`} className="btn-secondary btn-sm">CSV出力</a>
        </div>

        {data.venues.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-bold">会場別</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left">会場</th><th className="text-right">練習</th><th className="text-right">到着のべ</th><th className="text-right">平均</th></tr></thead>
              <tbody>
                {data.venues.map((v) => (
                  <tr key={v.venue} className="border-t border-line"><td className="py-1.5">{v.venue}</td><td className="text-right">{v.practices}</td><td className="text-right">{v.arrivals}</td><td className="text-right">{v.average}人</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {data.classes.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-bold">クラス別</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left">クラス</th><th className="text-right">人数</th><th className="text-right">出席のべ</th><th className="text-right">出席率</th></tr></thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.name} className="border-t border-line"><td className="py-1.5">{c.name}</td><td className="text-right">{c.children}</td><td className="text-right">{c.attended}</td><td className="text-right">{c.rate ?? '—'}%</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-sm font-bold">子ども別</h2>
          {data.rows.length === 0 ? (
            <Empty>データがありません</Empty>
          ) : (
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="text-left">氏名</th><th>学年</th><th className="text-right">出席</th><th className="text-right">対象</th><th className="text-right">率</th><th className="text-right">欠</th><th className="text-right">遅</th><th className="text-right">早</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.child.id} className="border-t border-line">
                    <td className="py-1.5"><Link href={`/admin/roster/${r.child.id}`} className="underline-offset-2 hover:underline">{r.child.full_name}</Link></td>
                    <td className="text-center text-xs text-muted">{gradeLabel(r.child.grade)}</td>
                    <td className="text-right font-semibold">{r.attended}</td>
                    <td className="text-right text-muted">{r.eligible}</td>
                    <td className={`text-right ${r.rate != null && r.rate < 50 ? 'text-danger' : ''}`}>{r.rate ?? '—'}%</td>
                    <td className="text-right">{r.absent || ''}</td>
                    <td className="text-right">{r.late || ''}</td>
                    <td className="text-right">{r.early || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted">出席率 = 対象クラスの練習のうち到着した回数 ÷ 対象の練習回数</p>
        </section>
      </Page>
    </>
  )
}
