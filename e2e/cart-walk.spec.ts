import { expect, test } from '@playwright/test';

test('the shared Blender clip drives shopping, turning, and checkout idle', async ({ page }) => {
  const loads: number[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/animations/cart-walk.glb')) loads.push(response.status());
  });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.engine.state.customers.length > 0);
  await expect.poll(() => loads).toEqual([200]);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    engine.state.safePause = true;
    setPaused(true);
  });
  const sample = await page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    const c = engine.state.customers[0];
    Object.assign(c, { state: 'MOVING_TO_SHELF', x: 605, y: 650 });
    world.update(engine.state, 1000, 16);
    const model = world.scene.getObjectByName('customer-character')!;
    const knee = model.getObjectByName('CartKneeL')!;
    const hand = model.getObjectByName('CartHandL')!;
    const grip = model.getObjectByName('cart-grip')!;
    const angles: number[] = [];
    let gripError = 0;
    for (let frame = 1; frame <= 72; frame++) {
      if (frame <= 36) c.x += 1;
      else c.y += 1;
      world.update(engine.state, 1000 + frame * 16, 16);
      angles.push(knee.rotation.x);
      const palm = hand.getWorldPosition(hand.position.clone());
      const local = grip.parent!.worldToLocal(palm);
      gripError = Math.max(
        gripError,
        Math.abs(local.y - grip.position.y),
        Math.abs(local.z - grip.position.z),
      );
    }
    c.state = 'QUEUEING';
    for (let i = 0; i < 60; i++) world.update(engine.state, 2200 + i * 16, 16);
    return {
      range: Math.max(...angles) - Math.min(...angles),
      idle: knee.rotation.x,
      gripError,
      yaw: model.rotation.y,
    };
  });
  expect(sample.range).toBeGreaterThan(0.35);
  expect(sample.gripError).toBeLessThan(0.001);
  expect(sample.idle).toBeCloseTo(2 * Math.acos(0.203 / 0.224), 3);
  expect(Math.abs(sample.yaw)).toBeLessThan(0.01);
});
