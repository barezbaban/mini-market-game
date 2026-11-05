import { expect, test, type Page } from '@playwright/test';
import { noEnglish } from './helpers/localization';

async function open(page: Page, kurdish = true) {
  if (kurdish) await page.addInitScript(() => localStorage.setItem('kurdmart.language', 'ckb'));
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#debug-panel')!.style.display = 'none';
    window.__MARKET__.engine.state.safePause = true;
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`Sorani menus and world signs fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.fonts.check('700 20px "Noto Sans Arabic"'))).toBe(
      true,
    );
    await noEnglish(page, '.game-frame');
    await page.screenshot({ path: `/private/tmp/kurdmart-sorani-${viewport.width}-play.png` });
    await page.locator('#manage-button').click();
    for (const category of ['store', 'goals', 'farms', 'machines', 'staff']) {
      await page.locator(`#management-tab-${category}`).click();
      await page
        .locator('#management-dialog details')
        .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)));
      await noEnglish(page, '#management-dialog');
      expect(
        await page
          .locator('#management-dialog')
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
    }
    await page.locator('#management-tab-goals').click();
    await page.screenshot({ path: `/private/tmp/kurdmart-sorani-${viewport.width}-goals.png` });
    await page.locator('#management-close').click();
    if (await page.locator('#toolbar-toggle').isVisible())
      await page.locator('#toolbar-toggle').click();
    await page.locator('#settings-button').click();
    await noEnglish(page, '#settings-dialog');
    expect(
      await page
        .locator('#settings-dialog')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: `/private/tmp/kurdmart-sorani-${viewport.width}-settings.png` });
    await page.locator('#dialog-close').click();
    await page.locator('#help-button').click();
    await page
      .locator('#settings-dialog details')
      .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)));
    await noEnglish(page, '#settings-dialog');
    await page.locator('#dialog-close').click();
    await page.locator('#account-button').click();
    await noEnglish(page, '#account-dialog');
  });
}

test('language switch preserves progress, preferences and English fallback', async ({ page }) => {
  await open(page, false);
  await page.evaluate(() => {
    const state = window.__MARKET__.engine.state;
    state.money = 4321;
    state.cameraZoom = 1.25;
    state.inventory.tomato = 3;
  });
  await page.locator('#settings-button').click();
  await page.getByRole('button', { name: 'کوردی (سۆرانی)', exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.lang === 'ckb' && window.__MARKET__?.ready,
  );
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(4321);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.inventory.tomato)).toBe(3);
  await page.locator('#settings-button').click();
  await expect(page.locator('#language-ckb')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.lang === 'en' && window.__MARKET__?.ready,
  );
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(4321);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.cameraZoom)).toBe(1.25);
});

test('denied storage keeps the current language and unsaved market open', async ({ page }) => {
  await open(page, false);
  await page.locator('#settings-button').click();
  await page.evaluate(() => {
    window.__MARKET__.engine.state.money = 7654;
    Storage.prototype.setItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
  });
  await page.locator('#language-ckb').click();
  await expect(page.locator('#language-status')).toContainText('Could not save your language');
  await expect(page.locator('#language-en')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(7654);
});

test('a direct Sorani market link leaves the saved language alone until the player chooses', async ({
  page,
}) => {
  await open(page, false);
  await page.evaluate(() => localStorage.setItem('kurdmart.language', 'en'));
  await page.goto('./?debug=true&lang=ckb');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => localStorage.getItem('kurdmart.language'))).toBe('en');
  await page.locator('#settings-button').click();
  await page.locator('#language-ckb').click();
  expect(new URL(page.url()).search).toBe('?debug=true');
  expect(await page.evaluate(() => localStorage.getItem('kurdmart.language'))).toBe('ckb');
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
  await page.goto('./?debug=true&lang=ckb');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.locator('#settings-button').click();
  await page.locator('#language-en').click();
  await page.waitForFunction(
    () => document.documentElement.lang === 'en' && window.__MARKET__?.ready,
  );
  expect(new URL(page.url()).search).toBe('?debug=true');
});

test('a Sorani browser starts in Kurdish without changing stored game data', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ckb-IQ' });
  try {
    const page = await context.newPage();
    await page.goto(`${test.info().project.use.baseURL}?debug=true`);
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
    await page.evaluate(() => {
      window.__MARKET__.engine.state.safePause = true;
      window.__MARKET__.engine.state.money = 123456;
    });
    await page.locator('#manage-button').click();
    await noEnglish(page, '#management-dialog');
  } finally {
    await context.close();
  }
});

test('RTL quantities, physical key legends, navigation and contract confirmation stay correct', async ({
  page,
}) => {
  await open(page);
  const coordinates = await page.locator('#basket-count').evaluate((element) => {
    const text = element.firstChild!;
    const positions = [];
    for (let i = 0; i < text.textContent!.length; i++) {
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      positions.push(range.getBoundingClientRect().x);
    }
    return positions;
  });
  expect(coordinates[0]).toBeLessThan(coordinates.at(-1)!);
  const keys = await page
    .locator('.desktop-controls kbd')
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x));
  expect(keys).toEqual([...keys].sort((a, b) => a - b));
  await page.evaluate(() => {
    window.__MARKET__.engine.state.totalServed = 20;
  });
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-store').press('ArrowLeft');
  await expect(page.locator('#management-tab-farms')).toBeFocused();
  await page.locator('#management-tab-goals').click();
  await page.locator('[data-contract="produce"]').click();
  await page.locator('#cancel-contract').click();
  await noEnglish(page, '.confirmation-dialog');
  await page.locator('[data-confirm="no"]').click();
  expect(await page.evaluate(() => window.__MARKET__.engine.state.career.contract)).not.toBeNull();
  await page.locator('#cancel-contract').click();
  await page.locator('[data-confirm="yes"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.career.contract))
    .toBeNull();
});

test('all unlocked departments, staff and canvas labels are localized', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.money = 1e8;
    engine.state.xp = 100000;
    engine.state.totalServed = 500;
    for (const id of [
      'expansion',
      'corn',
      'pasteMachine',
      'coffeeMachine',
      'grillMachine',
      'dairyMachine',
      'strawberryBeds',
      'wheatPlots',
      'jamKettle',
      'breadOven',
      'juicePress',
      'cashier',
      'helpers',
      'driveThrough',
      'driveRunner',
      'driveCashier',
      'secondCashier',
    ] as const)
      for (let i = 0; i < 4; i++) engine.purchaseUpgrade(id);
  });
  await page.waitForTimeout(250);
  const labels = await page.evaluate(() => {
    const labels: { text: string; sourceText: string; fits: boolean }[] = [];
    window.__MARKET__.world.scene.traverse((object) => {
      if (object.userData.worldLabel) labels.push(object.userData.worldLabel);
    });
    return labels;
  });
  expect(labels.filter((label) => /[A-Za-z]/.test(label.text))).toEqual([]);
  expect(labels.filter((label) => !label.fits)).toEqual([]);
  await page.locator('#manage-button').click();
  for (const category of ['store', 'goals', 'farms', 'machines', 'staff']) {
    await page.locator(`#management-tab-${category}`).click();
    await page
      .locator('#management-dialog details')
      .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)));
    await noEnglish(page, '#management-dialog');
  }
  await page.screenshot({ path: '/private/tmp/kurdmart-sorani-staff.png' });
});
