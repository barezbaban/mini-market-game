import { test, expect } from '@playwright/test';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { farmStandSpot } from '../src/game/data/standSpots';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
});

test('a real pickup loads the Blender reach once and the actor settles afterward', async ({
  page,
}) => {
  const loads: number[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('/animations/reach.glb')) loads.push(r.status());
  });
  await page.goto('./?debug=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(
    (pos) => {
      window.__MARKET__.engine.state.player = { ...pos };
    },
    farmStandSpot('tomato', 0),
  );
  await page.waitForFunction(() => {
    const m = window.__MARKET__;
    return (
      m.engine.state.inventory.tomato > 0 &&
      m.world.scene.getObjectByName('player-character')!.children[0].rotation.x > 0.015
    );
  });
  await expect.poll(() => loads).toEqual([200]);
  await page.evaluate((pos) => {
    window.__MARKET__.engine.state.player = { ...pos };
  }, GAME_CONFIG.playerStart);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__MARKET__.world.scene.getObjectByName('player-character')!.children[0].rotation.x,
      ),
    )
    .toBeCloseTo(0, 6);
});

test('regular enters with a brief greeting and apron; neither leaks to the next shopper', async ({
  page,
}) => {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  const result = await page.evaluate((door) => {
    const { engine, world, setPaused } = window.__MARKET__;
    engine.state.safePause = true;
    setPaused(true);
    const c = {
      id: 96,
      ...door,
      state: 'ENTERING' as const,
      regularId: 'ava',
      basket: { ...engine.state.inventory },
      color: 0xe58b71,
      targetProduct: 'tomato' as const,
      targetQuantity: 1,
      waitTime: 0,
      path: [],
    };
    engine.state.customers = [c];
    world.update(engine.state, 100, 16);
    const intro = world.scene.getObjectByProperty('name', 'regular-apron')!;
    let greeting: typeof intro | undefined;
    world.scene.traverse((o) => {
      if (o.userData.worldLabel?.id === 'customer:0:regular-intro') greeting = o;
    });
    const first = {
      apron: intro.visible,
      greeting: greeting?.visible,
      text: greeting?.userData.worldLabel.text,
    };
    world.update(engine.state, 3000, 16);
    const expired = greeting?.visible === false;
    engine.state.customers = [{ ...c, id: 97, regularId: undefined }];
    world.update(engine.state, 3100, 16);
    return { first, expired, ordinaryApron: intro.visible };
  }, GAME_CONFIG.entrance);
  expect(result).toEqual({
    first: { apron: true, greeting: true, text: 'Ava · Neighborhood kitchen' },
    expired: true,
    ordinaryApron: false,
  });
});

test('one pinned goal appears on the phone shop floor and survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const s = window.__MARKET__.engine.state;
    s.tutorialStep = 6;
    s.career.sold.tomatoPaste = 8;
  });
  await page.locator('#manage-button').click();
  await page.locator('#management-tab-goals').click();
  await page.locator('.goal-picker summary').click();
  await page.locator('#pin-first-production').click();
  await expect(page.locator('#pin-first-production')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#management-close').click();
  await expect(page.locator('#objective-text')).toContainText('8/12');
  await page.reload();
  await expect(page.locator('#objective-text')).toContainText('8/12');
});
