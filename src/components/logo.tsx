// クラブのロゴ。public/logo.png を置くとその画像を使い、無ければ仮のマーク（卓球台とボール）を表示する。
// 置き方は README の「ロゴを差し替える」を参照。
const HAS_LOGO = process.env.NEXT_PUBLIC_HAS_LOGO === '1'

export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  if (HAS_LOGO) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/logo.png" alt="P-CONNECT Jr." className={`${className} rounded-xl object-contain`} />
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#1c4fa0" />
      <path d="M10 39h44" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 39v13" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="43" cy="22" r="8" fill="#f59a23" />
    </svg>
  )
}
