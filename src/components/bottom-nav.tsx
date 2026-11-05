'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconBoard, IconCalendar, IconChat, IconHome, IconMore } from './icons'

type Tab = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean; badge?: number }

export function BottomNav({ showChat, chatUnread, boardUnread }: { showChat: boolean; chatUnread: number; boardUnread: number }) {
  const pathname = usePathname()
  const tabs: Tab[] = [
    { href: '/', label: 'ホーム', icon: <IconHome />, match: (p) => p === '/' },
    { href: '/events', label: '予定', icon: <IconCalendar />, match: (p) => p.startsWith('/events') },
    { href: '/board', label: '掲示板', icon: <IconBoard />, match: (p) => p.startsWith('/board'), badge: boardUnread },
    ...(showChat
      ? [{ href: '/chat', label: 'チャット', icon: <IconChat />, match: (p: string) => p.startsWith('/chat'), badge: chatUnread }]
      : []),
    { href: '/more', label: 'その他', icon: <IconMore />, match: (p) => /^\/(more|admin|settings|albums|documents|members|children|search)/.test(p) },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur pb-safe no-print">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((t) => {
          const active = t.match(pathname)
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 pt-1.5 text-[0.7rem] font-semibold ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                {!!t.badge && t.badge > 0 && (
                  <span className="absolute left-1/2 top-1 ml-2 min-w-5 rounded-full bg-danger px-1.5 text-center text-[0.65rem] leading-5 text-white">
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
