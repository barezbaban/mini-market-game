import { expect, test, type Page } from '@playwright/test';
import { UPGRADES } from '../src/game/data/upgrades';

async function open(page: Page): Promise<void> {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
}

test('management buys every expansion with real costs, caps levels, and preserves purchases on reload', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    // Isolated browser fixture funds, never applied to a player's saved game.
    window.__MARKET__.engine.economy.earn(100000);
  });
  await page.locator('#manage-button').click();
  const dialog = page.locator('#management-dialog');
  await expect(dialog).toBeVisible();
  const pausedAt = await page.evaluate(() => window.__MARKET__.engine.state.elapsed);
  await page.locator('#management-tab-machines').click();
  await expect(page.locator('#buy-pasteMachine')).toBeDisabled();
  await page.locator('#management-tab-staff').click();
  await expect(page.locator('#buy-helperCapacity')).toBeDisabled();

  const order = [
    'expansion',
    'corn',
    'inventory',
    'cashier',
    'customers',
    'helpers',
    'helperCapacity',
    'helperSpeed',
    'accountant',
    'tomatoPlots',
    'eggPlots',
    'cornPlots',
    'coffeePlots',
    'carrotPlots',
    'pasteMachine',
    'coffeeMachine',
  ];
  let expectedMoney = 100000;
  for (const id of order) {
    const upgrade = UPGRADES.find((entry) => entry.id === id)!;
    await page.locator(`#management-tab-${upgrade.category}`).click();
    for (let level = 0; level < upgrade.maxLevel; level++) {
      await page.locator(`#buy-${id}`).click();
      expectedMoney -= Math.ceil(upgrade.cost * upgrade.costGrowth ** level);
      expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(expectedMoney);
    }
    await expect(page.locator(`#buy-${id}`)).toBeDisabled();
  }
  expect(await page.evaluate(() => window.__MARKET__.engine.state.elapsed)).toBe(pausedAt);
  const before = await page.evaluate(() => window.__MARKET__.engine.snapshot());
  expect(before.workers).toHaveLength(3);
  expect(before.unlockedProducts).toHaveLength(7);
  expect(Object.values(before.shelfCapacities)).toEqual(Array(7).fill(12));
  expect(before.upgrades.helperCapacity).toBe(4);
  expect(before.upgrades.helperSpeed).toBe(9);
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const after = await page.evaluate(() => window.__MARKET__.engine.snapshot());
  expect(after.money).toBe(expectedMoney);
  expect(after.upgrades).toEqual(before.upgrades);
  expect(after.workers).toHaveLength(3);
  expect(await page.evaluate(() => window.__MARKET__.world.renderer.shadowMap.enabled)).toBe(false);
});

test('fully staffed expanded store earns money and XP with no player harvesting', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  const result = await page.evaluate(() => {
    const { engine, setPaused, save, world } = window.__MARKET__;
    setPaused(true);
    engine.economy.earn(100000);
    for (const id of [
      'expansion',
      'corn',
      'cashier',
      'helpers',
      'helperCapacity',
      'helperSpeed',
      'tomatoPlots',
      'eggPlots',
      'cornPlots',
      'coffeePlots',
      'carrotPlots',
      'pasteMachine',
      'coffeeMachine',
      'accountant',
    ] as const) {
      while (engine.purchaseUpgrade(id)) {
        /* buy up to the real cap */
      }
    }
    engine.state.player = { x: 105, y: 920 };
    const startingMoney = engine.state.money;
    const sold = new Set<string>();
    for (let time = 0; time < 900000; time += 50) {
      const baskets = new Map(
        engine.state.customers.map((customer) => [customer.id, { ...customer.basket }]),
      );
      engine.update(50);
      for (const customer of engine.state.customers) {
        if (customer.state !== 'LEAVING') continue;
        for (const [id, count] of Object.entries(baskets.get(customer.id) ?? {}))
          if (count > 0) sold.add(id);
      }
      engine.drainEvents();
    }
    world.update(engine.state, engine.state.elapsed, 0);
    const state = engine.snapshot();
    save.save(state);
    return { state, startingMoney, sold: [...sold] };
  });
  expect(result.state.totalServed).toBeGreaterThan(40);
  expect(result.state.money).toBeGreaterThan(result.startingMoney);
  expect(result.state.xp).toBeGreaterThan(1000);
  expect(result.sold.sort()).toEqual([
    'carrot',
    'coffee',
    'corn',
    'egg',
    'groundCoffee',
    'tomato',
    'tomatoPaste',
  ]);
  expect(Object.values(result.state.inventory).every((count) => count === 0)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.totalServed)).toBe(
    result.state.totalServed,
  );
  expect(await page.evaluate(() => window.__MARKET__.engine.state.xp)).toBeGreaterThanOrEqual(
    result.state.xp,
  );
  expect(errors).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`management remains usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.locator('#manage-button').click();
    for (const category of ['store', 'farms', 'machines', 'staff']) {
      await page.locator(`#management-tab-${category}`).click();
      const box = await page.locator('#management-dialog').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    }
    await page.locator('#management-close').click();
    await expect(page.locator('#management-dialog')).not.toBeVisible();
    await expect(page.locator('#pause-overlay')).not.toBeVisible();
  });
}
