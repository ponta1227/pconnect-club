'use client'

import { useTransition } from 'react'
import { setMemberPreview } from '@/app/actions/account'

/** 管理者用: 保護者の表示に切り替えるボタン */
export function MemberPreviewButton() {
  const [pending, start] = useTransition()
  return (
    <button type="button" className="btn-secondary w-full" disabled={pending} onClick={() => start(() => setMemberPreview(true))}>
      {pending ? '切り替えています…' : '保護者の表示で見る'}
    </button>
  )
}

/** 保護者の表示で見ている間、画面の上に出す帯 */
export function MemberPreviewBanner({ hasChildren }: { hasChildren: boolean }) {
  const [pending, start] = useTransition()
  return (
    <div className="sticky top-0 z-50 bg-text px-4 py-2 text-white">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-bold">保護者の表示で見ています</span>
          {!hasChildren && <span className="block text-xs opacity-90">お子さんが登録されていないため、回答ボタンは出ません</span>}
        </p>
        <button
          type="button"
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-text"
          disabled={pending}
          onClick={() => start(() => setMemberPreview(false))}
        >
          {pending ? '…' : '管理者に戻す'}
        </button>
      </div>
    </div>
  )
}
