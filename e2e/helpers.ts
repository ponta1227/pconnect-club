import { randomBytes, scryptSync } from 'node:crypto'
import postgres from 'postgres'
import { expect, type Browser, type Page } from '@playwright/test'

export async function newUser(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  return { ctx, page }
}

/** 開発用ログイン画面から既存ユーザーとしてログイン */
export async function loginAs(page: Page, name: string) {
  await page.goto('/dev-login')
  await page.locator('form').filter({ hasText: name }).getByRole('button', { name: 'ログイン' }).first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/dev-login'))
}

/** 規約同意〜初回設定を終わらせる（子どもの紐づけは呼び出し側で行う） */
export async function agreeTerms(page: Page) {
  await expect(page).toHaveURL(/onboarding/)
  await page.getByRole('button', { name: '次へ' }).click()
  // 大人はクラブのご案内を読んで「確認しました」
  await page.waitForURL(/onboarding\?step=|\/$/)
  if (/step=guide/.test(page.url())) {
    await expect(page.getByRole('heading', { name: 'クラブのご案内' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /球拾い用ネット/ })).toBeVisible()
    await page.getByRole('button', { name: '確認しました' }).click()
    await page.waitForURL((u) => !/step=guide/.test(u.search))
  }
}

export async function finishOnboarding(page: Page) {
  await expect(page).toHaveURL(/step=(children|notify)/)
  if (/step=children/.test(page.url())) {
    await page.getByRole('link', { name: '次へ' }).click()
  }
  await expect(page).toHaveURL(/step=notify/)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** 日本時間のきょうの曜日（0=日〜6=土） */
export function todayDow(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCDay()
}

export function todayJst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export function addDaysJst(days: number): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + days * 86400000)
  return d.toISOString().slice(0, 10)
}

/** メールの確認コードは実際には届かないので、テスト用DBで最新のコードを決まった値に置きかえる */
export async function setEmailCode(email: string, code: string) {
  const db = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test', { max: 1, onnotice: () => {} })
  const salt = randomBytes(16).toString('hex')
  const hash = `${salt}:${scryptSync(code, salt, 32).toString('hex')}`
  await db`update email_codes set code_hash = ${hash}
    where id = (select id from email_codes where email = ${email} order by created_at desc limit 1)`
  await db.end()
}
