// Local visual benchmark; each scenario uses an isolated browser save.
import { chromium } from '@playwright/test';
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4176/mini-market-game/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const busy of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    if (process.env.MARKET_ART === 'legacy')
      await page.route('**/models/market.glb', (route) => route.abort());
    // Measure the renderer without relying on an external font service.
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.goto(base + '?debug=true', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__MARKET__?.ready);
    const result = await page.evaluate(async (busy) => {
      const { engine, world, setPaused } = window.__MARKET__;
      const s = engine.state;
      s.safePause = true;
      setPaused(true);
      document.querySelector('#pause-overlay').hidden = true;
      document.querySelector('#debug-panel').style.display = 'none';
      if (busy) {
        s.money = 1e8;
        s.totalServed = 500;
        s.xp = 100000;
        for (const id of [
          'expansion',
          'corn',
          'pasteMachine',
          'coffeeMachine',
          'dairyMachine',
          'grillMachine',
          'cashier',
          'helpers',
          'driveThrough',
          'secondCashier',
          'shelf',
        ])
          for (let i = 0; i < 4; i++) engine.purchaseUpgrade(id);
      }
      for (const product of s.unlockedProducts) s.shelves[product] = s.shelfCapacities[product];
      s.customers = Array.from({ length: busy ? 9 : 2 }, (_, i) => ({
        id: i + 1,
        state: 'QUEUEING',
        x: 740 + (i % 5) * 36,
        y: 730 + Math.floor(i / 5) * 38,
        color: 0xe79b59,
        path: [],
        targetProduct: 'tomato',
        targetQuantity: 1,
        basket: { ...s.inventory, tomato: 1 },
        waitTime: 0,
        queueOrder: i + 1,
      }));
      s.player.x = busy ? 800 : 590;
      s.player.y = busy ? 685 : 805;
      await new Promise((r) => setTimeout(r, 800));
      const spans = [];
      let last = performance.now();
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        if (i >= 20) spans.push(now - last);
        last = now;
      }
      spans.sort((a, b) => a - b);
      return {
        calls: world.renderer.info.render.calls,
        triangles: world.renderer.info.render.triangles,
        medianFrameMs: spans[50],
        p95FrameMs: spans[95],
      };
    }, busy);
    console.log(busy ? 'Busy' : 'Starter', JSON.stringify(result));
    if (process.env.SCREENSHOT_PREFIX)
      await page.screenshot({
        path: process.env.SCREENSHOT_PREFIX + '-' + (busy ? 'busy' : 'starter') + '.png',
      });
    await page.close();
  }
} finally {
  await browser.close();
}
