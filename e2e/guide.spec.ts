import { expect, test } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';

for (const width of [1440, 390]) {
  for (const lowPower of [false, true]) {
    test(`checkout guide stays anchored while moving at ${width}px, low power ${lowPower}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./?debug=true');
      await page.waitForFunction(() => window.__MARKET__?.ready);
      await page.evaluate((lowPower) => {
        const { engine } = window.__MARKET__;
        engine.state.tutorialStep = 4;
        engine.state.player = { x: 1010, y: 810 };
        engine.state.lowPower = lowPower;
      }, lowPower);
      await expect(page.locator('#goal-guide small')).toHaveText('Serve here');
      await page.locator('#game-canvas').focus();
      await page.keyboard.down('ArrowLeft');
      let result;
      try {
        result = await page.evaluate(async (target) => {
          const { engine, world } = window.__MARKET__;
          const guide = document.querySelector<HTMLElement>('#goal-guide')!;
          const start = { ...engine.state.player };
          let frames = 0;
          let maxError = 0;
          let lastFrame = -1;
          const until = performance.now() + 1400;
          do {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const frame = world.renderer.info.render.frame;
            if (frame === lastFrame) continue;
            lastFrame = frame;
            frames++;
            const projected = world.screenPosition(target.x, target.y, 0.15);
            const canvas = world.renderer.domElement.getBoundingClientRect();
            const expectedX = Math.max(45, Math.min(canvas.width - 45, projected.x));
            const expectedY = Math.max(145, Math.min(canvas.height - 175, projected.y));
            const box = guide.getBoundingClientRect();
            maxError = Math.max(
              maxError,
              Math.hypot(
                box.x + box.width / 2 - canvas.x - expectedX,
                box.y + box.height / 2 - canvas.y - expectedY,
              ),
            );
          } while (performance.now() < until);
          return {
            frames,
            maxError,
            travelled: Math.hypot(engine.state.player.x - start.x, engine.state.player.y - start.y),
          };
        }, GAME_CONFIG.cashierSpot);
      } finally {
        await page.keyboard.up('ArrowLeft');
      }
      expect(result.frames).toBeGreaterThan(10);
      expect(result.travelled).toBeGreaterThan(50);
      // Allow subpixel layout rounding, but never a stale camera frame.
      expect(result.maxError).toBeLessThan(0.1);
      await page.locator('#manage-button').click();
      await expect(page.locator('#goal-guide')).toBeHidden();
      await page.getByRole('button', { name: 'Close management' }).click();
      await expect(page.locator('#goal-guide')).toBeVisible();
    });
  }
}
