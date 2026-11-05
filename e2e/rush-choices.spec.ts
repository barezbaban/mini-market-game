import { expect, test, type Page } from '@playwright/test';

async function openRushChoices(page: Page, unlocked = true) {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate((ready) => {
    const state = window.__MARKET__.engine.state;
    state.safePause = true;
    if (ready) {
      state.totalServed = 150;
      state.upgrades.carts = 7;
      state.shelves.tomato = 12;
    }
    document.querySelector<HTMLElement>('#debug-panel')!.style.display = 'none';
  }, unlocked);
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-goals').click();
}

for (const { width, height, language } of [
  { width: 1440, height: 900, language: 'en' },
  { width: 390, height: 844, language: 'en' },
  { width: 844, height: 390, language: 'en' },
  { width: 390, height: 844, language: 'ckb' },
]) {
  test(`rush choices fit and select at ${width}x${height} in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (locale) => localStorage.setItem('kurdmart.language', locale),
      language,
    );
    await openRushChoices(page);
    const card = page.locator('.rush-card');
    await expect(card.locator('select')).toHaveCount(0);
    await expect(card.getByRole('radio')).toHaveCount(3);
    await expect(page.locator('#rush-tier-gentle')).toBeChecked();
    await page.locator('label[for="rush-tier-busy"]').click();
    await expect(page.locator('#rush-tier-busy')).toBeChecked();
    await expect(page.locator('#rush-tier-gentle')).not.toBeChecked();
    await expect(page.locator('#start-rush')).toBeEnabled();
    expect(
      await card.evaluate((root) => {
        const elements = [root, ...root.querySelectorAll('.rush-choice-tile, .rush-choice-stats')];
        return elements.every((element) => element.scrollWidth <= element.clientWidth + 1);
      }),
    ).toBe(true);
    for (const radio of await card.getByRole('radio').all()) {
      const box = await radio.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    if (language === 'ckb') {
      await expect(card).toHaveCSS('direction', 'rtl');
      expect(await card.innerText()).not.toMatch(/[A-Za-z]{2,}/);
    }
    // Capture the whole component, including short landscape viewports.
    await card.screenshot({ path: `/private/tmp/kurdmart-rush-${language}-${width}.png` });
    await page.locator('#start-rush').click();
    await expect(page.locator('#management-dialog')).not.toBeVisible();
    expect(
      await page.evaluate(() => {
        const { tier, goal, rewardXp } = window.__MARKET__.engine.state.rush;
        return { tier, goal, rewardXp };
      }),
    ).toEqual({ tier: 'busy', goal: 12, rewardXp: 150 });
  });
}

test('rush choices support keyboard navigation and retain selection after a refresh', async ({
  page,
}) => {
  await openRushChoices(page);
  const gentle = page.getByRole('radio', { name: 'Neighborhood rush 6 orders 75 XP', exact: true });
  const busy = page.getByRole('radio', { name: 'Busy market 12 orders 150 XP', exact: true });
  await gentle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(busy).toBeChecked();
  await expect(busy).toBeFocused();
  await page.evaluate(() => {
    document.querySelector('.rush-card')!.setAttribute('data-before-refresh', 'true');
    window.__MARKET__.engine.state.money += 1;
  });
  await expect(page.locator('.rush-card')).not.toHaveAttribute('data-before-refresh');
  await expect(busy).toBeChecked();
  await expect(busy).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#rush-tier-festival')).toBeChecked();
  await page.locator('#management-close').click();
  await page.locator('#manage-button').click();
  await expect(page.locator('#rush-tier-festival')).toBeChecked();
  await page.locator('#start-rush').click();
  expect(await page.evaluate(() => window.__MARKET__.engine.state.rush.goal)).toBe(20);
});

test('selecting a harder rush does not bypass its requirements or cooldown', async ({ page }) => {
  await openRushChoices(page, false);
  await page.locator('label[for="rush-tier-festival"]').click();
  await expect(page.locator('#start-rush')).toBeDisabled();
  await expect(page.locator('#start-rush')).toHaveText('Complete 150 paid orders first');
  await page.locator('label[for="rush-tier-gentle"]').click();
  await expect(page.locator('#start-rush')).toHaveText('Complete 10 paid orders first');
  await page.evaluate(() => {
    const state = window.__MARKET__.engine.state;
    state.totalServed = 150;
    state.upgrades.carts = 7;
    state.shelves.tomato = 12;
    state.rush.cooldownMs = 15000;
  });
  await expect(page.locator('#start-rush')).toHaveText('Ready in 15s');
  await page.locator('label[for="rush-tier-busy"]').click();
  await expect(page.locator('#start-rush')).toBeDisabled();
  await expect(page.locator('#start-rush')).toHaveText('Ready in 15s');
});
