'use client'

import { useState, useTransition } from 'react'
import { regenerateClubInvite } from '@/app/actions/admin'
import { CopyButton } from './client'

export function InviteGenerator() {
  const [url, setUrl] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="space-y-2">
      {url ? (
        <div className="space-y-2 rounded-xl bg-brand-soft p-3">
          <p className="break-all text-xs">{url}</p>
          <div className="flex gap-2">
            <CopyButton text={url} label="コピー・共有" />
            <a className="btn-secondary btn-sm" href={`https://line.me/R/share?text=${encodeURIComponent(`P-CONNECT Jr. の連絡アプリへの招待です。\n${url}`)}`} target="_blank" rel="noopener">
              LINEで送る
            </a>
          </div>
        </div>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={pending}
          onClick={() => {
            if (!confirm('新しい招待リンクを発行します。以前のリンクは使えなくなります。よろしいですか？')) return
            start(async () => setUrl((await regenerateClubInvite()).url))
          }}
        >
          招待リンクを発行
        </button>
      )}
    </div>
  )
}
