import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { PRODUCTS, emptyItems } from '../src/game/data/products';
import { cartCapacity, upgradeCost, xpForLevel } from '../src/game/data/upgrades';
import { GameEngine } from '../src/game/systems/GameEngine';
import { queuePosition } from '../src/game/systems/CustomerSystem';
import { validateSave } from '../src/game/systems/SaveSystem';
import { awardXp } from '../src/game/systems/ProgressionSystem';
import type { GameEvent } from '../src/game/types';

describe('level rewards and expandable store', () => {
  it('adds real shelf space at levels 3, 10, and 20 without losing stock or charging locked purchases', () => {
    const engine = new GameEngine();
    engine.state.money = 100_000;
    engine.state.shelves.tomato = 12;
    for (const [index, level] of [3, 10, 20].entries()) {
      engine.state.xp = xpForLevel(level) - 1;
      const balance = engine.state.money;
      expect(engine.purchaseUpgrade('shelf')).toBe(false);
      expect(engine.state.money).toBe(balance);
      engine.state.xp++;
      const cost = upgradeCost(engine.state, 'shelf');
      expect(engine.purchaseUpgrade('shelf')).toBe(true);
      expect(engine.state.money).toBe(balance - cost);
      expect(engine.state.shelves.tomato).toBe(12 + index * 4);
      expect(engine.state.shelfCapacities.tomato).toBe(16 + index * 4);
      engine.state.inventory.tomato = 8;
      expect(engine.inventory.stock('tomato', 8)).toBe(4);
      expect(engine.state.shelves.tomato).toBe(16 + index * 4);
    }
    expect(engine.purchaseUpgrade('shelf')).toBe(false);
    engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('pasteMachine');
    expect(engine.state.shelfCapacities.tomatoPaste).toBe(24);
    const restored = validateSave(engine.snapshot())!;
    expect(restored.shelves.tomato).toBe(24);
    expect(restored.shelfCapacities).toEqual(engine.state.shelfCapacities);
  });

  it('extends carts one at a time at the exact player-level boundaries, still requiring payment', () => {
    const engine = new GameEngine();
    engine.state.money = 1_000_000;
    for (let purchase = 0; purchase < 7; purchase++)
      expect(engine.purchaseUpgrade('carts')).toBe(true);
    expect(cartCapacity(engine.state)).toBe(10);
    for (const [index, level] of [20, 22, 24, 26, 28].entries()) {
      engine.state.xp = xpForLevel(level) - 1;
      const balance = engine.state.money;
      expect(engine.purchaseUpgrade('carts')).toBe(false);
      expect(engine.state.money).toBe(balance);
      engine.state.xp++;
      engine.state.money = 0;
      expect(engine.purchaseUpgrade('carts')).toBe(false);
      engine.state.money = balance;
      expect(engine.purchaseUpgrade('carts')).toBe(true);
      expect(cartCapacity(engine.state)).toBe(11 + index);
    }
    expect(engine.purchaseUpgrade('carts')).toBe(false);
  });

  it.each(['inventory', 'cashier', 'customers'] as const)(
    'opens advanced %s tiers at 20, 25, and 30',
    (id) => {
      const engine = new GameEngine();
      engine.state.money = 1_000_000;
      const originalCap = id === 'customers' ? 10 : 5;
      for (let tier = 0; tier < originalCap; tier++) expect(engine.purchaseUpgrade(id)).toBe(true);
      for (const level of [20, 25, 30]) {
        engine.state.xp = xpForLevel(level) - 1;
        expect(engine.purchaseUpgrade(id)).toBe(false);
        engine.state.xp++;
        expect(engine.purchaseUpgrade(id)).toBe(true);
      }
      expect(engine.purchaseUpgrade(id)).toBe(false);
    },
  );

  it('preserves owned tiers and expanded stock even if an older save has low XP', () => {
    const engine = new GameEngine();
    engine.state.xp = 0;
    engine.state.upgrades.shelf = 3;
    engine.state.upgrades.carts = 12;
    engine.state.upgrades.cashier = 8;
    engine.state.shelves.tomato = 24;
    const restored = validateSave(engine.snapshot())!;
    expect(restored.upgrades.shelf).toBe(3);
    expect(restored.upgrades.carts).toBe(12);
    expect(restored.upgrades.cashier).toBe(8);
    expect(restored.shelves.tomato).toBe(24);
    expect(restored.xp).toBe(0);
  });

  it('awards XP for paid items and customers once, not for picking up or partial checkout', () => {
    const engine = new GameEngine();
    engine.state.player = { ...GAME_CONFIG.cashierSpot };
    engine.state.xp = xpForLevel(3) - 9;
    engine.state.customers = [
      {
        id: 1,
        ...GAME_CONFIG.queueStart,
        state: 'QUEUEING',
        targetProduct: 'tomato',
        targetQuantity: 2,
        basket: { ...emptyItems(), tomato: 2 },
        color: 0xffffff,
        waitTime: 0,
        path: [],
        queueOrder: 1,
      },
    ];
    engine.checkout.update(999);
    expect(engine.state.xp).toBe(xpForLevel(3) - 9);
    expect(engine.state.totalServed).toBe(0);
    engine.checkout.update(1);
    expect(engine.state.xp).toBe(xpForLevel(3));
    expect(engine.state.totalServed).toBe(1);
    expect(engine.state.money).toBe(0);
    expect(engine.state.cashStacks.store.amount).toBe(10);
    expect(engine.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'upgrade', text: 'Market level 3! New upgrades in Manage' }),
    );
    engine.checkout.update(10000);
    expect(engine.state.xp).toBe(xpForLevel(3));
  });

  it('announces milestones crossed by a large XP award', () => {
    const engine = new GameEngine();
    const events: GameEvent[] = [];
    awardXp(engine.state, xpForLevel(21), (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('New upgrades in Manage');
  });

  it('drains a full fifteen-customer queue without duplicate payments, overlaps, or lost baskets', () => {
    const engine = new GameEngine();
    engine.state.upgrades.carts = 12;
    engine.state.cashier = true;
    engine.state.customers = Array.from({ length: 15 }, (_, index) => ({
      id: index + 1,
      ...queuePosition(index),
      state: 'QUEUEING',
      targetProduct: 'tomato',
      targetQuantity: 1,
      basket: { ...emptyItems(), tomato: 1 },
      color: 0xffffff,
      waitTime: 0,
      path: [],
      queueOrder: index + 1,
    }));
    // Recreate the engine to rebuild queue reservations from these saved positions.
    const simulation = new GameEngine(engine.state);
    for (let time = 0; time < 120_000 && simulation.state.totalServed < 15; time += 50) {
      simulation.customers.update(50);
      simulation.checkout.update(50);
      const queue = simulation.state.customers.filter((customer) =>
        ['QUEUEING', 'MOVING_TO_CHECKOUT', 'PAYING'].includes(customer.state),
      );
      for (const [index, customer] of queue.entries()) {
        for (const other of queue.slice(index + 1))
          expect(Math.hypot(customer.x - other.x, customer.y - other.y)).toBeGreaterThanOrEqual(
            26 - 1e-6,
          );
        for (const product of PRODUCTS)
          expect(
            Math.abs(customer.x - product.shelf.x) < 78 &&
              Math.abs(customer.y - product.shelf.y) < 44,
          ).toBe(false);
      }
    }
    expect(simulation.state.totalServed).toBe(15);
    expect(simulation.state.money).toBe(0);
    expect(simulation.state.cashStacks.store.amount).toBe(75);
    expect(simulation.state.xp).toBe(105);
  });
});
