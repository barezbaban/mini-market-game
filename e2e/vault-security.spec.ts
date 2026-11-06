import { expect, test, type Page } from '@playwright/test';

/** Drive the real touch stick in world coordinates, accounting for the isometric camera. */
async function walk(
  page: Page,
  direction: { x: number; y: number },
  axis: 'x' | 'y',
  target: number,
) {
  const box = (await page.locator('#joystick').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const input = await page.evaluate((d) => {
    const rotation = window.__MARKET__.world.screenToWorldInput({ x: 1, y: 0 });
    return { x: rotation.x * d.x + rotation.y * d.y, y: -rotation.y * d.x + rotation.x * d.y };
  }, direction);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...center, x: center.x + input.x * 45, y: center.y + input.y * 45 }],
    });
    await expect
      .poll(
        async () => {
          const current = await page.evaluate(
            (axis) => window.__MARKET__.engine.state.player[axis],
            axis,
          );
          return direction[axis] > 0 ? current >= target : current <= target;
        },
        { timeout: 7000, intervals: [30] },
      )
      .toBe(true);
  } finally {
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  }
}

test('manager walks through the security door, collects cash and leaves using phone controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.office.doorOpen))
    .toBe(0);
  const before = await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.player = { x: -150, y: 640 };
    engine.state.office.vault = 350;
    engine.state.tutorialStep = 6;
    engine.state.career.cashierStockLesson = false;
    document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
    return engine.state.money;
  });
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.office.doorOpen))
    .toBe(1);
  const door = await page.evaluate(() => {
    const { world } = window.__MARKET__;
    return {
      opening: world.scene.getObjectByName('vault-security-door')!.userData.opening,
      left: world.scene.getObjectByName('vault-door-left')!.position.x,
      right: world.scene.getObjectByName('vault-door-right')!.position.x,
    };
  });
  expect(door.opening).toBe(1);
  expect(door.right - door.left).toBeGreaterThan(1.8);
  await walk(page, { x: 0, y: 1 }, 'y', 875);
  await walk(page, { x: 1, y: 0 }, 'x', -85);
  await expect.poll(() => page.evaluate(() => window.__MARKET__.engine.state.office.vault)).toBe(0);
  expect(await page.evaluate(() => window.__MARKET__.engine.state.money)).toBe(before + 350);
  await walk(page, { x: -1, y: 0 }, 'x', -150);
  await walk(page, { x: 0, y: -1 }, 'y', 565);
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.office.doorOpen))
    .toBe(0);
  expect(errors).toEqual([]);
});

test('accountant unlocks the door to deposit money and return to work', async ({ page }) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const result = await page.evaluate(() => {
    const { engine, world, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.upgrades.accountant = 1;
    const accountant = engine.state.office.accountant;
    accountant.carrying = 100;
    accountant.phase = 'PAPERWORK';
    accountant.elapsed = 2400;
    let opened = false;
    let entered = false;
    for (let i = 0; i < 300; i++) {
      engine.office.update(50);
      opened ||= engine.state.office.doorOpen === 1;
      entered ||= accountant.y > 800;
    }
    world.update(engine.state, 15000, 100);
    return {
      opened,
      entered,
      vault: engine.state.office.vault,
      phase: accountant.phase,
      carried: accountant.carrying,
      closed: world.scene.getObjectByName('vault-security-door')!.userData.opening === 0,
    };
  });
  expect(result).toEqual({
    opened: true,
    entered: true,
    vault: 100,
    phase: 'DESK',
    carried: 0,
    closed: true,
  });
});
