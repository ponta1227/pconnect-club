// 仮ロゴ（P-CONNECT のロゴが届いたら差し替え）
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <circle cx="44" cy="20" r="6" fill="#fff" />
      <path d="M20 48V16h11a9 9 0 0 1 0 18H20" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
