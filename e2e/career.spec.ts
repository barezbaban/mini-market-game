import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#debug-panel')!.style.display = 'none';
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`new market guidance, compact controls and goals fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.locator('#goal-guide')).toBeVisible();
    const guide = await page.locator('#goal-guide').boundingBox();
    expect(guide!.x).toBeGreaterThanOrEqual(0);
    expect(guide!.x + guide!.width).toBeLessThanOrEqual(viewport.width);
    expect(guide!.y).toBeGreaterThanOrEqual(0);
    expect(guide!.y + guide!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: `/private/tmp/kurdmart-career-${viewport.width}-play.png` });
    await page.locator('#manage-button').click();
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rush hour', exact: false })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Goals' }).click();
    await expect(page.getByRole('heading', { name: 'First stall' })).toBeVisible();
    await expect(page.locator('[data-contract="produce"]')).toBeDisabled();
    expect(
      await page
        .locator('#management-dialog')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: `/private/tmp/kurdmart-career-${viewport.width}-goals.png` });
  });
}

test('milestone claims, staff choices and production plans are usable and persist', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.safePause = true;
    engine.state.money = 10000;
    engine.state.xp = 19000;
    engine.state.totalServed = 20;
    engine.purchaseUpgrade('helpers');
    engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('pasteMachine');
  });
  await page.locator('#manage-button').click();
  await page.getByRole('tab', { name: 'Staff' }).click();
  await page
    .getByRole('group', { name: 'Helper 1 focus' })
    .getByRole('radio', { name: 'Machines', exact: true })
    .check();
  await page.getByRole('tab', { name: 'Machines' }).click();
  await page.locator('[data-machine-policy="paste"]').selectOption('shelf-first');
  await page.locator('[data-stock-target="tomato"]').fill('8');
  await page.locator('[data-stock-target="tomato"]').press('Tab');
  await page.locator('[data-batch-mode="paste"]').selectOption('full');
  await page.getByRole('tab', { name: 'Goals' }).click();
  await page.locator('[data-claim-goal="first-sale"]').click();
  await expect(page.locator('[data-claim-goal="first-sale"]')).toHaveCount(0);
  await page.locator('[data-contract="produce"]').click();
  await expect(page.locator('#claim-contract')).toBeDisabled();
  await page.evaluate(() => window.__MARKET__.save.save(window.__MARKET__.engine.snapshot()));
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const state = await page.evaluate(() => window.__MARKET__.engine.snapshot());
  expect(state.workers[0].priority).toBe('machines');
  expect(state.career.machinePolicies.paste).toBe('shelf-first');
  expect(state.career.stockTargets.tomato).toBe(8);
  expect(state.career.batchModes.paste).toBe('full');
  expect(state.career.claimed).toContain('first-sale');
  expect(state.career.contract?.kind).toBe('produce');
});

test('low-power rendering, safe pause and explicit backup import preserve the market', async ({
  page,
}) => {
  await open(page);
  await page.locator('#settings-button').click();
  await page.locator('#low-power').check();
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.world.renderer.getPixelRatio()))
    .toBe(1);
  const before = await page.evaluate(() => window.__MARKET__.engine.state.elapsed);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.elapsed))
    .toBeGreaterThan(before + 150);
  await page.locator('#safe-pause').check();
  const paused = await page.evaluate(() => window.__MARKET__.engine.state.elapsed);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.elapsed)).toBe(paused);
  const backup = await page.evaluate(() => {
    const { engine, save } = window.__MARKET__;
    const state = engine.snapshot();
    state.money = 12345;
    return save.export(state);
  });
  await page.locator('#import-backup').setInputFiles({
    name: 'market.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.locator('#backup-preview')).toContainText('12,345');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).not.toBe(12345);
  await page.locator('#confirm-import').click();
  await page.waitForFunction(
    () => window.__MARKET__?.ready && window.__MARKET__.engine.state.money === 12345,
  );
  expect(await page.evaluate(() => window.__MARKET__.engine.state.lowPower)).toBe(true);
  expect(await page.evaluate(() => window.__MARKET__.save.previousBackup())).not.toBeNull();
});

test('a management menu protects an ongoing theft while farming continues', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const state = window.__MARKET__.engine.state;
    state.cashStacks.store.amount = 120;
    state.security.thief = {
      x: 1040,
      y: 845,
      phase: 'STEALING',
      target: 'store',
      stolen: 0,
      elapsed: 11900,
      path: [],
    };
  });
  await page.locator('#manage-button').click();
  const before = await page.evaluate(() => window.__MARKET__.engine.state.elapsed);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.elapsed))
    .toBeGreaterThan(before + 250);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.cashStacks.store.amount)).toBe(
    120,
  );
  expect(await page.evaluate(() => window.__MARKET__.engine.state.security.thief?.phase)).toBe(
    'STEALING',
  );
});

test('low-power mode really limits rendering without slowing simulation on a high-DPI display', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${test.info().project.use.baseURL}?debug=true`);
    await page.waitForFunction(() => window.__MARKET__?.ready);
    expect(await page.evaluate(() => window.__MARKET__.world.renderer.getPixelRatio())).toBe(1.5);
    const result = await page.evaluate(async () => {
      const { engine, world } = window.__MARKET__;
      engine.state.lowPower = true;
      const original = world.update.bind(world);
      let renders = 0;
      world.update = (...args) => {
        renders++;
        return original(...args);
      };
      const time = performance.now(),
        played = engine.state.elapsed;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      world.update = original;
      return {
        elapsed: performance.now() - time,
        simulated: engine.state.elapsed - played,
        renders,
        ratio: world.renderer.getPixelRatio(),
      };
    });
    expect(result.ratio).toBe(1);
    expect(result.renders).toBeGreaterThan(10);
    expect(result.renders / (result.elapsed / 1000)).toBeLessThanOrEqual(32);
    expect(result.simulated / result.elapsed).toBeGreaterThan(0.85);
    expect(result.simulated / result.elapsed).toBeLessThan(1.15);
  } finally {
    await context.close();
  }
});
