// 通知の種類と既定値（要件定義書 §11）。クライアントからも参照する。
export const NOTIFY_KINDS = {
  arrival: { label: '子どもの到着', push: true, email: false, adminOnly: false },
  absence: { label: '欠席・遅刻・早退の連絡', push: true, email: false, adminOnly: false },
  post: { label: '新しい掲示板投稿', push: true, email: true, adminOnly: false },
  comment: { label: '掲示板のコメント', push: false, email: false, adminOnly: false },
  chat: { label: 'チャットの新着', push: true, email: false, adminOnly: false },
  mention: { label: 'チャットでのメンション', push: true, email: false, adminOnly: false },
  event: { label: '予定の新規・変更', push: true, email: false, adminOnly: false },
  reminder: { label: '参加の締切リマインド', push: true, email: true, adminOnly: false },
  poll: { label: 'アンケート・日程調整の催促', push: true, email: false, adminOnly: false },
  waitlist: { label: 'キャンセル待ちの繰り上げ', push: true, email: true, adminOnly: false },
  approval: { label: '承認待ちの申請', push: true, email: false, adminOnly: true },
  urgent: { label: '緊急連絡・中止', push: true, email: true, adminOnly: false },
} as const

export type NotifyKind = keyof typeof NOTIFY_KINDS

/** 設定で変更できない種類（緊急は常に送る） */
export const FORCED_KINDS: NotifyKind[] = ['urgent']
