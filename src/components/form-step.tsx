'use client'

import { useState, useSyncExternalStore } from 'react'
import { markFormSubmitted } from '@/app/actions/enroll'

const KEY = 'pc_form_opened'
const noop = () => () => {}

/**
 * 入会の申込みフォーム（Googleフォーム）。
 * フォームを開くまで「送信しました」は押せない。BANDから移行する人には、以前のフォームとは別だと目立たせる。
 */
export function FormStep({ formUrl, submitted, migrating }: { formUrl: string; submitted: boolean; migrating: boolean }) {
  const [clicked, setClicked] = useState(false)
  // 一度フォームを開いていれば、画面を開き直しても押せるままにする（保存できない環境ではこの画面の間だけ）
  const remembered = useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(KEY) === formUrl
      } catch {
        return false
      }
    },
    () => false,
  )
  const opened = submitted || clicked || remembered

  const open = () => {
    setClicked(true)
    try {
      sessionStorage.setItem(KEY, formUrl)
    } catch {}
  }

  return (
    <div className="space-y-5">
      {migrating && (
        <div className="rounded-2xl border-2 border-ball bg-ball-soft p-4">
          <p className="text-lg font-bold text-ball-ink">以前のGoogleフォームとは別のフォームです</p>
          <p className="mt-1 text-[0.95rem] leading-relaxed">
            BANDのときにGoogleフォームへ回答した方も、<b>新しいアプリ用のフォームに、改めて入力してください</b>。お手数をおかけしますが、よろしくお願いします。
          </p>
        </div>
      )}
      <a href={formUrl} target="_blank" rel="noopener noreferrer" onClick={open} className="btn-primary h-13 w-full text-base">
        Googleフォームを開く
      </a>
      <form action={markFormSubmitted}>
        <button className="btn-secondary w-full" disabled={!opened}>
          {submitted ? '次へ' : '送信しました'}
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        {opened ? 'フォームは別のタブで開きます。送信したら、この画面に戻って「送信しました」を押してください。' : '先に「Googleフォームを開く」を押してください。フォームを開くと、「送信しました」が押せるようになります。'}
      </p>
    </div>
  )
}
