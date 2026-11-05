'use client'

import { useState, useTransition } from 'react'

/** 管理者が保護者を直接紐づける */
export function GuardianAdder({ adults, action }: { adults: { id: string; display_name: string }[]; action: (profileId: string) => Promise<void> }) {
  const [id, setId] = useState('')
  const [pending, start] = useTransition()
  if (adults.length === 0) return null
  return (
    <div className="flex gap-2">
      <select className="input flex-1" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">保護者を追加…</option>
        {adults.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
      </select>
      <button className="btn-secondary" disabled={!id || pending} onClick={() => start(async () => { await action(id); setId('') })}>
        追加
      </button>
    </div>
  )
}
