import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { PRODUCTS, emptyItems } from '../src/game/data/products';
import { UPGRADES } from '../src/game/data/upgrades';
import { CheckoutSystem } from '../src/game/systems/CheckoutSystem';
import { queuePosition, remainingCustomerNeed } from '../src/game/systems/CustomerSystem';
import { EconomySystem } from '../src/game/systems/EconomySystem';
import { FarmingSystem } from '../src/game/systems/FarmingSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { InventorySystem, itemCount } from '../src/game/systems/InventorySystem';
import { createInitialState, SaveSystem } from '../src/game/systems/SaveSystem';
import type { CustomerData, SaveRepository } from '../src/game/types';

const advance = (engine: GameEngine, milliseconds: number) => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 50)
    engine.update(Math.min(50, milliseconds - elapsed), { x: 0, y: 0 });
};

class MemoryRepository implements SaveRepository {
  value: string | null = null;
  read() {
    return this.value;
  }
  write(value: string) {
    this.value = value;
  }
  clear() {
    this.value = null;
  }
}

const buyer = (id = 1): CustomerData => ({
  id,
  ...queuePosition(0),
  state: 'QUEUEING',
  targetProduct: 'tomato',
  targetQuantity: 1,
  basket: { ...emptyItems(), tomato: 1, egg: 1 },
  color: 0x739ebd,
  waitTime: 0,
  path: [],
});

