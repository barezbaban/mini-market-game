import { expect, test } from '@playwright/test';

test('purchased shelf rows are visible, capacity labels match stock, and upgrades survive reload', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.money = 100_000;
  });
  await page.locator('#manage-button').click();
  await expect(page.locator('#buy-shelf')).toBeDisabled();
  await expect(page.locator('[data-upgrade="shelf"]')).toContainText('Requires player level 3');
  await page.locator('#management-tab-goals').click();
  await expect(page.locator('.progression-overview')).toContainText(
    '5 XP for the customer + 2 XP per item',
  );
  await page.locator('#management-close').click();
  await page.evaluate(() => {
    window.__MARKET__.engine.state.xp = 19_000;
  });
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-store').click();
  for (let row = 4; row <= 6; row++) {
    await page.locator('#buy-shelf').click();
    await expect(page.locator('[data-upgrade="shelf"]')).toContainText(
      `${row} rows · ${row * 4} items`,
    );
  }
  await expect(page.locator('#buy-shelf')).toBeDisabled();
  await page.locator('#management-close').click();
  const visual = await page.evaluate(() => {
    const { engine, world, save } = window.__MARKET__;
    engine.state.shelves.tomato = 24;
    engine.state.player = { x: 475, y: 360 };
    world.update(engine.state, 16, 0);
    save.save(engine.snapshot());
    const shelf = world.scene.getObjectByName('shelf-tomato')!;
    let count = '';
    shelf.traverse((object) => {
      if (object.userData.worldLabel?.id === 'shelf:tomato:count')
        count = object.userData.worldLabel.text;
    });
    return {
      rows: shelf.children.filter((row) => row.name.startsWith('shelf-tomato:row-') && row.visible)
        .length,
      count,
    };
  });
  expect(visual).toEqual({ rows: 6, count: '24/24' });
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.shelfCapacities.tomato)).toBe(24);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.upgrades.shelf)).toBe(3);
});

test('level 20 unlocks one extra cart and the mobile roadmap stays inside the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.money = 100_000;
    engine.state.upgrades.carts = 7;
    engine.state.xp = 18_999;
  });
  await page.locator('#manage-button').click();
  await expect(page.locator('#buy-carts')).toBeDisabled();
  await expect(page.locator('[data-upgrade="carts"]')).toContainText('Requires player level 20');
  await page.locator('#management-close').click();
  await page.evaluate(() => {
    window.__MARKET__.engine.state.xp++;
  });
  await page.locator('#manage-button').click();
  await page.locator('#buy-carts').click();
  await expect(page.locator('[data-upgrade="carts"]')).toContainText('11 carts');
  await expect(page.locator('[data-upgrade="carts"]')).toContainText('Requires player level 22');
  await expect(page.locator('#buy-carts')).toBeDisabled();
  await page.locator('#management-tab-goals').click();
  await page.getByText('Player-level roadmap', { exact: true }).click();
  await page.locator('.progression-overview summary').click();
  await expect(page.locator('.milestone-list')).toBeVisible();
  expect(
    await page
      .locator('#management-dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.locator('#management-close').click();
  const carts = await page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    engine.state.customers = [];
    world.update(engine.state, 16, 0);
    return world.scene
      .getObjectByName('cart-station')!
      .children.filter((object) => object.name.startsWith('cart-station:') && object.visible)
      .length;
  });
  expect(carts).toBe(11);
});
