import { expect, test, type Page } from '@playwright/test';

async function openGame(page: Page): Promise<void> {
  await page.goto('./?debug=true');
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => window.__MARKET__.setPaused(true));
}

interface LabelSnapshot {
  fontRatio: number;
  id: string;
  kind: string;
  mount: string;
  text: string;
  visible: boolean;
}

interface LabelBounds extends LabelSnapshot {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  points: Array<{ x: number; y: number }>;
}

async function labels(page: Page): Promise<LabelSnapshot[]> {
  return page.evaluate(() => {
    window.__MARKET__.world.update(
      window.__MARKET__.engine.state,
      window.__MARKET__.engine.state.elapsed,
      0,
    );
    const result: LabelSnapshot[] = [];
    window.__MARKET__.world.scene.traverse((object) => {
      const data = object.userData.worldLabel as Omit<LabelSnapshot, 'visible'> | undefined;
      if (!data) return;
      let visible = object.visible;
      for (let parent = object.parent; parent; parent = parent.parent) visible &&= parent.visible;
      result.push({ ...data, visible });
    });
    return result;
  });
}

async function focusCamera(page: Page, position: { x: number; y: number }): Promise<void> {
  await page.evaluate((next) => {
    const { engine, world } = window.__MARKET__;
    engine.state.player = next;
    world.resize();
    for (let frame = 0; frame < 36; frame += 1)
      world.update(engine.state, engine.state.elapsed, 100);
  }, position);
}

async function labelBounds(page: Page): Promise<LabelBounds[]> {
  return page.evaluate(() => {
    const { world } = window.__MARKET__;
    const canvas = world.renderer.domElement.getBoundingClientRect();
    world.scene.updateMatrixWorld(true);
    world.camera.updateMatrixWorld(true);
    const result: LabelBounds[] = [];
    world.scene.traverse((object) => {
      const data = object.userData.worldLabel as
        | Omit<LabelSnapshot, 'visible'>
        | undefined;
      if (!data || data.mount !== 'surface') return;
      let visible = object.visible;
      for (let parent = object.parent; parent; parent = parent.parent) visible &&= parent.visible;
      const corners: Array<[number, number]> = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
      const projected = corners.map(([x, y]) => {
        const point = object.position.clone().set(x, y, 0);
        object.localToWorld(point);
        point.project(world.camera);
        return {
          x: ((point.x + 1) / 2) * canvas.width,
          y: ((1 - point.y) / 2) * canvas.height,
        };
      });
      const xs = projected.map(({ x }) => x);
      const ys = projected.map(({ y }) => y);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      const edgeLength = (first: number, second: number) =>
        Math.hypot(
          projected[first].x - projected[second].x,
          projected[first].y - projected[second].y,
        );
      result.push({
        ...data,
        visible,
        left,
        right,
        top,
        bottom,
        width: Math.min(edgeLength(0, 1), edgeLength(2, 3)),
        height: Math.min(edgeLength(0, 3), edgeLength(1, 2)),
        points: projected,
      });
    });
    return result;
  });
}

function expectContained(
  snapshot: LabelBounds[],
  id: string,
  viewport: { width: number; height: number },
): LabelBounds {
  const entry = snapshot.find((label) => label.id === id);
  expect(entry, id).toBeDefined();
  expect(entry!.visible, id).toBe(true);
  expect(entry!.left, `${id} left edge`).toBeGreaterThanOrEqual(-1);
  expect(entry!.right, `${id} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(entry!.top, `${id} top edge`).toBeGreaterThanOrEqual(-1);
  expect(entry!.bottom, `${id} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
  expect(entry!.height * entry!.fontRatio, `${id} effective text height`).toBeGreaterThanOrEqual(
    6.5,
  );
  return entry!;
}

function polygonsOverlap(first: LabelBounds, second: LabelBounds): boolean {
  for (const polygon of [first.points, second.points]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const axis = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
      const projection = (points: Array<{ x: number; y: number }>) =>
        points.map((point) => point.x * axis.x + point.y * axis.y);
      const firstProjection = projection(first.points);
      const secondProjection = projection(second.points);
      if (
        Math.max(...firstProjection) <= Math.min(...secondProjection) + 0.5 ||
        Math.max(...secondProjection) <= Math.min(...firstProjection) + 0.5
      )
        return false;
    }
  }
  return true;
}

