import { expect, test } from '@playwright/test';

// Run against an isolated Vite server with VITE_API_URL set to its loopback URL.
// Requests are intercepted below; this test never contacts a real account.
test('manual cloud UI preserves local play on network failure, retries once and reviews conflicts', async ({
  page,
}) => {
  test.skip(process.env.KURDMART_CLOUD_UI !== '1', 'Requires the isolated API-configured preview.');
  type Stored = {
    revision: number;
    mutationId: string;
    state: Record<string, unknown>;
    updatedAt: string;
  };
  let remote: Stored | null = null;
  let loseResponse = true;
  let writes = 0;
  const uploaded: Array<{ revision: number; mutationId: string; state: Record<string, unknown> }> =
    [];
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: { user: { id: 'test-player', email: 'test@example.com', displayName: 'Test market' } },
    }),
  );
  await page.route('**/api/save', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { save: remote } });
    const body = route.request().postDataJSON();
    uploaded.push(body);
    if (remote?.mutationId === body.mutationId) return route.fulfill({ json: { save: remote } });
    if ((remote?.revision ?? 0) !== body.revision)
      return route.fulfill({ status: 409, json: { code: 'SAVE_CONFLICT' } });
    remote = { ...body, revision: body.revision + 1, updatedAt: new Date().toISOString() };
    writes++;
    if (loseResponse) {
      loseResponse = false;
      return route.abort('failed');
    }
    return route.fulfill({ json: { save: remote } });
  });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect(page.locator('#account-button')).toHaveAttribute(
    'aria-label',
    'Account: Test market',
  );
  await page.evaluate(() => {
    window.__MARKET__.engine.state.money = 123;
  });
  await page.locator('#account-button').click();
  await expect(page.locator('#cloud-upload')).toBeDisabled();
  await page.locator('#cloud-refresh').click();
  await expect(page.locator('#cloud-status')).toContainText('No cloud backup yet');
  await page.locator('#cloud-upload').click();
  await expect(page.locator('#cloud-upload')).toHaveText('Retry same upload');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(123);
  await page.evaluate(() => {
    window.__MARKET__.engine.state.money = 321;
  });
  await page.locator('#cloud-upload').click();
  await expect(page.locator('#cloud-status')).toContainText('Uploaded safely');
  expect(uploaded[1]).toEqual(uploaded[0]);
  expect(writes).toBe(1);
  expect(uploaded[0].state.money).toBe(123);
  remote = {
    ...(remote as unknown as Stored),
    revision: 2,
    mutationId: 'other-device',
    state: { ...uploaded[0].state, money: 999 },
  };
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#cloud-upload').click();
  await expect(page.locator('#cloud-status')).toContainText('Nothing was overwritten');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(321);
  expect(remote.state.money).toBe(999);
  await page.locator('#cloud-refresh').click();
  await expect(page.locator('#cloud-status')).toContainText('$999');
  await page.evaluate(() => window.__MARKET__.save.save(window.__MARKET__.engine.snapshot()));
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#cloud-restore').click();
  await page.waitForFunction(
    () => window.__MARKET__?.ready && window.__MARKET__.engine.state.money === 999,
  );
  expect(
    await page.evaluate(() => JSON.parse(window.__MARKET__.save.previousBackup()!).money),
  ).toBe(321);
});
