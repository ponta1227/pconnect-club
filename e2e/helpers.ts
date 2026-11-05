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
  await page.locator('input[name=agree]').check()
  await page.getByRole('button', { name: '次へ' }).click()
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

export function todayJst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export function addDaysJst(days: number): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + days * 86400000)
  return d.toISOString().slice(0, 10)
}
