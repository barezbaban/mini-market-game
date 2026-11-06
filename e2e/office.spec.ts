import { expect, test } from '@playwright/test';
import { OFFICE } from '../src/game/data/office';
import { UPGRADES } from '../src/game/data/upgrades';
import { noEnglish } from './helpers/localization';

for (const lang of ['en', 'ar', 'ckb']) {
  test(`office rooms, staff upgrades and manual vault collection work on a phone in ${lang}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`./?debug=true&lang=${lang}`);
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await page.evaluate((office) => {
      const { engine, setPaused, world } = window.__MARKET__;
      setPaused(true);
      engine.state.money = 1e8;
      engine.state.xp = 500000;
      engine.state.totalServed = 1000;
      engine.purchaseUpgrade('accountant');
      engine.purchaseUpgrade('customers');
      engine.state.office.vault = 1250;
      engine.state.player = { ...office.accountantSeat };
      engine.state.tutorialStep = 6;
      engine.state.career.cashierStockLesson = false;
      for (let i = 0; i < 40; i++) world.update(engine.state, 16 * i, 100);
      document.querySelector<HTMLElement>('#pause-overlay')!.style.display = 'none';
      document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
    }, OFFICE);
    const accessText = await page.evaluate(
      () =>
        window.__MARKET__.world.scene.getObjectByName('label:office:vault:access')!.userData
          .worldLabel.text,
    );
    if (lang !== 'en') expect(accessText).not.toMatch(/[a-z]{2}/i);
    else expect(accessText).toBe('MANAGER · ACCOUNTANT');
    for (const [id, spot] of [
      ['customers', OFFICE.marketingSeat],
      ['accountant', OFFICE.accountantSeat],
      ['manager', OFFICE.managerSeat],
      ['vault', OFFICE.vaultCollect],
    ] as const) {
      const result = await page.evaluate(
        ({ id, spot }) => {
          const { engine, world } = window.__MARKET__;
          engine.state.player = { ...spot };
          for (let i = 0; i < 36; i++) world.update(engine.state, i * 16, 100);
          const label = world.scene.getObjectByName(`label:office:${id}:title`)!;
          const p = label.position.clone().set(0, 0, 0);
          label.localToWorld(p);
          p.project(world.camera);
          return {
            text: label.userData.worldLabel.text,
            x: p.x,
            y: p.y,
            room: Boolean(
              world.scene.getObjectByName(`office-room-${id === 'customers' ? 'marketing' : id}`),
            ),
          };
        },
        { id, spot },
      );
      expect(result.room).toBe(true);
      expect(Math.abs(result.x)).toBeLessThan(1);
      expect(Math.abs(result.y)).toBeLessThan(1);
      if (lang !== 'en') expect(result.text).not.toMatch(/[a-z]{2}/i);
      await page.screenshot({ path: `test-results/office-${id}-${lang}-mobile.png` });
    }
    const banked = await page.evaluate(() => {
      const { engine, save } = window.__MARKET__;
      const before = engine.state.money;
      engine.cashCollection.update(0);
      save.save(engine.snapshot());
      return { amount: engine.state.money - before, vault: engine.state.office.vault };
    });
    expect(banked).toEqual({ amount: 1250, vault: 0 });
    await page.locator('#manage-button').click();
    await page.locator('#management-tab-staff').click();
    await page.locator('#buy-accountant').click();
    expect(await page.evaluate(() => window.__MARKET__.engine.state.upgrades.accountant)).toBe(2);
    await expect(page.locator('[data-upgrade="accountant"]')).toContainText(
      lang === 'en' ? '$200' : '$٢٠٠',
    );
    if (lang !== 'en') await noEnglish(page, '#management-dialog');
    await page.locator('#management-tab-machines').click();
    if (lang !== 'en') await noEnglish(page, '#management-dialog');
    expect(
      await page.locator('#management-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.locator('#management-close').click();
    await page.reload();
    await page.waitForFunction(() => window.__MARKET__?.ready);
    expect(await page.evaluate(() => window.__MARKET__.engine.state.upgrades.accountant)).toBe(2);
    expect(await page.evaluate(() => window.__MARKET__.engine.state.office.vault)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('late-game office and staff use bounded visuals while all upgrades survive reload', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const result = await page.evaluate(
    ({ ids, office }) => {
      const { engine, world, save, setPaused } = window.__MARKET__;
      setPaused(true);
      engine.state.money = 1e10;
      engine.state.xp = 500000;
      engine.state.totalServed = 1000;
      for (let pass = 0; pass < 50; pass++) for (const id of ids) engine.purchaseUpgrade(id);
      engine.state.office.vault = 1e6;
      engine.state.player = { x: -390, y: 660 };
      engine.state.cameraZoom = 1.1;
      for (let i = 0; i < 40; i++) world.update(engine.state, i * 16, 100);
      const cash = world.scene.getObjectByName('vault-banknotes')!;
      const room = world.scene.getObjectByName('office-room-manager')!;
      let chairs = 0;
      world.scene.traverse((o) => {
        if (o.name === 'office-chair') chairs++;
      });
      const accountant = world.scene.getObjectByName('office-accountant')!;
      const from = accountant.position.clone();
      engine.economy.deposit('store', 150);
      for (let i = 0; i < 100; i++) {
        engine.office.update(50);
        world.update(engine.state, i * 50, 50);
      }
      const moved = accountant.position.distanceTo(from);
      engine.state.player = { ...office.vaultCollect };
      engine.cashCollection.update(0);
      save.save(engine.snapshot());
      document.querySelector<HTMLElement>('#pause-overlay')!.style.display = 'none';
      document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
      return {
        bundles: (cash as unknown as { count: number }).count,
        helpers: engine.state.workers.length,
        carts: engine.state.upgrades.carts + 3,
        chairs,
        room: !!room,
        moved,
        owned: engine.state.upgrades,
      };
    },
    { ids: UPGRADES.map((u) => u.id), office: OFFICE },
  );
  expect(result.bundles).toBeLessThanOrEqual(48);
  expect(result.chairs).toBe(3);
  expect(result.room).toBe(true);
  expect(result.moved).toBeGreaterThan(1);
  expect(result.helpers).toBe(20);
  expect(result.carts).toBe(50);
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.upgrades)).toEqual(result.owned);
});

test('camera-relative keyboard movement passes through the market side door into the office', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.player = { x: 160, y: 640 };
  });
  await page.locator('#game-canvas').focus();
  await page.keyboard.down('a');
  let up = false;
  try {
    // A moves screen-left, diagonally across the isometric world. Steer with W
    // to follow the visible horizontal hall instead of walking into its wall.
    await expect
      .poll(
        async () => {
          const p = await page.evaluate(() => window.__MARKET__.engine.state.player);
          if (p.y > 645 && !up) {
            await page.keyboard.down('w');
            up = true;
          }
          if (p.y < 635 && up) {
            await page.keyboard.up('w');
            up = false;
          }
          return p.x;
        },
        { timeout: 8000, intervals: [50] },
      )
      .toBeLessThan(-350);
  } finally {
    await page.keyboard.up('a');
    await page.keyboard.up('w');
  }
  const position = await page.evaluate(() => window.__MARKET__.engine.state.player);
  expect(position.y).toBeGreaterThan(610);
  expect(position.y).toBeLessThan(670);
  expect(position.x).toBeGreaterThan(-780);
});
