import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES, machineDuration } from '../src/game/data/machines';
import { emptyItems, productById } from '../src/game/data/products';
import { xpForLevel } from '../src/game/data/upgrades';
import { GameEngine } from '../src/game/systems/GameEngine';
import { createInitialState, validateSave } from '../src/game/systems/SaveSystem';
import { CUSTOMER_PATIENCE_MS, patienceRemaining } from '../src/game/systems/PatienceSystem';
import { RUSH } from '../src/game/systems/RushHourSystem';
import type { CustomerData } from '../src/game/types';

function shopper(overrides: Partial<CustomerData> = {}): CustomerData {
  return {
    id: 1,
    ...GAME_CONFIG.queueStart,
    state: 'QUEUEING',
    targetProduct: 'tomato',
    targetQuantity: 1,
    basket: { ...emptyItems(), tomato: 1 },
    color: 0x739ebd,
    waitTime: 0,
    path: [],
    queueOrder: 1,
    ...overrides,
  };
}
function expanded(): GameEngine {
  const engine = new GameEngine();
  engine.state.money = 100000;
  engine.state.xp = xpForLevel(20);
  for (let area = 0; area < 3; area++) engine.purchaseUpgrade('expansion');
  engine.purchaseUpgrade('corn');
  return engine;
}

describe('optional rush hour', () => {
  it('starts once, counts only new paid orders, awards XP once and keeps cash manual', () => {
    const engine = new GameEngine();
    engine.state.totalServed = 100;
    expect(engine.rush.start()).toBe(true);
    expect(engine.rush.start()).toBe(false);
    engine.rush.update(1000);
    expect(engine.state.rush.completed).toBe(0);
    engine.state.totalServed += 8;
    engine.rush.update(50);
    expect(engine.state.rush.result).toBe('won');
    expect(engine.state.xp).toBe(100);
    expect(engine.state.money).toBe(0);
    expect(engine.rush.start()).toBe(false);
    const restored = new GameEngine(validateSave(engine.snapshot())!);
    restored.rush.update(500);
    expect(restored.state.xp).toBe(100);
    restored.rush.update(RUSH.cooldown);
    expect(restored.rush.start()).toBe(true);
    expect(restored.state.rush.completed).toBe(0);
  });
  it('times out without taking money or awarding a partial bonus', () => {
    const engine = new GameEngine();
    engine.state.money = 80;
    engine.rush.start();
    engine.state.totalServed = 4;
    engine.rush.update(RUSH.duration);
    expect(engine.state.rush).toMatchObject({ remainingMs: 0, result: 'missed', completed: 4 });
    expect(engine.state.xp).toBe(0);
    expect(engine.state.money).toBe(80);
  });
  it('preserves an active countdown across saves without offline progress', () => {
    const engine = new GameEngine();
    engine.rush.start();
    engine.rush.update(12345);
    expect(validateSave(engine.snapshot())!.rush).toEqual(engine.state.rush);
  });
  it('doubles arrivals without exceeding the purchased cart limit', () => {
    const normal = new GameEngine();
    const busy = new GameEngine();
    normal.state.upgrades.carts = busy.state.upgrades.carts = 7;
    busy.rush.start();
    for (let i = 0; i < 200; i++) {
      normal.customers.update(50);
      busy.customers.update(50);
    }
    expect(busy.state.customers.length).toBeGreaterThan(normal.state.customers.length);
    for (let i = 0; i < 1000; i++) busy.customers.update(50);
    expect(busy.state.customers.length).toBeLessThanOrEqual(10);
  });
});

describe('customer patience and safe returns', () => {
  it.each(['ENTERING', 'MOVING_TO_SHELF', 'PAYING', 'SECOND_PAYING', 'LEAVING'] as const)(
    'does not penalize %s',
    (state) => {
      const engine = new GameEngine();
      const customer = shopper({ state });
      engine.state.customers = [customer];
      engine.patience.update(CUSTOMER_PATIENCE_MS);
      expect(patienceRemaining(customer)).toBe(1);
      expect(engine.state.totalWalkouts).toBe(0);
    },
  );
  it.each(['WAITING_FOR_PRODUCT', 'QUEUEING', 'SECOND_QUEUEING'] as const)(
    'walks out of %s via the entrance and returns goods without sales or XP',
    (state) => {
      const engine = new GameEngine();
      const customer = shopper({ state });
      engine.state.customers = [customer];
      engine.patience.update(CUSTOMER_PATIENCE_MS / 2);
      expect(patienceRemaining(customer)).toBe(0.5);
      engine.patience.update(CUSTOMER_PATIENCE_MS / 2);
      expect(customer.state).toBe('LEAVING');
      expect(customer.path).toContainEqual(GAME_CONFIG.entrance);
      expect(customer.path).toContainEqual(GAME_CONFIG.cartStation);
      expect(customer.path.at(-1)).toEqual(GAME_CONFIG.customerExit);
      expect(engine.state.customers).toHaveLength(1); // Cart reserved until they actually leave.
      expect(customer.basket).toEqual(emptyItems());
      expect(engine.state.shelves.tomato).toBe(1);
      expect(engine.state.totalWalkouts).toBe(1);
      expect(engine.state.totalServed).toBe(0);
      expect(engine.state.xp).toBe(0);
      expect(engine.state.cashStacks.store.amount).toBe(0);
      engine.patience.update(1000);
      expect(engine.state.totalWalkouts).toBe(1);
    },
  );
  it('preserves overflow returns and patience across reloads, then restocks when space opens', () => {
    const engine = new GameEngine();
    engine.state.shelves.tomato = 12;
    engine.state.customers = [shopper({ patienceElapsed: CUSTOMER_PATIENCE_MS - 500 })];
    const restored = new GameEngine(validateSave(engine.snapshot())!);
    expect(restored.state.customers[0].patienceElapsed).toBe(CUSTOMER_PATIENCE_MS - 500);
    restored.patience.update(500);
    expect(restored.state.shelves.tomato).toBe(12);
    expect(restored.state.returnedStock.tomato).toBe(1);
    const again = new GameEngine(validateSave(restored.snapshot())!);
    again.inventory.takeFromShelf('tomato', 1);
    again.patience.update(50);
    expect(again.state.shelves.tomato).toBe(12);
    expect(again.state.returnedStock.tomato).toBe(0);
  });
});

