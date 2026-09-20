import { expect, test, type Page } from '@playwright/test';
import type { WorldRenderer } from '../src/game/rendering/WorldRenderer';
import type { GameEngine } from '../src/game/systems/GameEngine';
import type { SaveSystem } from '../src/game/systems/SaveSystem';
import type { GameState } from '../src/game/types';
import stuckQueue from '../tests/fixtures/stuck-queue.json' with { type: 'json' };

declare global {
  interface Window {
    __MARKET__: {
      engine: GameEngine;
      save: SaveSystem;
      world: WorldRenderer;
      setPaused(paused: boolean): void;
      ready: boolean;
    };
  }
}

async function openGame(page: Page): Promise<void> {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.world.renderer.info.render.calls))
    .toBeGreaterThan(0);
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

/** Navigate with actual screen-relative keys while the angled camera follows. */
async function walkTo(page: Page, target: { x: number; y: number }): Promise<void> {
  let held: string[] = [];
  const deadline = Date.now() + 12_000;
  try {
    while (Date.now() < deadline) {
      const offset = await page.evaluate((destination) => {
        const { engine, world } = window.__MARKET__;
        const { player } = engine.state;
        const from = world.screenPosition(player.x, player.y);
        const to = world.screenPosition(destination.x, destination.y);
        return {
          x: to.x - from.x,
          y: to.y - from.y,
          distance: Math.hypot(destination.x - player.x, destination.y - player.y),
        };
      }, target);
      if (offset.distance < 12) return;
      const desired: string[] = [];
      if (Math.abs(offset.x) > Math.abs(offset.y) * 0.42)
        desired.push(offset.x > 0 ? 'ArrowRight' : 'ArrowLeft');
      if (Math.abs(offset.y) > Math.abs(offset.x) * 0.42)
        desired.push(offset.y > 0 ? 'ArrowDown' : 'ArrowUp');
      for (const key of held.filter((entry) => !desired.includes(entry)))
        await page.keyboard.up(key);
      for (const key of desired.filter((entry) => !held.includes(entry)))
        await page.keyboard.down(key);
      held = desired;
      await page.waitForTimeout(65);
    }
    const current = (await state(page)).player;
    expect(
      Math.hypot(target.x - current.x, target.y - current.y),
      'keyboard target distance',
    ).toBeLessThan(12);
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
}

async function expectStopped(page: Page): Promise<void> {
  const stopped = (await state(page)).player;
  await page.waitForTimeout(250);
  const after = (await state(page)).player;
  expect(Math.hypot(after.x - stopped.x, after.y - stopped.y)).toBeLessThan(0.5);
}

test('keyboard harvest, shelf stocking, customer payment, and reload persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  const initial = await state(page);
  await walkTo(page, { x: 265, y: 590 });
  await expect.poll(async () => (await state(page)).inventory.tomato).toBeGreaterThan(0);
  expect((await state(page)).player.x).toBeLessThan(initial.player.x - 120);
  await walkTo(page, { x: 265, y: 295 });
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
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  expect((await state(page)).soundEnabled).toBe(false);
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

test('a saved blocked queue resumes cashier sales without resetting progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((saved) => {
    const key = 'mini-market-manager.save.v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
  }, stuckQueue);
  await openGame(page);
  const initial = await state(page);
  expect(initial.cashier).toBe(true);
  expect(initial.upgrades).toEqual(stuckQueue.upgrades);
  expect(initial.money).toBe(stuckQueue.money);

  // Exercise the actual browser frame loop first, not just accelerated test time.
  await expect
    .poll(async () => (await state(page)).totalServed, { timeout: 20_000 })
    .toBeGreaterThan(stuckQueue.totalServed);
  await expect.poll(async () => (await state(page)).money).toBeGreaterThan(stuckQueue.money);
  await page.evaluate(() => {
    window.__MARKET__.setPaused(true);
    for (let time = 0; time < 60_000; time += 16) window.__MARKET__.engine.update(16);
    window.__MARKET__.save.save(window.__MARKET__.engine.snapshot());
  });
  const recovered = await state(page);
  expect(recovered.totalServed).toBeGreaterThanOrEqual(
    stuckQueue.totalServed + stuckQueue.customers.length,
  );
  const originalIds = new Set(stuckQueue.customers.map((customer) => customer.id));
  expect(recovered.customers.filter((customer) => originalIds.has(customer.id))).toEqual([]);
  expect(recovered.upgrades).toEqual(stuckQueue.upgrades);
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const restored = await state(page);
  expect(restored.money).toBe(recovered.money);
  expect(restored.totalServed).toBe(recovered.totalServed);
  expect(restored.upgrades).toEqual(stuckQueue.upgrades);
  expect(errors).toEqual([]);
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

test('following camera keeps the whole avatar visible at world edges and after rotation', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => window.__MARKET__.setPaused(true));
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const player of [
      { x: 105, y: 160 },
      { x: 1210, y: 160 },
      { x: 1210, y: 703 },
      { x: 105, y: 703 },
    ]) {
      const before = await page.evaluate((position) => {
        const camera = window.__MARKET__.world.camera.position;
        window.__MARKET__.engine.state.player = position;
        return { x: camera.x, z: camera.z };
      }, player);
      await expect
        .poll(
          () =>
            page.evaluate((previous) => {
              const camera = window.__MARKET__.world.camera.position;
              return Math.hypot(camera.x - previous.x, camera.z - previous.z);
            }, before),
          { intervals: [100], timeout: 5000 },
        )
        .toBeGreaterThan(0.1);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const { world, engine } = window.__MARKET__;
              const player = engine.state.player;
              const canvas = world.renderer.domElement.getBoundingClientRect();
              const feet = world.screenPosition(player.x, player.y, 0);
              const head = world.screenPosition(player.x, player.y, 0.9);
              return [feet, head].every(
                (point) =>
                  point.x >= 14 &&
                  point.x <= canvas.width - 14 &&
                  point.y >= 14 &&
                  point.y <= canvas.height - 14,
              );
            }),
          { intervals: [100], timeout: 5000 },
        )
        .toBe(true);
    }
  }
});

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
  await expect
    .poll(async () => {
      const player = (await state(page)).player;
      return Math.hypot(player.x - initial.player.x, player.y - initial.player.y);
    })
    .toBeGreaterThan(60);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expectStopped(page);
  await expect(page.locator('#joystick')).not.toHaveClass(/active/);
  // Browser interruptions cancel a gesture too; the next frame must receive no input.
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...center, id: 2 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: center.x - 27, y: center.y, id: 2 }],
  });
  await expect(page.locator('#joystick')).toHaveClass(/active/);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expectStopped(page);
  await expect(page.locator('#joystick')).not.toHaveClass(/active/);
  await context.close();
});

