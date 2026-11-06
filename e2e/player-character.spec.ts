import { expect, test } from '@playwright/test';
import type { SkinnedMesh } from 'three';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`Blender player renders, turns and carries stock at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?debug=true&lang=ar');
    await page.waitForFunction(() => window.__MARKET__?.ready);
    const first = await page.evaluate(() => {
      const { engine, world } = window.__MARKET__;
      const skin = world.scene.getObjectByName('PlayerSkin') as SkinnedMesh;
      engine.state.player = { x: 750, y: 1000 };
      engine.state.inventory.tomato = 20;
      return {
        bones: skin.skeleton.bones.length,
        vertices: skin.geometry.getAttribute('position').count,
      };
    });
    expect(first.bones).toBe(15);
    expect(first.vertices).toBeLessThan(6000);
    await page.keyboard.down('ArrowRight');
    await expect
      .poll(() => page.evaluate(() => window.__MARKET__.engine.state.player.x))
      .toBeGreaterThan(790);
    await page.keyboard.up('ArrowRight');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const player = window.__MARKET__.world.scene.getObjectByName('player-character')!;
          return player.getObjectByName('carried-produce')!.visible;
        }),
      )
      .toBe(true);
    const pose = await page.evaluate(() => {
      const p = window.__MARKET__.world.scene.getObjectByName('player-character')!;
      const c = p.getObjectByName('carried-produce')!;
      const skin = p.getObjectByName('PlayerSkin') as SkinnedMesh;
      const v = p.position.clone();
      skin.computeBoundingBox();
      return {
        facing: p.rotation.y,
        cargo: c.position.toArray(),
        samples: p.getObjectByName('player-tray-items')!.children.length,
        finite: skin.skeleton.bones.every((b) =>
          b.getWorldPosition(v).toArray().every(Number.isFinite),
        ),
        bodyHeight: skin.boundingBox!.max.y - skin.boundingBox!.min.y,
      };
    });
    expect(pose.finite).toBe(true);
    expect(Math.abs(pose.facing)).toBeGreaterThan(0.2);
    expect(pose.cargo[2]).toBeGreaterThan(0.13);
    expect(pose.samples).toBe(6);
    expect(pose.bodyHeight).toBeGreaterThan(0.6);
    expect(pose.bodyHeight).toBeLessThan(0.8);
    expect(errors).toEqual([]);
  });
}

test('a missing Blender player falls back without blocking gameplay', async ({ page }) => {
  await page.route('**/models/player.glb', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  expect(
    await page.evaluate(() => !!window.__MARKET__.world.scene.getObjectByName('PlayerSkin')),
  ).toBe(false);
  const before = await page.evaluate(() => window.__MARKET__.engine.state.player.x);
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => window.__MARKET__.engine.state.player.x))
    .toBeGreaterThan(before + 20);
  await page.keyboard.up('ArrowRight');
});
