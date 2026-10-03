import { expect, test } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { emptyItems } from '../src/game/data/products';

for (const width of [1440, 390]) {
  for (const zoom of [0.75, 1.75]) {
    test(`sale, thanks and level-up feedback stay separate at ${width}px and ${zoom} zoom`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./?debug=true');
      await page.waitForFunction(() => window.__MARKET__?.ready);
      await page.evaluate(
        ({ player, zoom }) => {
          const { engine } = window.__MARKET__;
          engine.state.player = player;
          engine.state.cameraZoom = zoom;
          engine.state.tutorialStep = 4;
          document.querySelector<HTMLElement>('#debug-panel')!.hidden = true;
        },
        { player: GAME_CONFIG.cashierSpot, zoom },
      );
      await page.waitForTimeout(500);
      await page.evaluate(
        ({ point, basket }) => {
          const { engine } = window.__MARKET__;
          engine.state.xp = 93;
          engine.state.customers = [
            {
              id: 1,
              ...point,
              state: 'QUEUEING',
              targetProduct: 'tomato',
              targetQuantity: 1,
              basket,
              color: 0x739ebd,
              waitTime: 0,
              path: [],
              queueOrder: 1,
            },
          ];
          engine.checkout.update(1000);
        },
        { point: GAME_CONFIG.queueStart, basket: { ...emptyItems(), tomato: 1 } },
      );
      await expect(page.locator('.world-float.checkout')).toHaveCount(2);
      await expect(page.locator('.world-float.upgrade')).toContainText('Market level 2!');
      const result = await page.evaluate(async () => {
        let minGap = Infinity;
        let minEdge = Infinity;
        for (let frame = 0; frame < 15; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const boxes = [...document.querySelectorAll<HTMLElement>('.world-float:not([hidden])')]
            .filter((node) => Number(node.style.opacity) > 0)
            .map((node) => node.getBoundingClientRect());
          for (let i = 0; i < boxes.length; i++) {
            const a = boxes[i];
            minEdge = Math.min(minEdge, a.left, window.innerWidth - a.right);
            for (const b of boxes.slice(i + 1)) {
              if (a.left < b.right && a.right > b.left)
                minGap = Math.min(minGap, Math.max(a.top - b.bottom, b.top - a.bottom));
            }
          }
        }
        window.__MARKET__.setPaused(true);
        document.querySelector<HTMLElement>('#pause-overlay')!.style.display = 'none';
        return { minGap, minEdge };
      });
      await page.screenshot({ path: `/private/tmp/kurdmart-feedback-${width}-${zoom}.png` });
      expect(result.minGap).toBeGreaterThanOrEqual(5);
      expect(result.minEdge).toBeGreaterThanOrEqual(0);
    });
  }
}
