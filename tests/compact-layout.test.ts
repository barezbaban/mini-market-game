import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { FARM_PRODUCTS, PRODUCTS, plotPosition, emptyItems } from '../src/game/data/products';
import { worldSolids, crossesRect } from '../src/game/data/worldLayout';
import { GameEngine } from '../src/game/systems/GameEngine';
import { canStand, clearWalk, walkRoute, exitRoute } from '../src/game/systems/Navigation';
import { createInitialState, validateSave } from '../src/game/systems/SaveSystem';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import { queuePosition } from '../src/game/systems/CustomerSystem';
import type { Vec2 } from '../src/game/types';

function fullStore() {
  const state = createInitialState();
  state.xp = 100000;
  Object.assign(state.upgrades, {
    expansion: 4,
    corn: 1,
    cashier: 1,
    secondCashier: 1,
    pasteMachine: 1,
    coffeeMachine: 1,
    dairyMachine: 1,
    grillMachine: 1,
    helpers: 3,
    tomatoPlots: 4,
    eggPlots: 4,
    cornPlots: 4,
    coffeePlots: 4,
    carrotPlots: 7,
    cowPlots: 4,
    driveThrough: 1,
  });
  applyUpgradeEffects(state);
  return state;
}

describe('compact store layout', () => {
  it('keeps busy shoppers and helpers outside walls and furniture throughout actual movement', () => {
    const state = fullStore();
    Object.assign(state.upgrades, {
      carts: 12,
      customers: 13,
      cashier: 5,
      helperSpeed: 9,
      helperCapacity: 4,
    });
    applyUpgradeEffects(state);
    const engine = new GameEngine(state);
    for (let time = 0; time < 180000; time += 50) {
      for (const product of PRODUCTS) state.shelves[product.id] = 12;
      const actors = [...state.customers, ...state.workers];
      const positions = new Map(actors.map((actor) => [actor, { x: actor.x, y: actor.y }]));
      engine.update(50);
      for (const actor of actors) {
        expect(
          clearWalk(state, positions.get(actor)!, actor),
          JSON.stringify({ time, actor }),
        ).toBe(true);
      }
      engine.drainEvents();
    }
    expect(state.totalServed).toBeGreaterThan(30);
  });

  it('fits every department in two shelf rows and a compact three-column farmyard', () => {
    expect(new Set(PRODUCTS.map((p) => p.shelf.y)).size).toBe(2);
    expect(new Set(FARM_PRODUCTS.map((p) => p.farm.x)).size).toBe(3);
    expect(new Set(GAME_CONFIG.areaBounds).size).toBe(1);
    expect(GAME_CONFIG.width).toBeLessThanOrEqual(1500);
    expect(Math.abs(GAME_CONFIG.secondCheckout.x - GAME_CONFIG.checkout.x)).toBeLessThan(300);
  });

  it('routes between all shelves, plots, machines and checkout stations without crossing furniture or walls', () => {
    const state = fullStore();
    const destinations = [
      GAME_CONFIG.playerStart,
      GAME_CONFIG.entrance,
      GAME_CONFIG.entranceOutside,
      GAME_CONFIG.serviceDoor,
      GAME_CONFIG.cashierSpot,
      GAME_CONFIG.secondCashierSpot,
      GAME_CONFIG.storeCash,
      GAME_CONFIG.secondCash,
      GAME_CONFIG.driveCash,
      GAME_CONFIG.driveThroughPlayerSpot,
      ...PRODUCTS.map((p) => ({ x: p.shelf.x, y: p.shelf.y + 65 })),
      ...FARM_PRODUCTS.flatMap((p) =>
        Array.from({ length: p.maxPlots }, (_, i) => plotPosition(p.id, i)),
      ),
      ...MACHINES.map((m) => ({ x: m.position.x, y: m.position.y + 65 })),
      ...Array.from({ length: 15 }, (_, i) => queuePosition(i)),
    ];
    for (const from of destinations) {
      expect(canStand(state, from), JSON.stringify(from)).toBe(true);
      for (const to of destinations) {
        const route = walkRoute(state, from, to);
        expect(route.at(-1), `${JSON.stringify(from)} → ${JSON.stringify(to)}`).toEqual(to);
        let start: Vec2 = from;
        for (const end of route) {
          expect(clearWalk(state, start, end)).toBe(true);
          expect(worldSolids(state).some((rect) => crossesRect(start, end, rect))).toBe(false);
          start = end;
        }
      }
    }
  });

  it('uses the front doorway on departure instead of cutting through the front wall', () => {
    const state = fullStore();
    const route = exitRoute(state, GAME_CONFIG.queueStart);
    expect(route).toContainEqual(GAME_CONFIG.entrance);
    expect(route).toContainEqual(GAME_CONFIG.entranceOutside);
    let previous: Vec2 = GAME_CONFIG.queueStart;
    for (const point of route) {
      expect(clearWalk(state, previous, point)).toBe(true);
      previous = point;
    }
    expect(clearWalk(state, { x: 1100, y: 850 }, { x: 1100, y: 950 })).toBe(false);
    expect(clearWalk(state, { x: 600, y: 1550 }, { x: 700, y: 1550 })).toBe(false);
  });

  it('relocates legacy saves once while preserving goods, wallet, upgrades, XP, orders and stolen cash', () => {
    const state = fullStore();
    Object.assign(state, {
      money: 4321,
      xp: 100000,
      player: { x: 2500, y: 650 },
      inventory: { ...emptyItems(), milk: 2 },
    });
    state.workers[0].basket.tomato = 2;
    state.shelves.cheese = 5;
    state.cashStacks.store.amount = 555;
    state.machines.dairy = { input: 2, processing: 2, output: 3, elapsed: 400 };
    state.customers = [
      {
        id: 1,
        x: 843,
        y: 260,
        state: 'PAYING',
        targetProduct: 'tomato',
        targetQuantity: 1,
        basket: { ...emptyItems(), tomato: 1 },
        color: 0xffffff,
        waitTime: 0,
        path: [],
        queueOrder: 1,
      },
    ];
    state.checkoutProgress = 350;
    state.driveThroughOrders = [
      {
        id: 1,
        x: 1200,
        y: 875,
        state: 'WAITING_FOR_ITEMS',
        vehicle: 'car',
        color: 0xffffff,
        requested: { ...emptyItems(), tomato: 2 },
        delivered: { ...emptyItems(), tomato: 1 },
      },
    ];
    state.driveThroughHandoffProgress = 200;
    state.security.thief = {
      x: 2400,
      y: 600,
      phase: 'FLEEING',
      target: 'store',
      stolen: 80,
      elapsed: 200,
      path: [],
    };
    const legacy: Partial<typeof state> = structuredClone(state);
    delete legacy.layoutVersion;
    const restored = validateSave(legacy)!;
    for (const field of [
      'money',
      'xp',
      'inventory',
      'upgrades',
      'shelves',
      'machines',
      'cashStacks',
      'checkoutProgress',
    ] as const)
      expect(restored[field]).toEqual(state[field]);
    expect(restored.workers[0].basket).toEqual(state.workers[0].basket);
    expect(restored.customers[0].basket).toEqual(state.customers[0].basket);
    expect(restored.driveThroughOrders[0].delivered).toEqual(state.driveThroughOrders[0].delivered);
    expect(restored.driveThroughHandoffProgress).toBe(200);
    expect(restored.security.thief?.stolen).toBe(80);
    expect(restored.player).toEqual(GAME_CONFIG.playerStart);
    expect(restored.layoutVersion).toBe(2);
    restored.player = { x: 600, y: 1100 };
    expect(validateSave(restored)!.player).toEqual(restored.player);
  });

  it('does not let a helper transfer items from an unreachable destination', () => {
    const engine = new GameEngine(fullStore());
    const worker = engine.state.workers[0];
    worker.task = 'stock';
    worker.product = 'tomato';
    worker.basket.tomato = 2;
    worker.target = { x: 260, y: 505 };
    worker.path = [];
    worker.x = 260;
    worker.y = 1130;
    engine.workers.update(50);
    expect(engine.state.shelves.tomato).toBe(0);
    expect(worker.basket.tomato).toBe(2);
  });

  it('repairs existing walking routes when a newly unlocked department adds furniture', () => {
    const engine = new GameEngine();
    engine.state.money = 10000;
    engine.state.customers = [
      {
        id: 1,
        x: 260,
        y: 210,
        state: 'MOVING_TO_SHELF',
        targetProduct: 'tomato',
        targetQuantity: 1,
        basket: emptyItems(),
        color: 0xffffff,
        waitTime: 0,
        path: [{ x: 260, y: 505 }],
      },
    ];
    expect(engine.purchaseUpgrade('expansion')).toBe(true);
    const customer = engine.state.customers[0];
    expect(canStand(engine.state, customer)).toBe(true);
    expect(customer.path.at(-1)).toEqual({ x: 260, y: 505 });
    let from: Vec2 = customer;
    for (const point of customer.path) {
      expect(clearWalk(engine.state, from, point)).toBe(true);
      from = point;
    }
  });
});
