'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { autoLockKiosk, kioskArrive, lockKiosk, unlockKiosk } from '@/app/actions/kiosk'

const IDLE_MS = 60 * 60 * 1000
const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ']
const ROW_RANGES: [string, string][] = [
  ['ぁ', 'お'], ['か', 'ご'], ['さ', 'ぞ'], ['た', 'ど'], ['な', 'の'], ['は', 'ぽ'], ['ま', 'も'], ['ゃ', 'よ'], ['ら', 'ろ'], ['ゎ', 'ん'],
]
function kanaRow(kana: string): number {
  const ch = (kana || '').trim().charAt(0)
  const i = ROW_RANGES.findIndex(([a, b]) => ch >= a && ch <= b)
  return i < 0 ? -1 : i
}

function PinPad({ title, onSubmit, onCancel }: { title: string; onSubmit: (pin: string) => Promise<string | null>; onCancel?: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p))
  return (
    <div className="mx-auto w-full max-w-xs space-y-4 text-center">
      <p className="text-xl font-bold">{title}</p>
      <p className="h-10 text-3xl tracking-[0.5em]">{'●'.repeat(pin.length) || ' '}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-2xl bg-white text-2xl font-bold shadow-sm active:bg-bg">{d}</button>
        ))}
        <button type="button" onClick={() => setPin('')} className="h-16 rounded-2xl text-sm text-muted">クリア</button>
        <button type="button" onClick={() => press('0')} className="h-16 rounded-2xl bg-white text-2xl font-bold shadow-sm active:bg-bg">0</button>
        <button
          type="button"
          disabled={pin.length < 4 || pending}
          onClick={() =>
            start(async () => {
              const err = await onSubmit(pin)
              if (err) {
                setError(err)
                setPin('')
              }
            })
          }
          className="h-16 rounded-2xl bg-brand text-lg font-bold text-white disabled:opacity-40"
        >
          OK
        </button>
      </div>
      {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">やめる</button>}
    </div>
  )
}

export function KioskUnlock() {
  const router = useRouter()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <p className="text-sm text-muted">P-CONNECT Jr. 到着登録</p>
      <PinPad
        title="コーチがPINを入力して開始"
        onSubmit={async (pin) => {
          const r = await unlockKiosk(pin)
          if ('error' in r && r.error) return r.error
          router.refresh()
          return null
        }}
      />
    </main>
  )
}

type Kid = { id: string; full_name: string; kana: string; class_ids: string[]; arrived: string | null }

export function KioskBoard({ title, sub, kids, classes }: { title: string; sub: string; kids: Kid[]; classes: { id: string; name: string }[] }) {
  const router = useRouter()
  const [classId, setClassId] = useState<string | null>(null)
  const [row, setRow] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<Kid | null>(null)
  const [done, setDone] = useState<{ name: string; already: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locking, setLocking] = useState(false)
  const [pending, start] = useTransition()
  const lastActivity = useRef(0)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 30秒ごとに最新の到着状況へ更新、60分操作がなければ自動ロック
  useEffect(() => {
    const touch = () => (lastActivity.current = Date.now())
    touch()
    window.addEventListener('pointerdown', touch)
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) autoLockKiosk().then(() => router.refresh())
      else router.refresh()
    }, 30_000)
    return () => {
      clearInterval(t)
      window.removeEventListener('pointerdown', touch)
    }
  }, [router])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 3000)
    return () => clearTimeout(t)
  }, [done])

  const list = useMemo(
    () => kids.filter((k) => (!classId || k.class_ids.includes(classId)) && (row == null || kanaRow(k.kana) === row)),
    [kids, classId, row],
  )
  const arrivedCount = kids.filter((k) => k.arrived).length

  if (locking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <PinPad
          title="終了するにはPINを入力"
          onCancel={() => setLocking(false)}
          onSubmit={async (pin) => {
            const r = await lockKiosk(pin)
            if ('error' in r && r.error) return r.error
            router.refresh()
            return null
          }}
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh select-none bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-brand px-5 py-4 text-white">
        <div className="flex-1">
          <p className="text-xl font-bold">{title}</p>
          <p className="text-sm opacity-90">{sub}</p>
        </div>
        <p className="text-lg font-bold">到着 {arrivedCount} / {kids.length}</p>
        {/* 右上を長押しで終了 */}
        <button
          type="button"
          aria-label="終了（長押し）"
          className="h-12 w-12 rounded-full bg-white/10"
          onPointerDown={() => (press.current = setTimeout(() => setLocking(true), 1200))}
          onPointerUp={() => press.current && clearTimeout(press.current)}
          onPointerLeave={() => press.current && clearTimeout(press.current)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="text-xs">終了</span>
        </button>
      </header>

      {kids.length > 0 && (
        <div className="space-y-2 px-4 pt-3">
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setClassId(null)} className={`h-11 rounded-full px-4 font-bold ${!classId ? 'bg-brand text-white' : 'bg-white'}`}>全員</button>
              {classes.map((c) => (
                <button key={c.id} type="button" onClick={() => setClassId(c.id)} className={`h-11 rounded-full px-4 font-bold ${classId === c.id ? 'bg-brand text-white' : 'bg-white'}`}>{c.name}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setRow(null)} className={`h-11 min-w-11 rounded-xl px-2 font-bold ${row == null ? 'bg-text text-white' : 'bg-white'}`}>すべて</button>
            {KANA_ROWS.map((k, i) => (
              <button key={k} type="button" onClick={() => setRow(i)} className={`h-11 w-11 rounded-xl text-lg font-bold ${row === i ? 'bg-text text-white' : 'bg-white'}`}>{k}</button>
            ))}
          </div>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((k) => (
          <li key={k.id}>
            <button
              type="button"
              disabled={!!k.arrived}
              onClick={() => {
                setError(null)
                setConfirming(k)
              }}
              className={`flex min-h-24 w-full flex-col items-center justify-center rounded-2xl p-3 text-center shadow-sm ${
                k.arrived ? 'bg-ok-soft text-muted' : 'bg-white active:scale-[0.98]'
              }`}
            >
              <span className="text-xl font-bold leading-snug">{k.full_name}</span>
              <span className="text-xs text-muted">{k.kana}</span>
              {k.arrived && <span className="mt-1 text-sm font-bold text-ok">✓ {k.arrived}</span>}
            </button>
          </li>
        ))}
      </ul>
      {kids.length === 0 && <p className="p-10 text-center text-lg text-muted">{sub}</p>}

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-6 text-center">
            <p className="text-2xl font-bold">{confirming.full_name}さん</p>
            <p className="text-lg">で到着しますか？</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary h-16 flex-1 text-lg" onClick={() => setConfirming(null)}>ちがう</button>
              <button
                type="button"
                disabled={pending}
                className="btn-primary h-16 flex-1 text-lg"
                onClick={() =>
                  start(async () => {
                    const r = await kioskArrive(confirming.id)
                    if ('error' in r && r.error) {
                      setError(r.error)
                      return
                    }
                    setDone({ name: confirming.full_name, already: !!('already' in r && r.already) })
                    setConfirming(null)
                    setRow(null)
                    router.refresh()
                  })
                }
              >
                到着！
              </button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ok text-white" onClick={() => setDone(null)}>
          <span className="text-7xl">✓</span>
          <p className="text-3xl font-bold">{done.name}さん</p>
          <p className="text-xl">{done.already ? 'もう到着しています' : 'おつかれさま！到着を記録しました'}</p>
        </div>
      )}
    </main>
  )
}
