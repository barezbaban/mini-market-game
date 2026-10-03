import { expect, test, type Page } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';

async function view(page: Page) {
  return page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    const { x, y } = engine.state.player;
    const from = world.screenPosition(x, y);
    const to = world.screenPosition(x + 50, y);
    return {
      zoom: world.camera.zoom,
      size: Math.hypot(to.x - from.x, to.y - from.y),
      bufferWidth: world.renderer.domElement.width,
      bufferHeight: world.renderer.domElement.height,
      saved: engine.state.cameraZoom,
    };
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`camera zoom is live, accessible, saved and reversible at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./?debug=true');
    await page.waitForFunction(() => window.__MARKET__?.ready);
    const normal = await view(page);
    expect(normal.zoom).toBe(1);
    if (await page.locator('#toolbar-toggle').isVisible())
      await page.locator('#toolbar-toggle').click();
    await page.getByRole('button', { name: 'Open settings' }).click();
    const slider = page.getByRole('slider', { name: 'Camera zoom' });
    await expect(slider).toHaveValue('100');
    await expect(page.getByRole('button', { name: 'Reset zoom' })).toBeDisabled();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('105');
    await expect(slider).toHaveAttribute('aria-valuetext', '105% zoom');
    await slider.fill('175');
    await expect(page.locator('#camera-zoom-value')).toHaveText('175%');
    const close = await view(page);
    expect(close.zoom).toBe(1.75);
    expect(close.saved).toBe(1.75);
    expect(close.size / normal.size).toBeCloseTo(1.75, 3);
    expect(close.bufferWidth).toBe(normal.bufferWidth);
    expect(close.bufferHeight).toBe(normal.bufferHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await page.screenshot({ path: `test-results/zoom-settings-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.reload();
    await page.waitForFunction(() => window.__MARKET__?.ready);
    expect((await view(page)).zoom).toBe(1.75);
    expect((await view(page)).saved).toBe(1.75);

    // Reframing on device rotation must preserve the player's chosen magnification.
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expect.poll(async () => (await view(page)).bufferWidth).not.toBe(close.bufferWidth);
    expect((await view(page)).zoom).toBe(1.75);
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await view(page)).bufferWidth).toBe(close.bufferWidth);
    if (await page.locator('#toolbar-toggle').isVisible())
      await page.locator('#toolbar-toggle').click();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(slider).toHaveValue('175');
    await slider.fill('75');
    expect((await view(page)).size / normal.size).toBeCloseTo(0.75, 3);
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await expect(slider).toHaveValue('100');
    await expect(slider).toBeFocused();
    expect((await view(page)).zoom).toBe(1);
    await page.reload();
    await page.waitForFunction(() => window.__MARKET__?.ready);
    expect((await view(page)).zoom).toBe(1);
  });
}

test('maximum zoom keeps the avatar visible at map edges and the drive-through', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.cameraZoom = 1.75;
    engine.state.upgrades.driveThrough = 1;
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const point of [
      { x: 105, y: 160 },
      { x: 1430, y: 160 },
      { x: 1430, y: 1560 },
      { x: 105, y: 1560 },
      GAME_CONFIG.driveThroughPlayerSpot,
    ]) {
      await page.evaluate((position) => {
        const { engine, world } = window.__MARKET__;
        engine.state.player = position;
        for (let frame = 0; frame < 60; frame++) world.update(engine.state, 0, 50);
      }, point);
      const visible = await page.evaluate(() => {
        const { engine, world } = window.__MARKET__;
        return [0, 0.9].every((height) => {
          const point = world.screenPosition(engine.state.player.x, engine.state.player.y, height);
          return (
            point.visible &&
            point.x > 14 &&
            point.x < innerWidth - 14 &&
            point.y > 14 &&
            point.y < innerHeight - 14
          );
        });
      });
      expect(visible, `${viewport.width}px, player at ${JSON.stringify(point)}`).toBe(true);
    }
  }
});
