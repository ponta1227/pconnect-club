import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { getEvent } from '@/lib/events'
import { gradeLabel } from '@/lib/grades'
import { participants } from '@/lib/participants'
import { fmtDateFull, fmtDateTime, fmtTime } from '@/lib/time'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: '参加者一覧（印刷）' }

// A4 縦の一覧表。ブラウザの「印刷」から「PDFに保存」でPDFにできる。
export default async function PrintParticipantsPage({ params }: PageProps<'/events/[id]/print'>) {
  await requireAdmin()
  const { id } = await params
  const e = await getEvent(id)
  if (!e) notFound()
  const rows = await participants(id)
  const going = rows.filter((r) => r.status === 'going')
  const waiting = rows.filter((r) => r.status === 'waitlist')
  const companions = going.reduce((s, r) => s + r.companions, 0)

  const table = (list: typeof rows, offset = 0) => (
    <table className="w-full min-w-[180mm] border-collapse text-[10.5pt]">
      <thead>
        <tr className="bg-[#eef2f7]">
          {['No.', '氏名', 'よみがな', '学年', 'クラス', ...(e.allow_companions ? ['同行'] : []), '保護者', '登録日時'].map((h) => (
            <th key={h} className="whitespace-nowrap border border-[#9aa3af] px-1.5 py-1 text-left font-bold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            <td className="border border-[#9aa3af] px-1.5 py-1 text-right">{offset + i + 1}</td>
            <td className="border border-[#9aa3af] px-1.5 py-1">{r.full_name}</td>
            <td className="border border-[#9aa3af] px-1.5 py-1">{r.kana}</td>
            <td className="border border-[#9aa3af] px-1.5 py-1">{gradeLabel(r.grade)}</td>
            <td className="border border-[#9aa3af] px-1.5 py-1">{r.class_names.join('・')}</td>
            {e.allow_companions && <td className="border border-[#9aa3af] px-1.5 py-1 text-right">{r.companions}</td>}
            <td className="border border-[#9aa3af] px-1.5 py-1">{r.guardians.join('・')}</td>
            <td className="border border-[#9aa3af] px-1.5 py-1">{fmtDateTime(r.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="min-h-dvh bg-white">
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { nav { display: none !important; } }`}</style>
      <div className="no-print sticky top-0 flex items-center gap-2 border-b border-line bg-white p-3">
        <Link href={`/events/${id}`} className="btn-secondary btn-sm whitespace-nowrap">戻る</Link>
        <PrintButton />
        <span className="text-xs text-muted">印刷画面で「PDFに保存」を選ぶとPDFになります</span>
      </div>
      <div className="mx-auto max-w-[190mm] space-y-4 overflow-x-auto p-4 text-black print:overflow-visible print:p-0">
        <div>
          <h1 className="text-[15pt] font-bold">{e.title} 参加者一覧</h1>
          <p className="text-[10pt]">
            {fmtDateFull(e.starts_at)} {!e.all_day && fmtTime(e.starts_at)}　{e.venue_name ?? e.venue_text}
          </p>
          <p className="text-[10pt]">
            参加 {going.length}人{e.allow_companions && `（同行者 ${companions}人）`}
            {waiting.length > 0 && `／キャンセル待ち ${waiting.length}人`}
            {e.entry_deadline && `／申込締切 ${fmtDateTime(e.entry_deadline)}`}
          </p>
        </div>
        {table(going)}
        {waiting.length > 0 && (
          <>
            <h2 className="pt-2 text-[12pt] font-bold">キャンセル待ち</h2>
            {table(waiting)}
          </>
        )}
        <p className="text-right text-[8pt] text-[#6b7686]">出力: {fmtDateTime(new Date())} P-CONNECT Jr.</p>
      </div>
    </div>
  )
}
