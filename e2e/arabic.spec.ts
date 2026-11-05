import { expect, test } from '@playwright/test';
import { noEnglish } from './helpers/localization';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

test('Arabic translates expanded departments, world signs, settings, help and guest account', async ({
  page,
}) => {
  await page.goto('./?lang=ar&debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page).toHaveTitle('مدير المتجر الصغير');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.safePause = true;
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
  await expect
    .poll(() =>
      page.evaluate(() => {
        const signs: string[] = [];
        window.__MARKET__.world.scene.traverse((node) => {
          const sign = node.userData.worldLabel;
          if (sign) signs.push(sign.text);
        });
        return signs;
      }),
    )
    .toContain('صندوق الدفع ٢');
  const badSigns = await page.evaluate(() => {
    const broken: string[] = [];
    window.__MARKET__.world.scene.traverse((node) => {
      const sign = node.userData.worldLabel;
      if (sign && (!sign.fits || /[a-z]/i.test(sign.text))) broken.push(sign.text);
    });
    return broken;
  });
  expect(badSigns).toEqual([]);
  await noEnglish(page, '.game-frame');
  await page.locator('#manage-button').click();
  for (const category of ['goals', 'store', 'farms', 'machines', 'staff']) {
    await page.locator(`#management-tab-${category}`).click();
    await page
      .locator('#management-dialog details')
      .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
    await noEnglish(page, '#management-dialog');
  }
  await page.locator('#management-close').click();
  for (const id of ['settings', 'help', 'account']) {
    await page.locator(`#${id}-button`).click();
    const selector = id === 'account' ? '#account-dialog' : '#settings-dialog';
    await page
      .locator(`${selector} details`)
      .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
    await noEnglish(page, selector);
    if (id === 'settings')
      await expect(page.locator('#language-ar')).toHaveAttribute('aria-pressed', 'true');
    if (id !== 'account') await page.locator('#dialog-close').click();
  }
});

test('Settings switches from English to Arabic, keeps the market and remembers the choice', async ({
  page,
}) => {
  await page.goto('./?lang=en&debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.money = 4321;
    window.__MARKET__.engine.state.inventory.tomato = 3;
  });
  await page.locator('#settings-button').click();
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.lang === 'ar' && window.__MARKET__?.ready,
  );
  expect(
    await page.evaluate(() => [
      window.__MARKET__.engine.state.money,
      window.__MARKET__.engine.state.inventory.tomato,
    ]),
  ).toEqual([4321, 3]);
  expect(await page.evaluate(() => localStorage.getItem('kurdmart.language'))).toBe('ar');
  expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
  await page.goto('./?lang=ckb&debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
  await page.goto('./?debug=true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test.describe('Arabic on a touch phone', () => {
  test.use({
    locale: 'ar-IQ',
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  test('detects the browser language and keeps controls reachable in portrait and landscape', async ({
    page,
  }) => {
    await page.goto('./?debug=true');
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 640 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      const objective = await page.locator('.objective').boundingBox();
      const sprint = await page.locator('#sprint-button').boundingBox();
      expect(objective).toBeTruthy();
      expect(sprint).toBeTruthy();
      expect(
        objective!.x + objective!.width <= sprint!.x ||
          sprint!.x + sprint!.width <= objective!.x ||
          objective!.y + objective!.height <= sprint!.y ||
          sprint!.y + sprint!.height <= objective!.y,
      ).toBe(true);
      await page.locator('#manage-button').tap();
      await page.locator('#management-tab-farms').tap();
      await noEnglish(page, '#management-dialog');
      expect(
        await page
          .locator('#management-dialog')
          .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
      await page.locator('#management-close').tap();
    }
  });
});