function expectVisibleLabelsLegible(
  snapshot: LabelBounds[],
  viewport: { width: number; height: number },
): void {
  const contained = snapshot.filter(
    ({ bottom, kind, left, right, top, visible }) =>
      visible &&
      kind !== 'area' &&
      kind !== 'brand' &&
      left >= 0 &&
      right <= viewport.width &&
      top >= 0 &&
      bottom <= viewport.height,
  );
  for (const entry of contained)
    expect(
      entry.height * entry.fontRatio,
      `${entry.id} effective text height`,
    ).toBeGreaterThanOrEqual(6.5);
}

test('world labels use unique mounted signs and intentional status badges', async ({ page }) => {
  await openGame(page);
  const snapshot = await labels(page);
  expect(new Set(snapshot.map(({ id }) => id)).size).toBe(snapshot.length);
  expect(snapshot.every(({ mount }) => mount === 'surface' || mount === 'billboard')).toBe(true);
  expect(snapshot.filter(({ mount }) => mount === 'billboard').every(({ id }) => /^plot:.+:\d+:ready$/.test(id))).toBe(true);

  const byId = new Map(snapshot.map((entry) => [entry.id, entry]));
  const mounted = [
    'store:brand',
    'store:tagline',
    'store:local',
    'store:open',
    'office:team:title',
    'office:customers:title',
    'office:accountant:title',
    'checkout:title',
    'trash:title',
    ...['tomato', 'egg', 'corn', 'coffee', 'carrot', 'tomatoPaste', 'groundCoffee'].map(
      (id) => `shelf:${id}:title`,
    ),
    ...['tomato', 'egg', 'corn', 'coffee', 'carrot', 'tomatoPaste', 'groundCoffee'].map(
      (id) => `shelf:${id}:count`,
    ),
    ...['tomato', 'egg', 'corn', 'coffee', 'carrot'].map((id) => `farm:${id}:title`),
    ...['paste', 'coffee'].flatMap((id) => [
      `machine:${id}:title`,
      `machine:${id}:level`,
      `machine:${id}:status`,
      `machine:${id}:locked`,
    ]),
    ...[1, 2, 3].map((area) => `area:${area}:title`),
    ...[
      'inventory',
      'customers',
      'corn',
      'cashier',
      'expansion',
      'tomatoPlots',
      'eggPlots',
      'cornPlots',
      'carrotPlots',
      'pasteMachine',
      'coffeeMachine',
    ].map((id) => `upgrade:${id}:action`),
    ...['tomato', 'egg', 'corn', 'coffee', 'carrot'].flatMap((id) =>
      Array.from({ length: id === 'carrot' ? 8 : 5 }, (_, index) =>
        `plot:${id}:${index}:action`,
      ),
    ),
  ];
  for (const id of mounted) expect(byId.get(id), id).toMatchObject({ mount: 'surface' });
  expect(byId.get('checkout:title')?.text).toBe('CHECKOUT');
  expect(byId.get('plot:tomato:0:ready')).toMatchObject({ text: '3', visible: true });
  expect(byId.get('plot:tomato:1:ready')?.visible).toBe(false);
  expect(byId.get('plot:tomato:1:action')?.visible).toBe(false);
  expect(byId.get('plot:tomato:2:action')?.visible).toBe(false);

  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.economy.earn(100);
    engine.purchaseUpgrade('tomatoPlots');
  });
  const afterPlotPurchase = await labels(page);
  const afterPlotById = new Map(afterPlotPurchase.map((entry) => [entry.id, entry]));
  expect(afterPlotById.get('plot:tomato:1:ready')?.visible).toBe(false);
  expect(afterPlotPurchase.every(({ text }) => !text.includes('…'))).toBe(true);
});

test('labels stay concise through upgrades and compact layouts hide decorative headers', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    engine.economy.earn(100000);
    for (const id of [
      'expansion',
      'corn',
      'tomatoPlots',
      'eggPlots',
      'cornPlots',
      'pasteMachine',
    ] as const)
      while (engine.purchaseUpgrade(id)) {
        // Exercise real caps and keep the fixture isolated in this browser context.
      }
    world.update(engine.state, engine.state.elapsed, 0);
  });
  let snapshot = await labels(page);
  let byId = new Map(snapshot.map((entry) => [entry.id, entry]));
  expect(byId.get('upgrade:tomatoPlots:action')).toMatchObject({
    text: 'TOMATO MAX',
    visible: true,
  });
  expect(byId.get('upgrade:expansion:action')).toMatchObject({
    text: 'EXPANSION MAX',
    visible: true,
  });
  expect(byId.get('machine:paste:level')?.text).toBe('LV4 · 8/BATCH');
  expect(byId.get('machine:paste:status')?.text).toBe('ADD TOMATOES');
  expect(byId.get('plot:coffee:1:action')).toMatchObject({ text: '+$110', visible: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__MARKET__.world.resize());
  snapshot = await labels(page);
  byId = new Map(snapshot.map((entry) => [entry.id, entry]));
  expect(byId.get('farm:tomato:title')?.visible).toBe(false);
  expect(byId.get('area:1:title')?.visible).toBe(false);
  expect(byId.get('shelf:tomato:title')?.visible).toBe(true);
  expect(byId.get('machine:paste:status')?.visible).toBe(true);
});

