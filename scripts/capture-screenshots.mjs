import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/mini-market-game/';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${url}?debug=true`);
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    const wait = (duration) => {
      for (let time = 0; time < duration; time += 50) engine.update(50, { x: 0, y: 0 });
    };
    const visit = (x, y, duration) => {
      engine.state.player = { x, y };
      wait(duration);
    };
    // A real sequence of harvests, shelf transfers and paid sales, with accelerated time.
    visit(265, 590, 8000);
    visit(265, 295, 2000);
    visit(475, 590, 1400);
    visit(475, 295, 1200);
    visit(950, 225, 45_000);
    visit(265, 590, 2500);
    visit(265, 295, 1700);
    visit(475, 590, 2500);
    visit(475, 295, 1700);
    visit(265, 590, 600);
    visit(560, 450, 1000);
    engine.drainEvents();
    document.querySelector('#debug-panel').hidden = true;
    setPaused(false);
  });
  // Allow the follow camera and product-transfer animations to settle.
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/screenshots/desktop.png' });
  const mobile = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(url);
  await mobilePage.locator('#loading').waitFor({ state: 'detached' });
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-landscape.png' });
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-portrait.png' });
  await mobile.close();
} finally {
  await browser.close();
}
