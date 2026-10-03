import { expect, test } from '@playwright/test';
import type { CustomerData } from '../src/game/types';

test('rush-hour controls, countdown pause, reward and audio settings survive reload', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.getByRole('button', { name: 'Manage market' }).click();
  await page.getByRole('button', { name: 'Start rush hour', exact: true }).click();
  await expect(page.locator('#management-dialog')).not.toBeVisible();
  await expect(page.locator('#rush-status')).toContainText('0/8 orders');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const frozen = await page.evaluate(() => window.__MARKET__.engine.state.rush.remainingMs);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.rush.remainingMs)).toBe(frozen);
  await page.getByRole('button', { name: 'Back to the market' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#effects-volume').fill('25');
  await page.locator('#music-volume').fill('0');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const result = await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    const before = engine.state.xp;
    engine.state.totalServed += 8;
    engine.rush.update(50);
    return {
      xp: engine.state.xp - before,
      effects: engine.state.effectsVolume,
      music: engine.state.musicVolume,
      rush: engine.state.rush,
    };
  });
  expect(result).toMatchObject({ xp: 100, effects: 0.25, music: 0, rush: { result: 'won' } });
});

test('grill, stock shelf and compact customer mood indicators render in the expanded store', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const result = await page.evaluate(() => {
    const { engine, world, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.money = 10000;
    for (let area = 0; area < 3; area++) engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('corn');
    engine.purchaseUpgrade('grillMachine');
    engine.state.player = { x: 2030, y: 560 };
    engine.state.shelves.grilledCorn = 12;
    const empty = Object.fromEntries(Object.keys(engine.state.inventory).map((id) => [id, 0]));
    engine.state.customers = [0, 70000, 110000].map(
      (patienceElapsed, index) =>
        ({
          id: index + 1,
          x: 2140,
          y: 305 + index * 40,
          state: 'WAITING_FOR_PRODUCT',
          targetProduct: 'grilledCorn',
          targetQuantity: 2,
          basket: { ...empty },
          color: 0x739ebd,
          waitTime: 0,
          patienceElapsed,
          path: [],
        }) as CustomerData,
    );
    for (let frame = 0; frame < 100; frame++) world.update(engine.state, frame * 40, 40);
    document.querySelector<HTMLElement>('#pause-overlay')!.style.display = 'none';
    document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
    return {
      moods: [0, 1, 2].map(
        (i) =>
          world.scene.getObjectByName('label:customer:' + i + ':patience')!.userData.worldLabel
            .text,
      ),
      machine: world.scene.getObjectByName('machine-grill')!.visible,
      shelf: world.scene.getObjectByName('label:shelf:grilledCorn:title')?.userData.worldLabel.text,
      shadows: world.renderer.shadowMap.enabled,
    };
  });
  expect(result.moods).toEqual(['🙂 ▰▰▰▰', '😐 ▰▰▱▱', '😠 ▰▱▱▱']);
  expect(result.machine).toBe(true);
  expect(result.shadows).toBe(false);
  await page.screenshot({ path: 'test-results/lively-grill.png' });
});

test('phone controls have large targets, a dead zone, multi-touch sprint and rotation recovery', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Real multitouch is sent through Chromium CDP.');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${test.info().project.use.baseURL}?debug=true`);
    await page.waitForFunction(() => window.__MARKET__?.ready);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#debug-panel')!.style.display = 'none';
    });
    await expect(page.locator('#sprint-button')).toBeVisible();
    for (const button of await page.locator('.toolbar button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const box = (await page.locator('#joystick').boundingBox())!;
    const sprint = (await page.locator('#sprint-button').boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    const client = await context.newCDPSession(page);
    const before = await page.evaluate(() => ({ ...window.__MARKET__.engine.state.player }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...center, x: center.x + 2 }],
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__MARKET__.engine.state.player)).toEqual(before);
    const move = { ...center, x: center.x + 35 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [move, { x: sprint.x + 30, y: sprint.y + 25, id: 2 }],
    });
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting))
      .toBe(true);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [move] });
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.sprinting))
      .toBe(false);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#joystick')).not.toHaveClass(/active/);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stopped = await page.evaluate(() => ({ ...window.__MARKET__.engine.state.player }));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__MARKET__.engine.state.player)).toEqual(stopped);
    await page.screenshot({ path: 'test-results/lively-phone-landscape.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Manage market' }).click();
    await page.getByRole('button', { name: 'Start rush hour', exact: true }).click();
    await expect(page.locator('#rush-status')).toBeVisible();
    await page.screenshot({ path: 'test-results/lively-phone-portrait.png' });
  } finally {
    await context.close();
  }
});
