import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { PRODUCTS, emptyItems } from '../src/game/data/products';
import {
  driveThroughComplete,
  driveThroughTotal,
  driveThroughValue,
} from '../src/game/systems/DriveThroughSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { validateSave } from '../src/game/systems/SaveSystem';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import type { DriveThroughOrder } from '../src/game/types';

function advance(engine: GameEngine, duration: number): void {
  for (let elapsed = 0; elapsed < duration; elapsed += 50)
    engine.update(Math.min(50, duration - elapsed));
}

function waitForOrder(engine: GameEngine): void {
  for (let elapsed = 0; elapsed < 12_000 && !engine.state.driveThroughOrders.length; elapsed += 50)
    engine.update(50);
  for (
    let elapsed = 0;
    elapsed < 8_000 && engine.state.driveThroughOrders[0]?.state === 'ARRIVING';
    elapsed += 50
  )
    engine.update(50);
}

describe('drive-through service', () => {
  it('keeps the one-way road beyond both vehicle transition points', () => {
    expect(GAME_CONFIG.driveThroughRoadStartX).toBeLessThan(GAME_CONFIG.driveThroughExitX);
    expect(GAME_CONFIG.driveThroughExitX).toBeLessThan(GAME_CONFIG.driveThroughVehicleSpot.x);
    expect(GAME_CONFIG.driveThroughVehicleSpot.x).toBeLessThan(GAME_CONFIG.driveThroughSpawnX);
    expect(GAME_CONFIG.driveThroughSpawnX).toBeLessThan(GAME_CONFIG.driveThroughRoadEndX);
    expect(GAME_CONFIG.driveThroughRoadStartX).toBeLessThan(GAME_CONFIG.bounds.left);
    expect(GAME_CONFIG.driveThroughRoadEndX).toBeGreaterThan(GAME_CONFIG.width);
  });

  it('rotates requests through every unlocked product with no more than three types per order', () => {
    const engine = new GameEngine();
    Object.assign(engine.state.upgrades, {
      expansion: 4,
      corn: 1,
      pasteMachine: 1,
      coffeeMachine: 1,
      dairyMachine: 1,
      driveThrough: 1,
    });
    applyUpgradeEffects(engine.state);
    const seen = new Set<string>();
    for (let index = 0; index < PRODUCTS.length * 2; index += 1) {
      engine.state.driveThroughSpawnElapsed = GAME_CONFIG.driveThroughSpawnInterval;
      engine.driveThrough.update(50);
      expect(engine.state.driveThroughOrders).toHaveLength(1);
      const order = engine.state.driveThroughOrders[0];
      const requested = PRODUCTS.filter(({ id }) => order.requested[id] > 0);
      expect(driveThroughTotal(order.requested)).toBeGreaterThanOrEqual(2);
      expect(driveThroughTotal(order.requested)).toBeLessThanOrEqual(4);
      expect(requested.length).toBeLessThanOrEqual(3);
      for (const product of requested) seen.add(product.id);
      engine.state.driveThroughOrders.length = 0;
    }
    expect([...seen].sort()).toEqual(engine.state.unlockedProducts.slice().sort());

    const locked = new GameEngine();
    locked.state.upgrades.driveThrough = 1;
    locked.state.driveThroughSpawnElapsed = GAME_CONFIG.driveThroughSpawnInterval;
    locked.driveThrough.update(50);
    expect(
      PRODUCTS.filter(({ id }) => locked.state.driveThroughOrders[0].requested[id] > 0)
        .map(({ id }) => id)
        .every((id) => locked.state.unlockedProducts.includes(id)),
    ).toBe(true);
  });

  it('continues the product rotation after a save without active vehicles', () => {
    const engine = new GameEngine();
    Object.assign(engine.state.upgrades, { expansion: 4, dairyMachine: 1, driveThrough: 1 });
    applyUpgradeEffects(engine.state);
    engine.state.driveThroughServed = 5;
    const resumed = new GameEngine(validateSave(engine.snapshot())!);
    resumed.state.driveThroughSpawnElapsed = GAME_CONFIG.driveThroughSpawnInterval;
    resumed.driveThrough.update(50);
    const order = resumed.state.driveThroughOrders[0];
    expect(order.id).toBe(6);
    expect(
      PRODUCTS.filter(({ id }) => order.requested[id] > 0).some(({ id }) => id === 'cheese'),
    ).toBe(true);
  });

  it('lets a late-unlocked dairy order be loaded item by item and paid exactly once', () => {
    const engine = new GameEngine();
    Object.assign(engine.state.upgrades, { expansion: 4, dairyMachine: 1, driveThrough: 1 });
    applyUpgradeEffects(engine.state);
    let order: DriveThroughOrder | undefined = engine.state.driveThroughOrders[0];
    for (let index = 0; index < PRODUCTS.length && !order; index += 1) {
      engine.state.driveThroughSpawnElapsed = GAME_CONFIG.driveThroughSpawnInterval;
      engine.driveThrough.update(50);
      order = engine.state.driveThroughOrders[0];
      if (order.requested.cheese === 0) {
        engine.state.driveThroughOrders.length = 0;
        order = undefined;
      }
    }
    expect(order?.requested.cheese).toBeGreaterThan(0);
    while (order?.state === 'ARRIVING') engine.driveThrough.update(50);
    engine.state.inventory = { ...order!.requested };
    engine.state.player = { ...GAME_CONFIG.driveThroughPlayerSpot };
    const before = engine.state.money;
    const units = driveThroughTotal(order!.requested);
    for (let index = 1; index <= units; index += 1) {
      advance(engine, GAME_CONFIG.driveThroughHandoffTime);
      expect(driveThroughTotal(order!.delivered)).toBe(index);
    }
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime);
    expect(order!.state).toBe('LEAVING');
    expect(engine.state.money).toBe(before);
    expect(engine.state.cashStacks.drive.amount).toBe(driveThroughValue(order!));
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime);
    expect(engine.state.money).toBe(before);
    expect(engine.state.cashStacks.drive.amount).toBe(driveThroughValue(order!));
  });

  it('departing vehicles continue forward without reversing through the queue', () => {
    const engine = new GameEngine();
    engine.economy.earn(10_000);
    engine.purchaseUpgrade('driveThrough');
    waitForOrder(engine);
    const departing = engine.state.driveThroughOrders[0];
    departing.delivered = { ...departing.requested };
    departing.state = 'LEAVING';
    const waiting = {
      ...departing,
      id: departing.id + 1,
      state: 'ARRIVING' as const,
      x: departing.x + 105,
      delivered: emptyItems(),
    };
    engine.state.driveThroughOrders.push(waiting);
    const startingX = departing.x;
    advance(engine, 500);
    expect(departing.x).toBeLessThan(startingX);
    expect(waiting.x).toBe(startingX + 105);
    const remainingTravel = Math.ceil(
      ((departing.x - GAME_CONFIG.driveThroughExitX) / GAME_CONFIG.driveThroughVehicleSpeed) * 1000,
    );
    advance(engine, remainingTravel + 50);
    expect(engine.state.driveThroughOrders.some(({ id }) => id === departing.id)).toBe(false);
    expect(waiting.x).toBe(GAME_CONFIG.driveThroughVehicleSpot.x);
    expect(waiting.state).toBe('WAITING_FOR_ITEMS');
  });
  it('starts locked and exposes three separate purchases', () => {
    const engine = new GameEngine();
    advance(engine, GAME_CONFIG.driveThroughSpawnInterval * 2);
    expect(engine.state.driveThroughOrders).toEqual([]);
    engine.economy.earn(10_000);
    expect(engine.purchaseUpgrade('driveRunner')).toBe(false);
    expect(engine.purchaseUpgrade('driveCashier')).toBe(false);
    expect(engine.purchaseUpgrade('driveThrough')).toBe(true);
    expect(engine.state.upgrades.driveRunner).toBe(0);
    expect(engine.state.upgrades.driveCashier).toBe(0);
    advance(engine, 2499);
    expect(engine.state.driveThroughOrders).toEqual([]);
    advance(engine, 1);
    expect(engine.state.driveThroughOrders).toHaveLength(1);
  });

  it('lets the player load requested items one at a time and collect payment', () => {
    const engine = new GameEngine();
    engine.economy.earn(10_000);
    expect(engine.purchaseUpgrade('driveThrough')).toBe(true);
    waitForOrder(engine);
    const order = engine.state.driveThroughOrders[0];
    expect(order.vehicle === 'car' || order.vehicle === 'bike').toBe(true);
    expect(order.state).toBe('WAITING_FOR_ITEMS');
    expect(driveThroughTotal(order.requested)).toBeGreaterThanOrEqual(2);
    expect(driveThroughTotal(order.requested)).toBeLessThanOrEqual(4);
    const openingMoney = engine.state.money;
    engine.state.inventory = { ...order.requested };
    engine.state.player = { ...GAME_CONFIG.driveThroughPlayerSpot };
    const units = driveThroughTotal(order.requested);
    advance(engine, GAME_CONFIG.driveThroughHandoffTime);
    expect(driveThroughTotal(order.delivered)).toBe(1);
    advance(engine, GAME_CONFIG.driveThroughHandoffTime * (units - 1));
    expect(driveThroughComplete(order)).toBe(true);
    expect(order.state).toBe('READY_TO_PAY');
    expect(engine.state.money).toBe(openingMoney);
    expect(Object.values(engine.state.inventory).every((count) => count === 0)).toBe(true);
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime);
    expect(order.state).toBe('LEAVING');
    expect(engine.state.money).toBe(openingMoney);
    expect(engine.state.cashStacks.drive.amount).toBe(driveThroughValue(order));
    expect(engine.state.driveThroughServed).toBe(1);
    expect(engine.state.totalServed).toBe(1);
    expect(engine.state.xp).toBe(5 + units * 2);
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime * 2);
    expect(engine.state.xp).toBe(5 + units * 2);
  });

  it('keeps runner loading and cashier payment as independent jobs', () => {
    const engine = new GameEngine();
    engine.economy.earn(10_000);
    engine.purchaseUpgrade('driveThrough');
    engine.purchaseUpgrade('driveRunner');
    waitForOrder(engine);
    const order = engine.state.driveThroughOrders[0];
    engine.state.shelves = { ...order.requested };
    engine.state.player = { x: 300, y: 700 };
    const moneyBeforeSale = engine.state.money;
    advance(engine, GAME_CONFIG.driveThroughHandoffTime * driveThroughTotal(order.requested));
    expect(driveThroughComplete(order)).toBe(true);
    expect(order.state).toBe('READY_TO_PAY');
    expect(engine.state.money).toBe(moneyBeforeSale);
    expect(Object.values(engine.state.shelves).every((count) => count === 0)).toBe(true);
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime * 2);
    expect(order.state).toBe('READY_TO_PAY');
    engine.purchaseUpgrade('driveCashier');
    const afterHire = engine.state.money;
    advance(engine, GAME_CONFIG.driveThroughCheckoutTime);
    expect(order.state).toBe('LEAVING');
    expect(engine.state.money).toBe(afterHire);
    expect(engine.state.cashStacks.drive.amount).toBe(driveThroughValue(order));
  });

  it('restores open orders and discards malformed or locked drive-through data', () => {
    const engine = new GameEngine();
    engine.economy.earn(10_000);
    engine.purchaseUpgrade('driveThrough');
    waitForOrder(engine);
    const order = engine.state.driveThroughOrders[0];
    const first = PRODUCTS.find(({ id }) => order.requested[id] > 0)!;
    order.delivered[first.id] = 1;
    order.y = 875; // A save from the old lane beside the office.
    engine.state.driveThroughHandoffProgress = 300;
    const restored = validateSave(engine.snapshot())!;
    expect(restored.driveThroughOrders).toHaveLength(1);
    expect(restored.driveThroughOrders[0].requested).toEqual(order.requested);
    expect(restored.driveThroughOrders[0].delivered).toEqual(order.delivered);
    expect(restored.driveThroughOrders[0].y).toBe(GAME_CONFIG.driveThroughVehicleSpot.y);
    expect(restored.driveThroughHandoffProgress).toBe(300);

    const locked = engine.snapshot();
    locked.upgrades.driveThrough = 0;
    const migrated = validateSave(locked)!;
    expect(migrated.driveThroughOrders).toEqual([]);
    expect(migrated.driveThroughHandoffProgress).toBe(0);
    expect(migrated.driveThroughCheckoutProgress).toBe(0);
    expect(emptyItems()).toEqual(migrated.inventory);
  });
});
