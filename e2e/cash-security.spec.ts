import { expect, test, type Page } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';

async function open(page: Page): Promise<void> {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
}

async function paint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { setPaused, world, engine } = window.__MARKET__;
    setPaused(false);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    setPaused(true);
    for (let index = 0; index < 50; index++) world.update(engine.state, engine.state.elapsed, 100);
    document.querySelector<HTMLElement>('#pause-overlay')!.style.display = 'none';
    document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
  });
}

test('cash piles, full counters and level-20 second checkout remain readable on desktop and phone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.money = 10000;
    engine.state.xp = 19000;
    engine.purchaseUpgrade('cashier');
    engine.purchaseUpgrade('secondCashier');
    engine.purchaseUpgrade('driveThrough');
    engine.economy.deposit('store', 250);
    engine.economy.deposit('second', 100);
    engine.economy.deposit('drive', 250);
    engine.state.player = { x: 980, y: 430 };
    engine.drainEvents();
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await paint(page);
    await expect(page.locator('#cash-ready')).toHaveText('Uncollected: $600');
    await expect(page.locator('#security-banner')).toContainText('closed');
    const labels = await page.evaluate(() => {
      const { scene, renderer } = window.__MARKET__.world;
      return {
        store: scene.getObjectByName('label:cash:store:status')?.userData.worldLabel.text,
        second: scene.getObjectByName('label:cash:second:status')?.userData.worldLabel.text,
        drive: scene.getObjectByName('label:cash:drive:status')?.userData.worldLabel.text,
        checkout: scene.getObjectByName('label:checkout:second:title')?.userData.worldLabel.text,
        shadows: renderer.shadowMap.enabled,
      };
    });
    expect(labels).toMatchObject({
      store: 'FULL · $250',
      second: 'PICK UP $100',
      drive: 'FULL · $250',
      checkout: 'CHECKOUT 2',
      shadows: false,
    });
    await page.screenshot({ path: `test-results/cash-checkouts-${viewport.width}.png` });
  }
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.player = { x: 1080, y: 920 };
  });
  await paint(page);
  await page.screenshot({ path: 'test-results/cash-drive-mobile.png' });
  expect(errors).toEqual([]);
});

test('keyboard and hold-button sprint expose the net, recover stolen cash once and save the capture', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.player = { x: 450, y: 450 };
    engine.state.security.thief = {
      x: 700,
      y: 450,
      phase: 'FLEEING',
      target: 'store',
      stolen: 120,
      elapsed: 0,
      path: [
        { x: 1210, y: 900 },
        { x: -250, y: 900 },
      ],
    };
    engine.state.totalEarned = 120;
  });
  await expect(page.locator('#security-banner')).toContainText('Thief fleeing with $120');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting)).toBe(true);
  await page.keyboard.up('Shift');
  await page.keyboard.up('ArrowRight');
  await page.setViewportSize({ width: 390, height: 844 });
  await paint(page);
  await expect(page.locator('#sprint-button')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const { scene } = window.__MARKET__.world;
      return (
        scene.getObjectByName('net-capture-area')?.visible &&
        scene.getObjectByName('player-catching-net')?.visible &&
        scene.getObjectByName('cash-thief')?.visible
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/cash-chase-mobile.png' });
  await page.evaluate(() => window.__MARKET__.setPaused(false));
  const button = await page.locator('#sprint-button').boundingBox();
  await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2);
  await page.mouse.down();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting)).toBe(true);
  await page.mouse.up();
  await page.keyboard.up('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting))
    .toBe(false);
  await page.evaluate((radius) => {
    const { engine } = window.__MARKET__;
    const thief = engine.state.security.thief!;
    engine.state.player = { x: thief.x - radius + 5, y: thief.y };
  }, GAME_CONFIG.netRadius);
  await expect(page.locator('#security-banner')).toContainText('Cash safe');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(120);
  await page.evaluate(() => window.__MARKET__.save.save(window.__MARKET__.engine.snapshot()));
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(120);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.security.thief?.phase)).toBe(
    'CAUGHT',
  );
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    for (let index = 0; index < 600 && engine.state.security.thief?.phase !== 'ESCORTED'; index++)
      engine.security.update(50);
  });
  await paint(page);
  expect(
    await page.evaluate(
      () => window.__MARKET__.world.scene.getObjectByName('police-officer')?.visible,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/cash-police-mobile.png' });
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(120);
});