describe('economy and capacity invariants', () => {
  it('starts with no money and useful harvests for the first minute', () => {
    const state = createInitialState();
    expect(state.money).toBe(0);
    expect(state.farms.tomato.ready).toBe(3);
    expect(state.farms.egg.ready).toBe(2);
    expect(state.unlockedProducts).toEqual(['tomato', 'egg']);
  });

  it('rejects overdrafts, fractions, negative amounts, NaN and overflow', () => {
    const state = createInitialState();
    const economy = new EconomySystem(state);
    expect(economy.spend(1)).toBe(false);
    for (const invalid of [-2, 1.5, NaN, Infinity]) {
      expect(economy.earn(invalid)).toBe(false);
      expect(economy.spend(invalid)).toBe(false);
    }
    expect(state.money).toBe(0);
    expect(economy.earn(15)).toBe(true);
    expect(economy.spend(12)).toBe(true);
    expect(state.money).toBe(3);
    expect(state.totalEarned).toBe(15);
    expect(economy.earn(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(state.money).toBe(3);
  });

  it('transfers exact quantities and enforces shared basket / per-shelf capacities', () => {
    const state = createInitialState();
    const inventory = new InventorySystem(state);
    state.farms.tomato.ready = 8;
    state.farms.egg.ready = 8;
    state.farms.tomato.plots[0].ready = 8;
    state.farms.egg.plots[0].ready = 8;
    expect(inventory.harvest('tomato', 6)).toBe(6);
    expect(inventory.harvest('egg', 8)).toBe(2);
    expect(inventory.harvest('egg')).toBe(0);
    expect(itemCount(state.inventory)).toBe(8);
    state.shelves.tomato = 11;
    expect(inventory.stock('tomato', 6)).toBe(1);
    expect(state.inventory.tomato).toBe(5);
    expect(state.shelves.tomato).toBe(12);
    expect(inventory.takeFromShelf('tomato', 100)).toBe(12);
    expect(inventory.takeFromShelf('tomato')).toBe(0);
    expect(inventory.harvest('corn')).toBe(0);
    expect(inventory.stock('egg', -2)).toBe(0);
  });

  it('discards every carried item without changing shelves or earnings', () => {
    const state = createInitialState();
    const inventory = new InventorySystem(state);
    state.inventory.tomato = 3;
    state.inventory.egg = 2;
    state.shelves.tomato = 4;
    expect(inventory.discardAll()).toBe(5);
    expect(inventory.total).toBe(0);
    expect(state.shelves.tomato).toBe(4);
    expect(state.money).toBe(0);
    expect(inventory.discardAll()).toBe(0);
  });
});

describe('production and player interaction', () => {
  it('grows each unlocked crop at its configured interval and respects field capacity', () => {
    const state = createInitialState();
    const farming = new FarmingSystem(state);
    farming.update(2999);
    expect(state.farms.tomato.ready).toBe(3);
    farming.update(1);
    expect(state.farms.tomato.ready).toBe(6);
    expect(state.farms.egg.ready).toBe(2);
    farming.update(1000);
    expect(state.farms.egg.ready).toBe(3);
    farming.update(100000);
    expect(state.farms.tomato.ready).toBe(GAME_CONFIG.farmCapacity);
    expect(state.farms.egg.ready).toBe(GAME_CONFIG.farmCapacity);
    expect(state.farms.corn.ready).toBe(0);
  });

  it('automatically harvests then stocks while standing nearby without minting money', () => {
    const engine = new GameEngine();
    engine.state.player = { ...PRODUCTS[0].farm };
    advance(engine, 1000);
    expect(engine.state.inventory.tomato).toBe(3);
    expect(engine.state.totalHarvested).toBe(3);
    engine.state.player = { x: PRODUCTS[0].shelf.x, y: PRODUCTS[0].shelf.y + 55 };
    advance(engine, 1000);
    expect(engine.state.inventory.tomato).toBe(0);
    expect(engine.state.shelves.tomato).toBe(3);
    expect(engine.state.money).toBe(0);
    expect(engine.state.tutorialStep).toBe(3);
  });

  it('keeps a shopper waiting until the quantity in their thought bubble is fulfilled', () => {
    const engine = new GameEngine();
    engine.state.shelves.tomato = 1;
    engine.state.customers = [
      {
        id: 2,
        x: 265,
        y: 305,
        state: 'WAITING_FOR_PRODUCT',
        targetProduct: 'tomato',
        targetQuantity: 2,
        basket: emptyItems(),
        color: 0x739ebd,
        waitTime: 0,
        path: [],
      },
    ];
    engine.customers.update(50);
    expect(engine.state.customers[0].basket.tomato).toBe(1);
    expect(engine.state.customers[0].state).toBe('WAITING_FOR_PRODUCT');
    expect(remainingCustomerNeed(engine.state.customers[0])).toBe(1);
    engine.state.shelves.tomato = 1;
    engine.customers.update(50);
    expect(engine.state.customers[0].basket.tomato).toBe(2);
    expect(engine.state.customers[0].state).toBe('MOVING_TO_CHECKOUT');
    expect(remainingCustomerNeed(engine.state.customers[0])).toBe(0);
  });

  it('normalizes diagonal movement and blocks walking through shelving', () => {
    const straight = new GameEngine();
    const diagonal = new GameEngine();
    const start = { ...straight.state.player };
    straight.update(200, { x: 1, y: 0 });
    diagonal.update(200, { x: 1, y: 1 });
    expect(
      Math.hypot(diagonal.state.player.x - start.x, diagonal.state.player.y - start.y),
    ).toBeCloseTo(straight.state.player.x - start.x);
    straight.state.player = { x: 265, y: 300 };
    straight.update(1000, { x: 0, y: -1 });
    expect(straight.state.player.y).toBeGreaterThanOrEqual(284);
  });

  it('gives rate-limited feedback for full baskets and shelves', () => {
    const engine = new GameEngine();
    engine.state.inventory.tomato = 8;
    engine.state.player = { ...PRODUCTS[0].farm };
    advance(engine, 2900);
    expect(
      engine
        .drainEvents()
        .filter((event) => event.type === 'notice')
        .map((event) => event.text),
    ).toEqual(['Basket full — stock a shelf']);
    engine.state.shelves.tomato = 12;
    engine.state.player = { x: PRODUCTS[0].shelf.x, y: PRODUCTS[0].shelf.y + 55 };
    advance(engine, 2900);
    expect(
      engine
        .drainEvents()
        .filter((event) => event.type === 'notice')
        .map((event) => event.text),
    ).toEqual(['Tomato shelf full']);
    expect(engine.state.inventory.tomato).toBe(8);
  });

  it('requires a deliberate trash-bin hold and only empties once per visit', () => {
    const engine = new GameEngine();
    engine.state.inventory.tomato = 2;
    engine.state.inventory.egg = 1;
    engine.state.player = { ...GAME_CONFIG.trash };
    advance(engine, GAME_CONFIG.trashHoldTime - 50);
    expect(itemCount(engine.state.inventory)).toBe(3);
    expect(engine.trashProgress).toBeGreaterThan(0.9);
    advance(engine, 50);
    expect(itemCount(engine.state.inventory)).toBe(0);
    expect(engine.drainEvents()).toContainEqual({
      type: 'discard',
      text: 'Discarded 3 items',
      ...GAME_CONFIG.trash,
    });
    engine.state.inventory.tomato = 1;
    advance(engine, GAME_CONFIG.trashHoldTime + 100);
    expect(engine.state.inventory.tomato).toBe(1);
    engine.state.player = { x: GAME_CONFIG.trash.x - 100, y: GAME_CONFIG.trash.y };
    advance(engine, 50);
    engine.state.player = { ...GAME_CONFIG.trash };
    advance(engine, GAME_CONFIG.trashHoldTime);
    expect(engine.state.inventory.tomato).toBe(0);
  });
});

describe('upgrades', () => {
  it('purchases first upgrade levels, keeps one-time unlocks capped, and cannot overspend', () => {
    const engine = new GameEngine();
    expect(engine.purchaseUpgrade('corn')).toBe(false);
    engine.economy.earn(1000);
    for (const id of ['inventory', 'customers', 'corn', 'cashier'] as const)
      expect(engine.purchaseUpgrade(id)).toBe(true);
    expect(engine.purchaseUpgrade('corn')).toBe(false);
    expect(engine.purchaseUpgrade('shelf')).toBe(false);
    expect(engine.state.money).toBe(1000 - 100 - 90 - 150 - 300);
    expect(engine.state.inventoryCapacity).toBe(12);
    expect(engine.state.shelfCapacities.tomato).toBe(12);
    expect(engine.state.shelfCapacities.egg).toBe(12);
    expect(engine.state.cashier).toBe(true);
    expect(engine.state.unlockedProducts).toContain('corn');
    expect(engine.state.farms.corn.ready).toBe(0);
    engine.farming.update(5000);
    expect(engine.state.farms.corn.ready).toBe(2);
    expect(engine.state.tutorialStep).toBe(6);
  });

  it('requires a complete hold on an upgrade pad and charges once', () => {
    const engine = new GameEngine();
    engine.economy.earn(150);
    engine.state.player = { ...UPGRADES.find((upgrade) => upgrade.id === 'corn')!.position };
    advance(engine, GAME_CONFIG.upgradeHoldTime - 50);
    expect(engine.state.upgrades.corn).toBe(0);
    advance(engine, 50);
    expect(engine.state.upgrades.corn).toBe(1);
    advance(engine, 3000);
    expect(engine.state.money).toBe(0);
  });
});

describe('customers and checkout', () => {
  it('keeps goods unpaid until a player serves for one second, then pays exactly once', () => {
    const state = createInitialState();
    state.customers = [buyer()];
    const checkout = new CheckoutSystem(state, new EconomySystem(state));
    checkout.update(5000);
    expect(state.money).toBe(0);
    state.player = { ...GAME_CONFIG.cashierSpot };
    checkout.update(999);
    expect(state.money).toBe(0);
    checkout.update(1);
    expect(state.money).toBe(12);
    expect(state.totalEarned).toBe(12);
    expect(state.totalServed).toBe(1);
    checkout.update(5000);
    expect(state.money).toBe(12);
    expect(state.customers[0].basket).toEqual(emptyItems());
  });

  it('runs stocked shelves through shopping, a queue, and cashier payment without the player', () => {
    const engine = new GameEngine();
    engine.state.money = 300;
    engine.purchaseUpgrade('cashier');
    engine.state.shelves.tomato = 8;
    engine.state.shelves.egg = 8;
    const availableValue = 8 * 5 + 8 * 7;
    advance(engine, 150000);
    expect(engine.state.totalServed).toBeGreaterThan(4);
    expect(engine.state.totalEarned).toBe(availableValue);
    expect(engine.state.money).toBe(availableValue);
    expect(engine.state.customers.length).toBeLessThanOrEqual(GAME_CONFIG.customerMax);
    expect(engine.state.shelves.tomato + engine.state.shelves.egg).toBe(0);
  });

  it('keeps a full snake queue distinct and drains it when the player returns', () => {
    const engine = new GameEngine();
    engine.state.shelves.tomato = 8;
    engine.state.shelves.egg = 8;
    advance(engine, 100000);
    const queue = engine.state.customers.filter((customer) => customer.state === 'QUEUEING');
    expect(queue.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < queue.length; i++)
      for (let j = i + 1; j < queue.length; j++) {
        expect(Math.hypot(queue[i].x - queue[j].x, queue[i].y - queue[j].y)).toBeGreaterThanOrEqual(
          37,
        );
      }
    engine.state.player = { ...GAME_CONFIG.cashierSpot };
    advance(engine, 45000);
    expect(engine.state.totalEarned).toBe(96);
  });

  it('keeps arriving and advancing shoppers separated through sustained queue pressure', () => {
    const engine = new GameEngine();
    engine.state.player = { x: 200, y: 450 };
    let closest = Infinity;
    for (let frame = 0; frame < 7000; frame += 1) {
      if (frame === 3000) {
        engine.economy.earn(300);
        engine.purchaseUpgrade('cashier');
      }
      engine.state.shelves.tomato = 8;
      engine.state.shelves.egg = 8;
      engine.update(50, { x: 0, y: 0 });
      const queue = engine.state.customers.filter((customer) =>
        ['MOVING_TO_CHECKOUT', 'QUEUEING', 'PAYING'].includes(customer.state),
      );
      for (let i = 0; i < queue.length; i++)
        for (let j = i + 1; j < queue.length; j++) {
          closest = Math.min(closest, Math.hypot(queue[i].x - queue[j].x, queue[i].y - queue[j].y));
        }
    }
    expect(closest).toBeGreaterThanOrEqual(26);
    expect(engine.state.totalServed).toBeGreaterThan(30);
  });

  it('serves in checkout arrival order even when an older shopper takes longer to shop', () => {
    const state = createInitialState();
    const first = { ...buyer(2), queueOrder: 1 };
    const later = { ...buyer(1), ...queuePosition(1), queueOrder: 2 };
    state.customers = [later, first];
    state.player = { ...GAME_CONFIG.cashierSpot };
    const repository = new MemoryRepository();
    const saves = new SaveSystem(repository);
    saves.save(state);
    const engine = new GameEngine(saves.load());
    advance(engine, 1000);
    expect(engine.state.customers.find((customer) => customer.id === 2)!.state).toBe('LEAVING');
    expect(engine.state.customers.find((customer) => customer.id === 1)!.state).not.toBe('LEAVING');
  });
});

describe('save integrity and recovery', () => {
  it('round trips upgrades, completed tutorial, unpaid shoppers and a partial checkout', () => {
    const repository = new MemoryRepository();
    const saves = new SaveSystem(repository);
    const engine = new GameEngine();
    engine.economy.earn(1000);
    engine.purchaseUpgrade('corn');
    engine.purchaseUpgrade('inventory');
    engine.state.inventory.corn = 4;
    engine.state.customers = [{ ...buyer(), state: 'PAYING' }];
    engine.state.checkoutProgress = 550;
    expect(saves.save(engine.state)).toBe(true);
    const restored = saves.load();
    expect(restored).toEqual(engine.state);
    restored.player = { ...GAME_CONFIG.cashierSpot };
    const resumed = new GameEngine(restored);
    advance(resumed, 450);
    expect(resumed.state.totalServed).toBe(1);
    expect(resumed.state.money).toBe(762);
  });

  it('recovers malformed and unsupported saves, and reports unavailable storage', () => {
    const repository = new MemoryRepository();
    const saves = new SaveSystem(repository);
    repository.value = '{';
    expect(saves.load()).toEqual(createInitialState());
    expect(saves.status).toBe('invalid');
    repository.value = JSON.stringify({ version: 0, money: 500 });
    expect(saves.load().money).toBe(0);
    expect(saves.status).toBe('invalid');
    const unavailable = new SaveSystem({
      read: () => {
        throw new Error('Storage blocked');
      },
      write: () => {
        throw new Error('Quota full');
      },
      clear: () => {
        throw new Error('Blocked');
      },
    });
    expect(unavailable.load().money).toBe(0);
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.save(createInitialState())).toBe(false);
    expect(unavailable.lastError).toBe('Quota full');
    expect(unavailable.reset()).toBe(false);
  });

  it('rebuilds capacities and clamps corrupted amounts without granting locked items', () => {
    const repository = new MemoryRepository();
    const state = createInitialState();
    repository.value = JSON.stringify({
      ...state,
      money: -100,
      inventoryCapacity: 900,
      shelfCapacities: { tomato: 900, egg: 900, corn: 900 },
      inventory: { tomato: 7, egg: 7, corn: 7 },
      shelves: { tomato: 100, egg: -10, corn: 8 },
      unlockedProducts: ['tomato', 'egg', 'corn'],
      cashier: true,
    });
    const repaired = new SaveSystem(repository).load();
    expect(repaired.money).toBe(0);
    expect(repaired.inventoryCapacity).toBe(8);
    expect(itemCount(repaired.inventory)).toBe(8);
    expect(repaired.inventory.corn).toBe(0);
    expect(repaired.shelves).toEqual({ ...emptyItems(), tomato: 12 });
    expect(repaired.cashier).toBe(false);
  });

  it('provides independent snapshots and clears storage on reset', () => {
    const engine = new GameEngine();
    const snapshot = engine.snapshot();
    snapshot.farms.tomato.ready = 0;
    snapshot.player.x = 900;
    expect(engine.state.farms.tomato.ready).toBe(3);
    expect(engine.state.player.x).toBe(GAME_CONFIG.playerStart.x);
    const repository = new MemoryRepository();
    const saves = new SaveSystem(repository);
    saves.save(engine.state);
    expect(saves.reset()).toBe(true);
    expect(repository.value).toBeNull();
  });
});
