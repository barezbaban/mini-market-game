import { expect, test } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Manage keeps farming, checkout, XP and rush cooldown live at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./?debug=true');
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await page.locator('#manage-button').click();
    const before = await page.evaluate((queueStart) => {
      const { engine } = window.__MARKET__;
      const state = engine.state;
      state.cashier = true;
      state.totalServed = 7;
      Object.assign(state.rush, {
        remainingMs: 15000,
        cooldownMs: 0,
        servedAtStart: 0,
        completed: 7,
        result: 'none',
      });
      Object.assign(state.farms.tomato.plots[0], { ready: 0, elapsed: 2900 });
      state.customers = [
        {
          id: 999,
          ...queueStart,
          state: 'QUEUEING',
          targetProduct: 'tomato',
          targetQuantity: 1,
          basket: { ...state.inventory, tomato: 1 },
          color: 0x739ebd,
          waitTime: 0,
          path: [],
          queueOrder: 1,
        },
      ];
      return { player: { ...state.player }, xp: state.xp, money: state.money };
    }, GAME_CONFIG.queueStart);
    await page.keyboard.down('d');
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.farms.tomato.ready))
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.rush.result))
      .toBe('won');
    await page.keyboard.up('d');
    const after = await page.evaluate(() => window.__MARKET__.engine.snapshot());
    expect(after.player).toEqual(before.player);
    expect(after.money).toBe(before.money); // Staff still stack money for manual collection.
    expect(after.cashStacks.store.amount).toBeGreaterThan(0);
    expect(after.xp).toBeGreaterThanOrEqual(before.xp + 107);
    await expect(page.locator('#management-xp')).toContainText(`${after.xp} XP`);
    await expect(page.locator('#management-rush-result')).toContainText('completed! +100 XP');
    await expect(page.locator('#start-rush')).toBeDisabled();

    // Shorten only this isolated fixture's cooldown. Let the real animation loop finish it.
    await page.evaluate(() => {
      window.__MARKET__.engine.state.rush.cooldownMs = 2400;
      document.querySelector<HTMLDetailsElement>('.progression-overview details')!.open = true;
      document.querySelector<HTMLElement>('#management-tab-store')!.focus();
      document.querySelector<HTMLElement>('.management-content')!.scrollTop = 180;
      document.querySelector('#start-rush')!.setAttribute('data-retained-node', 'yes');
    });
    await expect(page.locator('#start-rush')).toHaveText(/Ready in [123]s/);
    await expect(page.locator('#start-rush')).toBeEnabled();
    await expect(page.locator('#start-rush')).toHaveText('Start rush hour');
    await expect(page.locator('#start-rush')).toHaveAttribute('data-retained-node', 'yes');
    await expect(page.locator('#management-tab-store')).toBeFocused();
    expect(
      await page
        .locator('.progression-overview details')
        .evaluate((node) => (node as HTMLDetailsElement).open),
    ).toBe(true);
    expect(await page.locator('.management-content').evaluate((node) => node.scrollTop)).toBe(180);

    await page.locator('#start-rush').click();
    await expect(page.locator('#management-dialog')).not.toBeVisible();
    await page.locator('#manage-button').click();
    await expect(page.locator('#start-rush')).toHaveText(/In progress/);
    await expect(page.locator('#start-rush')).toBeDisabled();
    await page.evaluate(() => {
      window.__MARKET__.engine.state.rush.remainingMs = 250;
    });
    await expect(page.locator('#management-rush-result')).toContainText('Last rush: 0/8');
    await expect(page.locator('#start-rush')).toHaveText(/Ready in/);
    const cooldown = await page.evaluate(() => window.__MARKET__.engine.state.rush.cooldownMs);
    await page.locator('#management-close').click();
    await page.locator('#manage-button').click();
    expect(await page.evaluate(() => window.__MARKET__.engine.state.rush.cooldownMs)).toBeLessThan(
      cooldown,
    );
    await expect(page.locator('#management-status')).toContainText('keeps running');
  });
}

test('hidden tabs suspend timers without catch-up and return to a live Manage screen', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.locator('#manage-button').click();
  const hiddenAt = await page.evaluate(() => {
    window.__MARKET__.engine.state.rush.cooldownMs = 10000;
    // Exercise the lifecycle listener deterministically without changing the user's browser tabs.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return window.__MARKET__.engine.state.elapsed;
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.elapsed)).toBe(hiddenAt);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.rush.cooldownMs)).toBe(10000);
  const returned = await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    return window.__MARKET__.engine.state.rush.cooldownMs;
  });
  expect(returned).toBe(10000);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.rush.cooldownMs))
    .toBeLessThan(9700);
  await expect(page.locator('#management-dialog')).toBeVisible();
  await expect(page.locator('#start-rush')).toHaveText(/Ready in/);
});