test('dragging anywhere moves the player and pause clears held keyboard and pointer input', async ({
  page,
}) => {
  await openGame(page);
  const canvas = (await page.locator('canvas').boundingBox())!;
  const start = { x: canvas.x + canvas.width * 0.58, y: canvas.y + canvas.height * 0.6 };
  const initial = (await state(page)).player;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y);
  await expect(page.locator('#joystick')).toHaveClass(/dragging-surface/);
  await expect
    .poll(async () => {
      const player = (await state(page)).player;
      return Math.hypot(player.x - initial.x, player.y - initial.y);
    })
    .toBeGreaterThan(45);
  await page.mouse.up();
  await expectStopped(page);
  await expect(page.locator('#joystick')).not.toHaveClass(/dragging-surface/);

  await page.keyboard.down('s');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Back to the market' })).toBeVisible();
  await page.mouse.up();
  await expectStopped(page);
  await page.getByRole('button', { name: 'Back to the market' }).click();
  await expectStopped(page);
  await page.keyboard.up('s');
  await expect(page.locator('#joystick')).not.toHaveClass(/active|dragging-surface/);
});

test('keyboard movement resumes after toolbar use and world clicks while dialogs retain focus', async ({
  page,
}) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Turn sound off' }).click();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  const afterSound = (await state(page)).player;
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(afterSound.x + 35);
  } finally {
    await page.keyboard.up('d');
  }
  await expectStopped(page);

  // A prior toolbar focus must also be recoverable by an ordinary world click.
  await page.locator('#sound-button').focus();
  await expect(page.locator('#sound-button')).toBeFocused();
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.6);
  await expect(page.locator('#game-canvas')).toBeFocused();
  const afterCanvas = (await state(page)).player;
  await page.keyboard.down('a');
  try {
    await expect.poll(async () => (await state(page)).player.x).toBeLessThan(afterCanvas.x - 35);
  } finally {
    await page.keyboard.up('a');
  }
  await expectStopped(page);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#dialog-sound').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.querySelector('#settings-dialog')!.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.down('d');
  try {
    await expectStopped(page);
  } finally {
    await page.keyboard.up('d');
  }
});
