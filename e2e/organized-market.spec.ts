import { expect, test } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { UPGRADES } from '../src/game/data/upgrades';
import { PRODUCTS } from '../src/game/data/products';
import { farmStandSpot } from '../src/game/data/standSpots';

for (const locale of ['en', 'ar', 'ckb']) {
  test(`movement settings fit a phone and save custom keys, speed and paid sprint levels in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`./?debug=true&lang=${locale}`);
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await page.evaluate(() => {
      window.__MARKET__.engine.state.money = 1000;
      window.__MARKET__.engine.state.player = { x: 1100, y: 1700 };
    });
    await page.locator('#toolbar-toggle').click();
    await page.locator('#settings-button').click();
    await page.locator('[data-action="up"][data-slot="0"]').click();
    await page.keyboard.press('i');
    await page.locator('[data-action="sprint"][data-slot="0"]').click();
    await page.keyboard.press('Space');
    await page.locator('[data-action="down"][data-slot="0"]').click();
    await page.keyboard.press('i');
    expect(await page.evaluate(() => window.__MARKET__.engine.state.controls.down[0])).toBe('KeyS');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.locator('#walk-speed').fill('125');
    await page.locator('#upgrade-sprint').click();
    const current = await page.evaluate(() => window.__MARKET__.engine.snapshot());
    expect(current.controls.up[0]).toBe('KeyI');
    expect(current.controls.sprint[0]).toBe('Space');
    expect(current.walkSpeed).toBe(1.25);
    expect(current.upgrades.sprint).toBe(1);
    expect(current.money).toBe(910);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.locator('#dialog-close').click();
    await expect(page.locator('#game-canvas')).toBeFocused();
    await page.keyboard.down('i');
    await page.keyboard.down('Space');
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting))
      .toBe(true);
    await page.keyboard.up('Space');
    await page.keyboard.up('i');
    await page.reload();
    await page.waitForFunction(() => window.__MARKET__?.ready);
    const restored = await page.evaluate(() => window.__MARKET__.engine.snapshot());
    expect(restored.controls.up[0]).toBe('KeyI');
    expect(restored.walkSpeed).toBe(1.25);
    expect(restored.upgrades.sprint).toBe(1);
  });
}

test('expanded delivery route does not pick up crops, and all display types retain readable counts', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(
    ({ ids }) => {
      const { engine } = window.__MARKET__;
      engine.state.money = 1e9;
      engine.state.xp = 1e9;
      engine.state.totalServed = 1000;
      for (let pass = 0; pass < 31; pass++) for (const id of ids) engine.purchaseUpgrade(id);
      engine.drainEvents();
      engine.state.player = { x: 1100, y: 1200 };
    },
    { ids: UPGRADES.map((u) => u.id) },
  );
  await page.waitForFunction(() => !!window.__MARKET__.world.scene.getObjectByName('shelf-bread'));
  const kinds = await page.evaluate(() => {
    const { world } = window.__MARKET__;
    return ['tomato', 'egg', 'grilledCorn', 'groundCoffee', 'bread'].map(
      (id) => world.scene.getObjectByName(`shelf-${id}`)?.userData.displayKind,
    );
  });
  expect(kinds).toEqual(['produce', 'chilled', 'heated', 'pantry', 'bakery']);
  const result = await page.evaluate((destination) => {
    const { engine, setPaused, world } = window.__MARKET__;
    setPaused(true);
    engine.state.player = { x: 1050, y: 1170 };
    for (let i = 0; i < 130; i++) engine.update(50, { x: 0, y: 1 });
    world.update(engine.state, 10000, 16);
    return { inventory: engine.state.inventory, player: engine.state.player, destination };
  }, GAME_CONFIG.driveThroughPlayerSpot);
  expect(Object.values(result.inventory).every((v) => v === 0)).toBe(true);
  expect(result.player.y).toBeGreaterThan(2300);
  expect(PRODUCTS.every((p) => !p.shelf.facing)).toBe(true);
  // Deliberate collection still works after crossing the map.
  await page.evaluate(
    (spot) => {
      const { engine } = window.__MARKET__;
      engine.state.player = spot;
      engine.update(1000);
    },
    farmStandSpot('tomato', 0),
  );
  expect(
    await page.evaluate(() => window.__MARKET__.engine.state.inventory.tomato),
  ).toBeGreaterThan(0);
});
