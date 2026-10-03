import { expect, test } from '@playwright/test';
import { PRODUCTS } from '../src/game/data/products';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`helper focus tiles fit, support keyboard and save independently at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./?debug=true');
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await page.evaluate(() => {
      const { engine } = window.__MARKET__;
      engine.state.safePause = true;
      engine.state.money = 10000;
      engine.state.xp = 19000;
      engine.purchaseUpgrade('helpers');
      engine.purchaseUpgrade('helpers');
    });
    await page.locator('#manage-button').click();
    await page.getByRole('tab', { name: 'Staff', exact: true }).click();
    const first = page.getByRole('group', { name: 'Helper 1 focus' });
    const second = page.getByRole('group', { name: 'Helper 2 focus' });
    await expect(page.locator('.staff-priorities select')).toHaveCount(0);
    await expect(first.getByRole('radio')).toHaveCount(5);
    await expect(first.getByRole('radio', { name: 'Balanced', exact: true })).toBeChecked();
    await expect(first.getByRole('radio', { name: 'Corn', exact: true })).toHaveCount(0);
    const inventory = await page.evaluate(() => window.__MARKET__.engine.state.workers[0].basket);
    await first.getByRole('radio', { name: 'Eggs', exact: true }).check();
    await expect(page.locator('#helper-1-focus-note')).toHaveText('Keep the eggs shelf supplied.');
    await expect(second.getByRole('radio', { name: 'Balanced', exact: true })).toBeChecked();
    expect(await page.evaluate(() => window.__MARKET__.engine.state.workers[0].basket)).toEqual(
      inventory,
    );
    // Native radio keys select within this helper's group, including the product choices.
    await first.getByRole('radio', { name: 'Eggs', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    const tomatoes = first.getByRole('radio', { name: 'Tomatoes', exact: true });
    await expect(tomatoes).toBeChecked();
    const balance = await page.evaluate(() => (window.__MARKET__.engine.state.money += 10));
    await expect(page.locator('#management-money')).toHaveText(
      `$${balance.toLocaleString('en-US')}`,
    );
    await expect(tomatoes).toBeFocused();
    await expect(tomatoes).toBeChecked();
    await second.getByRole('radio', { name: 'Machines', exact: true }).check();
    await expect(first.getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(second.getByRole('radio', { checked: true })).toHaveCount(1);
    await page.reload();
    await page.waitForFunction(() => window.__MARKET__?.ready);
    expect(
      await page.evaluate(() => window.__MARKET__.engine.state.workers.map((w) => w.priority)),
    ).toEqual(['tomato', 'machines']);
    await page.locator('#manage-button').click();
    await page.getByRole('tab', { name: 'Staff', exact: true }).click();
    await expect(tomatoes).toBeChecked();
    await expect(second.getByRole('radio', { name: 'Machines', exact: true })).toBeChecked();
    // A late-game catalog must wrap inside each card rather than opening over upgrades.
    await page.evaluate(
      (products) => {
        const { engine } = window.__MARKET__;
        engine.state.unlockedProducts = products;
      },
      PRODUCTS.map((product) => product.id),
    );
    await page.getByRole('tab', { name: 'Store', exact: true }).click();
    await page.getByRole('tab', { name: 'Staff', exact: true }).click();
    await expect(first.getByRole('radio')).toHaveCount(PRODUCTS.length + 3);
    const layout = await page.locator('.staff-priorities').evaluate((panel) => {
      const cards = [...panel.querySelectorAll('fieldset')];
      return {
        noScroll: panel.scrollWidth <= panel.clientWidth + 1,
        contained: cards.every((card) => {
          const bounds = card.getBoundingClientRect();
          return [...card.querySelectorAll('.staff-focus-tile')].every((tile) => {
            const box = tile.getBoundingClientRect();
            return (
              box.left >= bounds.left &&
              box.right <= bounds.right &&
              box.bottom <= bounds.bottom &&
              box.height >= 44
            );
          });
        }),
      };
    });
    expect(layout).toEqual({ noScroll: true, contained: true });
    await page.locator('.management-content').evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await page.screenshot({ path: `/private/tmp/kurdmart-staff-focus-${viewport.width}.png` });
  });
}