describe('grilled corn and equipment upgrades', () => {
  it.each([1, 2, 3, 4])(
    'makes the level %i batch without creating or losing ingredients',
    (level) => {
      const engine = expanded();
      for (let tier = 0; tier < level; tier++)
        expect(engine.purchaseUpgrade('grillMachine')).toBe(true);
      expect(engine.state.unlockedProducts).toContain('grilledCorn');
      expect(engine.state.shelfCapacities.grilledCorn).toBe(12);
      const basket = { ...emptyItems(), corn: 8 };
      expect(engine.machines.supply('grill', basket, 8)).toBe(8);
      engine.machines.update(6000);
      expect(engine.state.machines.grill.output).toBe(level * 2);
      expect(engine.machines.collect('grill', basket, 8, 8)).toBe(level * 2);
      expect(basket.grilledCorn + engine.state.machines.grill.input).toBe(8);
      expect(engine.inventory.stockFrom('grilledCorn', basket, 8)).toBe(level * 2);
    },
  );
  it('requires the garden and raw corn, then upgrades speed independently of batch capacity', () => {
    const engine = new GameEngine();
    engine.state.money = 100000;
    expect(engine.purchaseUpgrade('grillMachine')).toBe(false);
    for (let i = 0; i < 3; i++) engine.purchaseUpgrade('expansion');
    expect(engine.purchaseUpgrade('grillMachine')).toBe(false);
    engine.purchaseUpgrade('corn');
    expect(engine.purchaseUpgrade('grillMachine')).toBe(true);
    const grill = MACHINES.find(({ id }) => id === 'grill')!;
    engine.machines.supply('grill', { ...emptyItems(), corn: 2 }, 2);
    engine.machines.update(5200);
    expect(engine.state.machines.grill.output).toBe(0);
    expect(engine.purchaseUpgrade('machineSpeed')).toBe(true);
    expect(machineDuration(engine.state, grill)).toBe(5000);
    engine.machines.update(50); // Mid-batch speed purchase cannot create negative time.
    expect(engine.state.machines.grill.output).toBe(2);
    expect(engine.state.upgrades.grillMachine).toBe(1);
    expect(engine.purchaseUpgrade('machineSpeed')).toBe(false); // Next tier is player level 5.
  });
  it('sells grilled corn through checkout and leaves the payment in its cash pile', () => {
    const engine = expanded();
    engine.purchaseUpgrade('grillMachine');
    engine.state.player = { ...GAME_CONFIG.cashierSpot };
    engine.state.customers = [
      shopper({ targetProduct: 'grilledCorn', basket: { ...emptyItems(), grilledCorn: 2 } }),
    ];
    const wallet = engine.state.money;
    for (let i = 0; i < 80; i++) engine.checkout.update(50);
    expect(engine.state.cashStacks.store.amount).toBe(2 * productById('grilledCorn')!.sellingPrice);
    expect(engine.state.money).toBe(wallet);
    expect(engine.state.totalServed).toBe(1);
  });
  it('provides backward-compatible, bounded audio and challenge defaults', () => {
    const initial = createInitialState();
    const state = validateSave({
      version: 2,
      soundEnabled: false,
      effectsVolume: -20,
      musicVolume: 500,
    })!;
    expect(state.effectsVolume).toBe(0);
    expect(state.musicVolume).toBe(1);
    expect(state.soundEnabled).toBe(false);
    expect(state.rush).toEqual(initial.rush);
    expect(state.returnedStock).toEqual(emptyItems());
    expect(state.machines.grill).toEqual({ input: 0, output: 0, processing: 0, elapsed: 0 });
  });
});