test('critical signs stay legible and contained in the compact landscape view', async ({ page }) => {
  const viewport = { width: 844, height: 390 };
  await page.setViewportSize(viewport);
  await openGame(page);

  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.state.customers = [
      {
        id: 2,
        x: 1000,
        y: 385,
        state: 'ENTERING',
        targetProduct: 'tomato',
        targetQuantity: 2,
        basket: { ...engine.state.inventory },
        color: 0x739ebd,
        waitTime: 0,
        path: [],
      },
    ];
  });
  await focusCamera(page, { x: 1000, y: 385 });
  let bounds = await labelBounds(page);
  expect(expectContained(bounds, 'customer:0:need-quantity', viewport).text).toBe('×2');
  await page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    engine.state.customers = [];
    world.update(engine.state, engine.state.elapsed, 0);
  });

  await focusCamera(page, { x: 1138, y: 337 });
  bounds = await labelBounds(page);
  expect(expectContained(bounds, 'upgrade:expansion:action', viewport).text).toBe(
    'PRODUCTION $250',
  );
  expectVisibleLabelsLegible(bounds, viewport);

  await page.evaluate(() => {
    const { engine, world } = window.__MARKET__;
    Object.assign(engine.state.upgrades, {
      expansion: 3,
      corn: 1,
      cornPlots: 3,
      customers: 9,
      cashier: 4,
      coffeeMachine: 3,
    });
    world.update(engine.state, engine.state.elapsed, 0);
  });
  for (const tour of [
    { position: { x: 1138, y: 444 }, id: 'upgrade:customers:action' },
    { position: { x: 1138, y: 658 }, id: 'upgrade:cashier:action' },
    { position: { x: 685, y: 855 }, id: 'upgrade:cornPlots:action' },
    { position: { x: 1740, y: 745 }, id: 'upgrade:coffeeMachine:action' },
  ]) {
    await focusCamera(page, tour.position);
    bounds = await labelBounds(page);
    expectContained(bounds, tour.id, viewport);
  }

  await focusCamera(page, { x: 990, y: 780 });
  bounds = await labelBounds(page);
  const office = [
    'office:team:title',
    'office:customers:title',
    'office:accountant:title',
    'trash:title',
  ].map((id) => expectContained(bounds, id, viewport));
  expectVisibleLabelsLegible(bounds, viewport);
  for (let first = 0; first < office.length; first += 1)
    for (let second = first + 1; second < office.length; second += 1)
      expect(polygonsOverlap(office[first], office[second])).toBe(false);

  await page.evaluate(() => {
    const { engine } = window.__MARKET__;
    engine.economy.earn(100000);
    for (const id of ['expansion', 'pasteMachine', 'coffeeMachine'] as const)
      while (engine.purchaseUpgrade(id)) {
        // Exercise the real unlock order before checking every expanded area.
      }
  });

  for (const tour of [
    {
      position: { x: 1320, y: 580 },
      ids: ['machine:paste:title', 'machine:paste:level', 'machine:paste:status'],
    },
    {
      position: { x: 1640, y: 580 },
      ids: ['machine:coffee:title', 'machine:coffee:level', 'machine:coffee:status'],
    },
    {
      position: { x: 2010, y: 300 },
      ids: ['shelf:carrot:title', 'shelf:carrot:count'],
    },
    {
      position: { x: 2010, y: 820 },
      ids: ['upgrade:carrotPlots:action'],
    },
  ]) {
    await focusCamera(page, tour.position);
    bounds = await labelBounds(page);
    const current = tour.ids.map((id) => expectContained(bounds, id, viewport));
    expectVisibleLabelsLegible(bounds, viewport);
    for (let first = 0; first < current.length; first += 1)
      for (let second = first + 1; second < current.length; second += 1)
        expect(polygonsOverlap(current[first], current[second])).toBe(false);
  }
});
