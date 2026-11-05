'use client'

import { useMemo, useState } from 'react'

type Member = { id: string; display_name: string; kind: string; children: string[] }

/** チャットのメンバー選択（名前・子どもの名前で検索） */
export function MemberPicker({ members, selected, name = 'members' }: { members: Member[]; selected: string[]; name?: string }) {
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set(selected))
  const list = useMemo(() => {
    const t = q.trim()
    return t ? members.filter((m) => m.display_name.includes(t) || m.children.some((c) => c.includes(t))) : members
  }, [q, members])
  return (
    <div className="space-y-2">
      {[...checked].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="名前で絞り込み" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-secondary btn-sm self-center" onClick={() => setChecked(new Set([...checked, ...list.map((m) => m.id)]))}>
          表示中を全選択
        </button>
      </div>
      <p className="text-xs text-muted">{checked.size}人を選択中</p>
      <ul className="card max-h-[50dvh] divide-y divide-line overflow-y-auto">
        {list.map((m) => (
          <li key={m.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={checked.has(m.id)}
                onChange={(e) => {
                  const next = new Set(checked)
                  if (e.target.checked) next.add(m.id)
                  else next.delete(m.id)
                  setChecked(next)
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {m.display_name}
                  {m.kind !== 'member' && <span className="ml-1 text-xs font-normal text-muted">（{m.kind === 'admin' ? '管理者' : '子どもアカウント'}）</span>}
                </span>
                {m.children.length > 0 && <span className="block truncate text-xs text-muted">{m.children.join('・')}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
