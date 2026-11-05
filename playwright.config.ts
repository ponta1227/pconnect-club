import { defineConfig, devices } from '@playwright/test'

// E2E テスト。テスト用DB（TEST_DATABASE_URL）を毎回初期化し、開発用ログインで操作する。
// 例: TEST_DATABASE_URL=postgres://app:app@localhost:5432/pconnect_test npx playwright test
const PORT = 3100
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/pconnect_test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB,
      APP_URL: `http://localhost:${PORT}`,
      ALLOW_DEV_LOGIN: '1',
      SETUP_SECRET: 'e2e-setup',
      CRON_SECRET: 'e2e-cron',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
