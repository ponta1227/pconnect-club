// 月次出席集計の計算（DBに依存しない純粋な関数。単体テスト対象）

export type Practice = { id: string; class_ids: string[]; venue: string }
export type ChildInfo = { id: string; full_name: string; kana: string; grade: number; class_ids: string[]; class_names: string[] }
export type Arrival = { event_id: string; child_id: string }
export type Absence = { event_id: string; child_id: string; kind: 'absent' | 'late' | 'early' }

export type ChildRow = {
  child: ChildInfo
  eligible: number
  attended: number
  rate: number | null
  absent: number
  late: number
  early: number
}

/** その子が対象の練習か（対象クラス未指定なら全員が対象） */
export function isEligible(p: Practice, c: ChildInfo): boolean {
  return p.class_ids.length === 0 || p.class_ids.some((id) => c.class_ids.includes(id))
}

export function computeAttendance(practices: Practice[], children: ChildInfo[], arrivals: Arrival[], absences: Absence[]) {
  const arrived = new Set(arrivals.map((a) => `${a.event_id}:${a.child_id}`))
  const rows: ChildRow[] = children.map((c) => {
    const eligible = practices.filter((p) => isEligible(p, c))
    const attendedEligible = eligible.filter((p) => arrived.has(`${p.id}:${c.id}`)).length
    const attended = practices.filter((p) => arrived.has(`${p.id}:${c.id}`)).length
    const mine = absences.filter((a) => a.child_id === c.id)
    return {
      child: c,
      eligible: eligible.length,
      attended,
      rate: eligible.length ? Math.round((attendedEligible / eligible.length) * 1000) / 10 : null,
      absent: mine.filter((a) => a.kind === 'absent').length,
      late: mine.filter((a) => a.kind === 'late').length,
      early: mine.filter((a) => a.kind === 'early').length,
    }
  })

  const classTotals = new Map<string, { name: string; children: number; attended: number; eligible: number }>()
  for (const r of rows) {
    r.child.class_ids.forEach((id, i) => {
      const t = classTotals.get(id) ?? { name: r.child.class_names[i] ?? '', children: 0, attended: 0, eligible: 0 }
      t.children++
      t.attended += r.attended
      t.eligible += r.eligible
      classTotals.set(id, t)
    })
  }

  const venueTotals = new Map<string, { practices: number; arrivals: number }>()
  for (const p of practices) {
    const t = venueTotals.get(p.venue) ?? { practices: 0, arrivals: 0 }
    t.practices++
    t.arrivals += arrivals.filter((a) => a.event_id === p.id).length
    venueTotals.set(p.venue, t)
  }

  return {
    rows,
    classes: [...classTotals.values()].map((t) => ({ ...t, rate: t.eligible ? Math.round((t.attended / t.eligible) * 1000) / 10 : null })),
    venues: [...venueTotals.entries()].map(([venue, t]) => ({ venue, ...t, average: t.practices ? Math.round((t.arrivals / t.practices) * 10) / 10 : 0 })),
    practiceCount: practices.length,
  }
}
