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
    expect(engine.state.money).toBe(openingMoney + driveThroughValue(order));
    expect(engine.state.driveThroughServed).toBe(1);
    expect(engine.state.totalServed).toBe(1);
    expect(engine.state.xp).toBe(5);
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
    expect(engine.state.money).toBe(afterHire + driveThroughValue(order));
  });

  it('restores open orders and discards malformed or locked drive-through data', () => {
    const engine = new GameEngine();
    engine.economy.earn(10_000);
    engine.purchaseUpgrade('driveThrough');
    waitForOrder(engine);
    const order = engine.state.driveThroughOrders[0];
    const first = PRODUCTS.find(({ id }) => order.requested[id] > 0)!;
    order.delivered[first.id] = 1;
    engine.state.driveThroughHandoffProgress = 300;
    const restored = validateSave(engine.snapshot())!;
    expect(restored.driveThroughOrders).toHaveLength(1);
    expect(restored.driveThroughOrders[0].requested).toEqual(order.requested);
    expect(restored.driveThroughOrders[0].delivered).toEqual(order.delivered);
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
