import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const url = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/mini-market-game/';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });

// Documentation fixtures run only in fresh, disposable browser contexts. They
// deliberately grant upgrades and stock to demonstrate late-game features;
// they are not a record of earned progress and never access a player's save.
async function demonstrate(page, expanded = true) {
  await page.goto(`${url}?debug=true`);
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate((allAreas) => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.money = 100000;
    const levels = allAreas
      ? {
          expansion: 3,
          corn: 1,
          tomatoPlots: 4,
          eggPlots: 4,
          cornPlots: 4,
          coffeePlots: 4,
          carrotPlots: 7,
          pasteMachine: 4,
          coffeeMachine: 4,
          cashier: 3,
          helpers: 3,
          helperCapacity: 2,
          helperSpeed: 3,
          customers: 3,
          accountant: 2,
          inventory: 3,
          driveThrough: 1,
          driveRunner: 1,
          driveCashier: 1,
        }
      : {
          expansion: 2,
          corn: 1,
          tomatoPlots: 2,
          eggPlots: 2,
          cornPlots: 1,
          coffeePlots: 1,
          pasteMachine: 2,
          coffeeMachine: 1,
          cashier: 1,
          helpers: 2,
          helperCapacity: 1,
          helperSpeed: 2,
          customers: 2,
          accountant: 1,
          inventory: 1,
          driveThrough: 1,
        };
    for (const [id, count] of Object.entries(levels)) {
      for (let level = 0; level < count; level += 1) engine.purchaseUpgrade(id);
    }
    engine.state.money = allAreas ? 1860 : 1240;
    engine.state.xp = allAreas ? 1450 : 430;
    engine.state.player = allAreas ? { x: 1650, y: 620 } : { x: 1000, y: 710 };
    for (const id of engine.state.unlockedProducts) {
      engine.state.shelves[id] = 12;
      for (const plot of engine.state.farms[id].plots) plot.ready = 3;
    }
    engine.state.inventory.coffee = 4;
    engine.state.inventory.groundCoffee = 2;
    engine.state.machines.paste = {
      input: 12,
      output: 8,
      processing: allAreas ? 8 : 4,
      elapsed: 2800,
    };
    engine.state.machines.coffee = {
      input: 12,
      output: 8,
      processing: allAreas ? 8 : 2,
      elapsed: 3300,
    };
    engine.drainEvents();
    document.querySelector('#debug-panel').hidden = true;
    setPaused(false);
  }, expanded);
  await page.waitForTimeout(1000);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${url}?debug=true`);
  await page.waitForFunction(() => window.__MARKET__?.ready);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    const wait = (duration) => {
      for (let time = 0; time < duration; time += 50) engine.update(50, { x: 0, y: 0 });
    };
    const visit = (x, y, duration) => {
      engine.state.player = { x, y };
      wait(duration);
    };
    // A real sequence of harvests, shelf transfers and paid sales, with accelerated time.
    visit(265, 590, 8000);
    visit(265, 295, 2000);
    visit(475, 590, 1400);
    visit(475, 295, 1200);
    visit(950, 225, 45_000);
    visit(265, 590, 2500);
    visit(265, 295, 1700);
    visit(475, 590, 2500);
    visit(475, 295, 1700);
    visit(265, 590, 600);
    visit(560, 450, 1000);
    engine.drainEvents();
    document.querySelector('#debug-panel').hidden = true;
    setPaused(false);
  });
  // Allow the follow camera and product-transfer animations to settle.
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/screenshots/desktop.png' });
  await demonstrate(page, false);
  await page.evaluate(() => {
    const { engine, setPaused } = window.__MARKET__;
    setPaused(true);
    engine.state.upgrades.driveRunner = 0;
    engine.state.upgrades.driveCashier = 0;
    engine.state.driveThroughOrders = [
      {
        id: 41,
        vehicle: 'car',
        state: 'WAITING_FOR_ITEMS',
        x: 1245,
        y: 875,
        color: 0xe7775e,
        requested: {
          tomato: 2,
          egg: 1,
          corn: 0,
          coffee: 0,
          carrot: 0,
          tomatoPaste: 0,
          groundCoffee: 0,
        },
        delivered: {
          tomato: 0,
          egg: 0,
          corn: 0,
          coffee: 0,
          carrot: 0,
          tomatoPaste: 0,
          groundCoffee: 0,
        },
      },
    ];
    for (const id of Object.keys(engine.state.inventory)) engine.state.inventory[id] = 0;
    engine.state.inventory.tomato = 2;
    engine.state.inventory.egg = 1;
    engine.state.driveThroughHandoffProgress = 0;
    engine.state.driveThroughCheckoutProgress = 0;
    engine.state.player = { x: 1080, y: 875 };
    document.querySelector('#debug-panel').hidden = true;
    setPaused(false);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    document.querySelector('.floating-labels').style.display = 'none';
  });
  await page.screenshot({ path: 'docs/screenshots/drive-through.png' });
  await page.evaluate(() => {
    document.querySelector('.floating-labels').style.display = '';
  });
  await demonstrate(page);
  await page.screenshot({ path: 'docs/screenshots/expanded-store.png' });
  const management = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const managementPage = await management.newPage();
  await demonstrate(managementPage, false);
  await managementPage.getByRole('button', { name: 'Manage market' }).click();
  await managementPage.getByRole('tab', { name: 'Staff', exact: true }).click();
  await managementPage.screenshot({ path: 'docs/screenshots/management.png' });
  await management.close();
  const mobile = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(url);
  await mobilePage.locator('#loading').waitFor({ state: 'detached' });
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-landscape.png' });
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await demonstrate(mobilePage);
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-portrait.png' });
  await mobile.close();
} finally {
  await browser.close();
}
