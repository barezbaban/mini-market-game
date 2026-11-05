import { expect, test } from '@playwright/test';

// Isolated API-configured Vite only. Every account request is mocked, never a live account.
test('Sorani login validation, errors, user content and manual cloud restore', async ({ page }) => {
  test.skip(process.env.KURDMART_CLOUD_UI !== '1', 'Requires the isolated API-configured preview.');
  let registration: Record<string, string> | undefined;
  let stored: {
    revision: number;
    mutationId: string;
    state: Record<string, unknown>;
    updatedAt: string;
  } | null = null;
  await page.addInitScript(() => localStorage.setItem('kurdmart.language', 'ckb'));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { user: null } }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { code: 'INVALID_CREDENTIALS' } }),
  );
  await page.route('**/api/auth/register', (route) => {
    registration = route.request().postDataJSON();
    return route.fulfill({
      json: {
        user: {
          id: 'test-player',
          email: registration!.email,
          displayName: registration!.displayName,
        },
      },
    });
  });
  await page.route('**/api/save', (route) => {
    if (route.request().method() === 'POST')
      stored = {
        ...route.request().postDataJSON(),
        revision: 1,
        updatedAt: '2026-10-04T12:00:00Z',
      };
    return route.fulfill({ json: { save: stored } });
  });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.safePause = true;
    window.__MARKET__.engine.state.money = 1234;
  });
  await page.locator('#account-button').click();
  await page.locator('#auth-form button[type="submit"]').click();
  expect(
    await page.locator('[name="email"]').evaluate((n: HTMLInputElement) => n.validationMessage),
  ).toBe('تکایە ئەم خانەیە پڕ بکەرەوە.');
  await page.locator('[name="email"]').fill('player@example.com');
  await page.locator('[name="password"]').fill('long memorable password 123');
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator('#auth-message')).toHaveText('ئیمەیل یان وشەی نهێنی هەڵەیە.');
  await page.locator('#auth-register-tab').click();
  await page.locator('[name="displayName"]').fill('سۆران 123');
  await page.locator('[name="email"]').fill('player@example.com');
  await page.locator('[name="password"]').fill('long memorable password 123');
  await page.locator('#auth-form button[type="submit"]').click();
  await expect(page.locator('#account-name')).toHaveText('سۆران 123');
  await expect(page.locator('#account-email')).toHaveText('player@example.com');
  await expect(page.locator('#account-button')).toHaveAttribute('aria-label', 'هەژمار: سۆران 123');
  expect(registration).toEqual({
    displayName: 'سۆران 123',
    email: 'player@example.com',
    password: 'long memorable password 123',
  });
  await page.locator('#cloud-refresh').click();
  await expect(page.locator('#cloud-status')).toContainText('هێشتا پاشەکەوتی هەوری نییە');
  await page.locator('#cloud-upload').click();
  await expect(page.locator('#cloud-status')).toContainText('بە سەلامەتی بار کرا');
  expect(await page.locator('#cloud-status').textContent()).not.toMatch(/[A-Za-z]/);
  expect(stored!.state.money).toBe(1234);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.money = 9876;
    window.__MARKET__.save.save(window.__MARKET__.engine.snapshot());
  });
  await page.locator('#cloud-restore').click();
  await expect(page.locator('.confirmation-dialog')).toBeVisible();
  expect(await page.locator('.confirmation-dialog').textContent()).not.toMatch(/[A-Za-z]/);
  await page.locator('[data-confirm="no"]').click();
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(9876);
  await page.screenshot({ path: '/private/tmp/kurdmart-sorani-account.png' });
  await page.locator('#cloud-restore').click();
  await page.locator('[data-confirm="yes"]').click();
  await page.waitForFunction(
    () => window.__MARKET__?.ready && window.__MARKET__.engine.state.money === 1234,
  );
  expect(
    await page.evaluate(() => JSON.parse(window.__MARKET__.save.previousBackup()!).money),
  ).toBe(9876);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ckb');
});
