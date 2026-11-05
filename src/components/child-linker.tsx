'use client'

import { useMemo, useState, useTransition } from 'react'
import { cancelChildLink, requestChildLink } from '@/app/actions/children'

type Roster = { id: string; full_name: string; kana: string; grade_label: string }
type Mine = { child_id: string; status: 'pending' | 'approved' }

/** 名簿から自分の子を選んで申請する */
export function ChildLinker({ roster, mine }: { roster: Roster[]; mine: Mine[] }) {
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const status = new Map(mine.map((m) => [m.child_id, m.status]))

  const list = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    return roster.filter((r) => r.full_name.includes(t) || r.kana.includes(t)).slice(0, 20)
  }, [q, roster])

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      }
    })

  const linked = roster.filter((r) => status.has(r.id))

  return (
    <div className="space-y-3">
      {linked.length > 0 && (
        <ul className="card divide-y divide-line">
          {linked.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1">
                {r.full_name} <span className="text-xs text-muted">{r.grade_label}</span>
              </span>
              {status.get(r.id) === 'approved' ? (
                <span className="badge bg-ok-soft text-ok">登録済み</span>
              ) : (
                <>
                  <span className="badge bg-warn-soft text-warn">承認待ち</span>
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => cancelChildLink(r.id))}>
                    取消
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          className="input"
          placeholder="お子さんの名前（ひらがな可）で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="hint">名簿に見つからない場合は、クラブの管理者に連絡してください。</p>
      </div>
      {list.length > 0 && (
        <ul className="card divide-y divide-line">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1">
                {r.full_name} <span className="text-xs text-muted">{r.grade_label}</span>
              </span>
              {status.has(r.id) ? (
                <span className="text-xs text-muted">申請済み</span>
              ) : (
                <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => requestChildLink(r.id))}>
                  この子の保護者として申請
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.trim() && list.length === 0 && <p className="text-sm text-muted">見つかりませんでした。</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
