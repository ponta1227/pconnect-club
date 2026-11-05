// 画面で使うアイコン（外部ライブラリなし）
type P = { className?: string }
const base = 'h-6 w-6'
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const IconHome = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></svg>
)
export const IconCalendar = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
)
export const IconBoard = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M4 4h16v12H8l-4 4z" /><path d="M8 9h8M8 12h5" /></svg>
)
export const IconChat = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
)
export const IconMore = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
)
export const IconBack = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconPlus = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconPin = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M9 4h6l-1 6 4 3H6l4-3z" /><path d="M12 13v8" /></svg>
)
export const IconAlert = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>
)
export const IconSearch = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const IconMap = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
)
export const IconClock = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconCheck = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
)
export const IconPhoto = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
)
export const IconFile = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>
)
export const IconUsers = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>
)
export const IconBell = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
)
export const IconGear = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
)
export const IconChild = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><circle cx="12" cy="7" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
)
export const IconPoll = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
)
export const IconChevron = ({ className = 'h-5 w-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="m9 6 6 6-6 6" /></svg>
)
export const IconTablet = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M11 18.5h2" /></svg>
)
export const IconShare = ({ className = base }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 12v8h14v-8" /></svg>
)
