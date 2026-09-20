import { defineConfig } from '@playwright/test';

const browserName =
  process.env.PLAYWRIGHT_BROWSER === 'firefox'
    ? 'firefox'
    : process.env.PLAYWRIGHT_BROWSER === 'webkit'
      ? 'webkit'
      : 'chromium';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 1,
  reporter: 'list',
  outputDir: `test-results/${browserName}`,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/mini-market-game/',
    browserName,
    channel: browserName === 'chromium' ? (process.env.PLAYWRIGHT_CHANNEL ?? 'chrome') : undefined,
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
});
