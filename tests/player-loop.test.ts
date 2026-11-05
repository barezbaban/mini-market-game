import { expect, it } from 'vitest';
import { GameEngine } from '../src/game/systems/GameEngine';
import { guidanceTarget } from '../src/game/systems/BusinessInsights';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { validateSave } from '../src/game/systems/SaveSystem';
import { pinnedGoalView } from '../src/game/data/career';
import { PRODUCTS } from '../src/game/data/products';
import { shelfStandSpot } from '../src/game/data/standSpots';

it('gives the player a first stocking job after hiring, then retires the hint', () => {
  const e = new GameEngine(),
    s = e.state;
  s.tutorialStep = 6;
  s.money = 500;
  expect(e.purchaseUpgrade('cashier')).toBe(true);
  expect(s.career.cashierStockLesson).toBe(true);
  expect(validateSave(e.snapshot())?.career.cashierStockLesson).toBe(true);
  s.inventory.tomato = 1;
  expect(guidanceTarget(s)?.label).toBe('Stock shelf');
  s.player = shelfStandSpot(PRODUCTS[0]);
  e.update(250);
  expect(s.career.cashierStockLesson).toBe(false);
  expect(e.drainEvents().find((v) => v.handoff?.action === 'place')?.handoff?.actor).toBe('player');
});

it('uses browsing time for stocking and calls the player only when checkout is ready', () => {
  const s = new GameEngine().state;
  s.tutorialStep = 3;
  s.inventory.tomato = 1;
  expect(guidanceTarget(s)?.label).toBe('Stock shelf');
  s.inventory.tomato = 0;
  expect(guidanceTarget(s)?.label).toBe('Harvest');
  s.customers.push({
    id: 1,
    ...GAME_CONFIG.queueStart,
    state: 'QUEUEING',
    basket: { ...s.inventory, tomato: 1 },
    targetProduct: 'tomato',
    targetQuantity: 1,
    color: 0,
    waitTime: 0,
    path: [],
  });
  expect(guidanceTarget(s)?.label).toBe('Serve here');
  s.tutorialStep = 5;
  expect(guidanceTarget(s)?.label).toBe('Collect cash');
});

it('counts only completed unattended sales and still stacks their cash', () => {
  const e = new GameEngine(),
    s = e.state;
  s.cashier = true;
  s.upgrades.cashier = 1;
  const serve = () => {
    s.customers = [
      {
        id: s.totalServed + 1,
        ...GAME_CONFIG.queueStart,
        state: 'QUEUEING',
        basket: { ...s.inventory, tomato: 1 },
        targetProduct: 'tomato',
        targetQuantity: 1,
        color: 0,
        waitTime: 0,
        queueOrder: 1,
        path: [],
      },
    ];
    e.checkout.update(4500);
  };
  s.player = { ...GAME_CONFIG.cashierSpot };
  serve();
  expect(s.career.cashierAwaySales).toBe(0);
  s.player = { ...GAME_CONFIG.playerStart };
  serve();
  serve();
  expect(s.career.cashierAwaySales).toBe(2);
  expect(s.money).toBe(0);
  expect(s.cashStacks.store.amount).toBe(15);
  expect(
    e.drainEvents().filter((x) => x.type === 'notice' && x.text.includes('while you were away')),
  ).toHaveLength(1);
  expect(validateSave(e.snapshot())?.career.cashierAwaySales).toBe(2);
});
it('tracks one goal, persists progress and clears a claimed or abandoned pin', () => {
  const e = new GameEngine(),
    s = e.state;
  expect(e.career.togglePin('bogus')).toBe(false);
  e.career.togglePin('first-production');
  s.career.sold.tomatoPaste = 8;
  expect(pinnedGoalView(s)?.detail).toMatch(/^8\/12/);
  expect(validateSave(e.snapshot())?.career.pinnedGoal).toBe('first-production');
  s.totalServed = 10;
  e.career.acceptContract('produce');
  e.career.togglePin('contract');
  expect(pinnedGoalView(s)?.title).toBe('Pinned contract');
  e.career.cancelContract();
  expect(pinnedGoalView(s)).toBeNull();
  e.career.togglePin('first-sale');
  e.career.claimMilestone('first-sale');
  expect(s.career.pinnedGoal).toBeNull();
});
