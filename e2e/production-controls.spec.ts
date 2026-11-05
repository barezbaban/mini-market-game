import { expect, test, type Page } from '@playwright/test';

async function openMachines(page: Page) {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.safePause = true;
    engine.state.money = 1e8;
    engine.state.xp = 100000;
    engine.state.totalServed = 500;
    for (let i = 0; i < 4; i++) engine.purchaseUpgrade('expansion');
    for (const id of [
      'corn',
      'pasteMachine',
      'coffeeMachine',
      'dairyMachine',
      'grillMachine',
    ] as const)
      engine.purchaseUpgrade(id);
    document.querySelector<HTMLElement>('#debug-panel')!.style.display = 'none';
  });
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-machines').click();
  await expect(page.locator('.production-plan')).toHaveCount(4);
}

for (const { width, height, locale } of [
  { width: 1440, height: 900, locale: 'en' },
  { width: 390, height: 844, locale: 'en' },
  { width: 844, height: 390, locale: 'en' },
  { width: 390, height: 844, locale: 'ckb' },
]) {
  test(`machine controls fit and work at ${width}x${height} in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (language) => localStorage.setItem('kurdmart.language', language),
      locale,
    );
    await openMachines(page);
    const panel = page.locator('.production-plans');
    await expect(panel.locator('select')).toHaveCount(0);
    await expect(panel.getByRole('radio')).toHaveCount(24);
    expect(
      await panel.evaluate((root) =>
        [
          root,
          ...root.querySelectorAll('.production-plan, .staff-focus-tile, .production-stock'),
        ].every((element) => element.scrollWidth <= element.clientWidth + 1),
      ),
    ).toBe(true);
    for (const machine of ['paste', 'coffee', 'dairy', 'grill']) {
      await page.locator(`#machine-${machine}-policy-shelf-first`).check();
      await expect(page.locator(`#machine-${machine}-policy-shelf-first`)).toBeChecked();
      await page.locator(`#machine-${machine}-batch-full`).check();
      await expect(page.locator(`#machine-${machine}-batch-full`)).toBeChecked();
      const input = page.locator(`#machine-${machine}-stock`);
      const value = Number(await input.inputValue());
      await page.locator(`#machine-${machine}-stock-more`).click();
      await expect(input).toHaveValue(String(value + 1));
    }
    if (locale === 'ckb') {
      expect(await panel.innerText()).not.toMatch(/[A-Za-z]{2,}/);
      const labels = await panel
        .locator('[aria-label]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
      expect(labels.filter((text) => /[A-Za-z]{2,}/.test(text ?? ''))).toEqual([]);
      await expect(panel).toHaveCSS('direction', 'rtl');
    }
    const targets = panel.locator(
      'input[type="radio"], .stock-stepper button, .stock-stepper input',
    );
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#machine-paste-heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/private/tmp/kurdmart-machines-${locale}-${width}-top.png` });
    await page.locator('#machine-paste-batch-full').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/private/tmp/kurdmart-machines-${locale}-${width}-bottom.png` });
  });
}

test('machine choices support keyboard navigation, independent plans and saved selection', async ({
  page,
}) => {
  await openMachines(page);
  const policy = page.getByRole('group', { name: 'Tomato cannery helper allocation' });
  await policy.getByRole('radio', { name: 'Balanced rounds' }).focus();
  await page.keyboard.press('ArrowRight');
  const selected = policy.getByRole('radio', { name: 'Fill fresh shelf, then process' });
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  await page.evaluate(() => {
    document.querySelector('.production-plans')!.setAttribute('data-before-refresh', 'yes');
    window.__MARKET__.engine.state.money += 1;
  });
  await expect(page.locator('.production-plans')).not.toHaveAttribute('data-before-refresh');
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  await page.locator('#machine-paste-batch-full').check();
  await page.locator('#machine-paste-stock').fill('8');
  await page.locator('#machine-paste-stock').press('Tab');
  await page.locator('#machine-coffee-policy-paused').check();
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const career = await page.evaluate(() => window.__MARKET__.engine.state.career);
  expect(career.machinePolicies.paste).toBe('shelf-first');
  expect(career.machinePolicies.coffee).toBe('paused');
  expect(career.machinePolicies.dairy).toBe('balanced');
  expect(career.batchModes.paste).toBe('full');
  expect(career.batchModes.coffee).toBe('quick');
  expect(career.stockTargets.tomato).toBe(8);
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-machines').click();
  await expect(page.locator('#machine-paste-policy-shelf-first')).toBeChecked();
  await expect(page.locator('#machine-coffee-policy-paused')).toBeChecked();
  await expect(page.locator('#machine-paste-batch-full')).toBeChecked();
  await expect(page.locator('#machine-paste-stock')).toHaveValue('8');
});

test('shelf target buttons and typed values respect capacity and update boundary states', async ({
  page,
}) => {
  await openMachines(page);
  const input = page.locator('#machine-paste-stock');
  const less = page.locator('#machine-paste-stock-less');
  const more = page.locator('#machine-paste-stock-more');
  const capacity = Number(await input.getAttribute('max'));
  await input.fill('999');
  await input.press('Tab');
  await expect(input).toHaveValue(String(capacity));
  await expect(more).toBeDisabled();
  await less.click();
  await expect(input).toHaveValue(String(capacity - 1));
  await expect(more).toBeEnabled();
  await input.fill('-5');
  await input.press('Tab');
  await expect(input).toHaveValue('0');
  await expect(less).toBeDisabled();
  await more.click();
  await expect(input).toHaveValue('1');
  await expect(less).toBeEnabled();
  await input.fill('4.8');
  await input.press('Tab');
  await expect(input).toHaveValue('4');
  await input.focus();
  await input.press('ArrowUp');
  await input.press('Tab');
  await expect(input).toHaveValue('5');
  expect(await page.evaluate(() => window.__MARKET__.engine.state.career.stockTargets.tomato)).toBe(
    5,
  );
});
