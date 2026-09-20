import { expect, test, type Page } from '@playwright/test';
import type { GameEngine } from '../src/game/systems/GameEngine';
import type { SaveSystem } from '../src/game/systems/SaveSystem';
import type { GameState } from '../src/game/types';

declare global {
  interface Window {
    __MARKET__: {
      engine: GameEngine;
      save: SaveSystem;
      setPaused(paused: boolean): void;
      ready: boolean;
    };
  }
}

async function openGame(page: Page): Promise<void> {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
}

async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__MARKET__.engine.snapshot());
}

async function advance(page: Page, milliseconds: number): Promise<void> {
  await page.evaluate((duration) => {
    window.__MARKET__.setPaused(true);
    for (let elapsed = 0; elapsed < duration; elapsed += 50) {
      window.__MARKET__.engine.update(Math.min(50, duration - elapsed), { x: 0, y: 0 });
    }
  }, milliseconds);
}

test('keyboard harvest, shelf stocking, customer payment, and reload persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  const initial = await state(page);
  await page.keyboard.down('a');
  await expect
    .poll(async () => (await state(page)).player.x, { intervals: [50] })
    .toBeLessThan(285);
  await page.keyboard.up('a');
  await page.keyboard.down('s');
  await expect
    .poll(async () => (await state(page)).player.y, { intervals: [50] })
    .toBeGreaterThan(555);
  await page.keyboard.up('s');
  await expect.poll(async () => (await state(page)).inventory.tomato).toBeGreaterThan(0);
  expect((await state(page)).player.x).toBeLessThan(initial.player.x - 120);

  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => (await state(page)).player.y, { intervals: [50] })
    .toBeLessThan(305);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await state(page)).shelves.tomato).toBeGreaterThan(0);
  await advance(page, 35_000);
  let current = await state(page);
  expect(current.customers.some((customer) => customer.state === 'QUEUEING')).toBe(true);
  expect(current.money).toBe(0);

  // Continue the same transaction at checkout; time is accelerated without granting money.
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 950, y: 225 };
  });
  await advance(page, 6000);
  current = await state(page);
  expect(current.money).toBeGreaterThan(0);
  expect(current.totalServed).toBeGreaterThan(0);
  expect(current.totalEarned).toBe(current.money);
  await page.evaluate(() => window.__MARKET__.save.save(window.__MARKET__.engine.snapshot()));
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect((await state(page)).money).toBe(current.money);
  expect((await state(page)).totalServed).toBe(current.totalServed);
  await expect(page.locator('#money-value')).toHaveText(`$${current.money}`);
  expect(errors).toEqual([]);
});

test('upgrade hold, corn production, hired cashier, tutorial and settings persistence', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__MARKET__.setPaused(true);
    // Fixture funds exercise upgrades without waiting through several minutes of sales.
    window.__MARKET__.engine.economy.earn(1000);
    window.__MARKET__.engine.state.player = { x: 1138, y: 551 };
  });
  await advance(page, 1300);
  expect((await state(page)).unlockedProducts).toContain('corn');
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 685, y: 590 };
  });
  await advance(page, 11_000);
  expect((await state(page)).inventory.corn).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 685, y: 295 };
  });
  await advance(page, 1200);
  expect((await state(page)).shelves.corn).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 1138, y: 658 };
  });
  await advance(page, 1300);
  expect((await state(page)).cashier).toBe(true);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 400, y: 650 };
  });
  await advance(page, 55_000);
  expect((await state(page)).totalServed).toBeGreaterThan(0);
  expect((await state(page)).tutorialStep).toBe(6);
  await page.evaluate(() => window.__MARKET__.save.save(window.__MARKET__.engine.snapshot()));
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect((await state(page)).cashier).toBe(true);
  expect((await state(page)).tutorialStep).toBe(6);
  await page.getByRole('button', { name: 'Turn sound off' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Reset game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my market' }).click();
  expect((await state(page)).cashier).toBe(true);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Reset game', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset game' }).click();
  await page.waitForFunction(
    () => window.__MARKET__?.ready && window.__MARKET__.engine.state.money === 0,
  );
  expect((await state(page)).cashier).toBe(false);
  expect((await state(page)).upgrades.corn).toBe(0);
});

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [844, 390],
  [390, 844],
]) {
  test(`canvas and controls fit ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openGame(page);
    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    await expect(page.locator('#money-value')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('touch joystick moves the player and releases cleanly', async ({ browser, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'CDP sends actual touch gestures in Chromium; layout is tested in every engine.',
  );
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}?debug=true`);
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.locator('#joystick')).toBeVisible();
  const box = (await page.locator('#joystick').boundingBox())!;
  const initial = await state(page);
  const client = await context.newCDPSession(page);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...center, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: center.x + 27, y: center.y, id: 1 }],
  });
  await page.waitForTimeout(700);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await state(page)).player.x).toBeGreaterThan(initial.player.x + 80);
  const stopped = (await state(page)).player.x;
  await page.waitForTimeout(250);
  expect((await state(page)).player.x).toBeCloseTo(stopped, 0);
  await context.close();
});
