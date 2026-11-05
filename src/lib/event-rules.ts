// 予定の参加ルール（DBに依存しない純粋な関数。単体テスト対象）
import { fromJst, jstDateStr } from './time'

export const MEMBER_DEADLINE_DAYS_BEFORE_ENTRY = 14

/** 部内締めの既定値：申込締切の2週間前 */
export function defaultMemberDeadline(entryDeadline: Date | null): Date | null {
  if (!entryDeadline) return null
  return new Date(entryDeadline.getTime() - MEMBER_DEADLINE_DAYS_BEFORE_ENTRY * 86400000)
}

type RsvpEvent = { status: 'active' | 'cancelled'; starts_at: Date; member_deadline: Date | null }

/** メンバーが参加登録・取消できるか（管理者は締切後も可） */
export function rsvpOpen(e: RsvpEvent, now = new Date()): boolean {
  if (e.status !== 'active') return false
  if (e.member_deadline) return now.getTime() <= e.member_deadline.getTime()
  return now.getTime() < e.starts_at.getTime()
}

/** 定員に対して、新しい参加者が参加かキャンセル待ちか */
export function placement(capacity: number | null, goingCount: number): 'going' | 'waitlist' {
  if (capacity == null) return 'going'
  return goingCount < capacity ? 'going' : 'waitlist'
}

/**
 * 締切リマインドを送るべきか（日本時間の暦日で3日前・前日）。
 * 毎朝1回の定期実行から呼ばれる前提。前日分を逃した場合は当日朝に送る。
 */
export function reminderDue(
  memberDeadline: Date | null,
  now: Date,
  sent: { d3: Date | null; d1: Date | null },
): 'd3' | 'd1' | null {
  if (!memberDeadline) return null
  if (memberDeadline.getTime() <= now.getTime()) return null
  const days = Math.round((fromJst(jstDateStr(memberDeadline)).getTime() - fromJst(jstDateStr(now)).getTime()) / 86400000)
  if (days <= 1 && !sent.d1) return 'd1'
  if (days >= 2 && days <= 3 && !sent.d3) return 'd3'
  return null
}
