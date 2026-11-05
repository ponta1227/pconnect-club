import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconBack, IconChevron } from './icons'

export function PageHeader({
  title,
  back,
  action,
  sub,
}: {
  title: string
  back?: string
  action?: ReactNode
  sub?: string
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur no-print">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
        {back ? (
          <Link href={back} aria-label="戻る" className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-bg">
            <IconBack />
          </Link>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{title}</h1>
          {sub && <p className="-mt-0.5 truncate text-xs text-muted">{sub}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto max-w-xl px-3 pb-28 pt-3 ${className}`}>{children}</main>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">{children}</div>
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full bg-bg object-cover" style={{ width: size, height: size }} />
  }
  const ch = (name || '?').trim().slice(0, 1)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {ch}
    </span>
  )
}

export function ListLink({ href, children, right }: { href: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-bg">
      <div className="min-w-0 flex-1">{children}</div>
      {right}
      <IconChevron className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const cls = {
    info: 'bg-brand-soft text-brand-dark',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }[tone]
  return <div className={`rounded-xl px-3 py-2.5 text-sm ${cls}`}>{children}</div>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  )
}

export function TypeDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}
