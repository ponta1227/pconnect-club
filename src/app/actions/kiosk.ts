'use server'

import { refresh } from 'next/cache'
import { sql } from '@/lib/db'
import { verifyPin } from '@/lib/crypto'
import { endKioskSession, kioskSessionValid, pinAttemptsExceeded, recordPinFailure, startKioskSession } from '@/lib/kiosk'
import { todaysPractice } from '@/lib/events'
import { eventTargetChildIds } from '@/lib/access'
import { recordArrival } from '@/lib/arrivals'
import { addDays, startOfJstDay } from '@/lib/time'

async function checkPin(pin: string): Promise<string | null> {
  if (await pinAttemptsExceeded()) return 'PINの入力に何度も失敗したため、10分ほど待ってからお試しください'
  const [s] = await sql<{ kiosk_pin_hash: string | null }[]>`select kiosk_pin_hash from app_settings where id = 1`
  if (!s.kiosk_pin_hash) return 'PINが設定されていません。管理者メニューで設定してください'
  if (!verifyPin(pin, s.kiosk_pin_hash)) {
    await recordPinFailure()
    return 'PINが違います'
  }
  return null
}

export async function unlockKiosk(pin: string) {
  const error = await checkPin(pin)
  if (error) return { error }
  await startKioskSession()
  refresh()
  return { ok: true }
}

export async function lockKiosk(pin: string) {
  const error = await checkPin(pin)
  if (error) return { error }
  await endKioskSession()
  refresh()
  return { ok: true }
}

/** 一定時間操作がないときの自動ロック（PIN不要） */
export async function autoLockKiosk() {
  await endKioskSession()
  refresh()
}

/** タブレットからの到着登録。今日の練習の対象の子だけ */
export async function kioskArrive(childId: string) {
  if (!(await kioskSessionValid())) return { error: 'タブレットがロックされています。コーチにPINで開始してもらってください' }
  const dayStart = startOfJstDay(new Date())
  const practice = await todaysPractice(dayStart, addDays(dayStart, 1))
  if (!practice) return { error: '今日の練習はありません' }
  const targets = await eventTargetChildIds(practice.id)
  if (!targets.includes(childId)) return { error: 'この練習の対象ではありません' }
  const r = await recordArrival(practice.id, childId, 'kiosk', null)
  refresh()
  return { ok: true, already: !r.created }
}
