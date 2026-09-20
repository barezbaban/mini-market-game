import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { PRODUCTS, emptyItems, plotCount, plotPosition } from '../src/game/data/products';
import { checkoutDuration, playerLevel, upgradeCost } from '../src/game/data/upgrades';
import { GameEngine } from '../src/game/systems/GameEngine';
import { createInitialState, validateSave } from '../src/game/systems/SaveSystem';
import { ProgressionSystem } from '../src/game/systems/ProgressionSystem';
import oldSave from './fixtures/stuck-queue.json';

const advance = (engine: GameEngine, duration: number) => {
  for (let t = 0; t < duration; t += 50) engine.update(Math.min(50, duration - t));
};

describe('expanded market progression and compatibility', () => {
  it('keeps the player movable when a machine is built under their feet', () => {
    const engine = new GameEngine();
    engine.economy.earn(10000);
    engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('expansion');
    for (const machine of MACHINES) {
      engine.state.player = { ...machine.position };
      expect(engine.purchaseUpgrade(machine.upgrade)).toBe(true);
      expect(engine.state.player).toEqual({ x: machine.position.x, y: machine.position.y + 65 });
      const before = engine.state.player.x;
      engine.update(200, { x: 1, y: 0 });
      expect(engine.state.player.x).toBeGreaterThan(before);
    }
  });

  it('migrates version 1 and retains money, old purchases, stock, and every unpaid basket', () => {
    const migrated = validateSave(oldSave)!;
    expect(migrated.version).toBe(2);
    expect(migrated.money).toBe(oldSave.money);
    expect(migrated.totalEarned).toBe(oldSave.totalEarned);
    expect(migrated.upgrades).toMatchObject(oldSave.upgrades);
    expect(migrated.customers.map(({ id, basket }) => ({ id, basket }))).toEqual(
      oldSave.customers.map(({ id, basket }) => ({ id, basket: { ...emptyItems(), ...basket } })),
    );
    expect(migrated.customers.every(({ targetQuantity }) => [1, 2].includes(targetQuantity))).toBe(
      true,
    );
    expect(migrated.shelves).toEqual({ ...emptyItems(), ...oldSave.shelves });
    expect(migrated.farms.tomato.plots[0].ready).toBe(oldSave.farms.tomato.ready);
    expect(migrated.xp).toBe(oldSave.totalServed * 5);
    expect(migrated.workers).toEqual([]);
    expect(migrated.machines.paste).toEqual({ input: 0, output: 0, processing: 0, elapsed: 0 });
  });

  it('starts with one tomato plant and nest, zero purchased expansions, and 12-place shelves', () => {
    const state = createInitialState();
    expect(plotCount(state, 'tomato')).toBe(1);
    expect(plotCount(state, 'egg')).toBe(1);
    expect(plotCount(state, 'corn')).toBe(0);
    expect(plotCount(state, 'coffee')).toBe(0);
    expect(state.upgrades.expansion).toBe(0);
    expect(Object.values(state.shelfCapacities)).toEqual(PRODUCTS.map(() => 12));
  });

  it('gates new products and walking bounds behind three consecutive area purchases', () => {
    const engine = new GameEngine();
    engine.economy.earn(10000);
    engine.state.player = { x: 1205, y: 460 };
    engine.update(1000, { x: 1, y: 0 });
    expect(engine.state.player.x).toBe(GAME_CONFIG.areaBounds[0]);
    expect(engine.purchaseUpgrade('pasteMachine')).toBe(false);
    expect(engine.purchaseUpgrade('expansion')).toBe(true);
    expect(engine.purchaseUpgrade('pasteMachine')).toBe(true);
    expect(engine.state.unlockedProducts).toContain('tomatoPaste');
    expect(engine.state.unlockedProducts).not.toContain('coffee');
    engine.update(1000, { x: 1, y: 0 });
    expect(engine.state.player.x).toBeGreaterThan(GAME_CONFIG.areaBounds[0]);
    expect(engine.purchaseUpgrade('expansion')).toBe(true);
    expect(engine.state.unlockedProducts).toContain('coffee');
    expect(engine.purchaseUpgrade('coffeeMachine')).toBe(true);
    expect(engine.state.unlockedProducts).toContain('groundCoffee');
    expect(engine.purchaseUpgrade('carrotPlots')).toBe(false);
    expect(engine.purchaseUpgrade('expansion')).toBe(true);
    expect(engine.state.unlockedProducts).toContain('carrot');
    expect(engine.purchaseUpgrade('expansion')).toBe(false);
  });

  it('charges exactly once per visit to a multi-level farm upgrade pad', () => {
    const engine = new GameEngine();
    engine.economy.earn(10000);
    engine.state.player = { x: 265, y: 855 };
    advance(engine, 6000);
    expect(engine.state.upgrades.tomatoPlots).toBe(1);
    expect(engine.state.money).toBe(9940);
    engine.state.player = { x: 400, y: 880 };
    advance(engine, 50);
    engine.state.player = { x: 265, y: 855 };
    advance(engine, 1250);
    expect(engine.state.upgrades.tomatoPlots).toBe(2);
    expect(engine.state.money).toBe(9940 - 81);
  });

  it('increases cashier speed at each level without altering payment values', () => {
    const engine = new GameEngine();
    engine.economy.earn(100000);
    let previous = Infinity;
    for (let level = 1; level <= 5; level++) {
      expect(engine.purchaseUpgrade('cashier')).toBe(true);
      expect(checkoutDuration(engine.state)).toBeLessThan(previous);
      previous = checkoutDuration(engine.state);
      const cash = engine.state.money;
      engine.state.customers = [
        {
          id: level,
          x: 843,
          y: 260,
          state: 'QUEUEING',
          targetProduct: 'tomato',
          targetQuantity: 1,
          basket: { ...emptyItems(), tomato: 1 },
          color: 0xffffff,
          waitTime: 0,
          path: [],
          queueOrder: level,
        },
      ];
      engine.checkout.update(checkoutDuration(engine.state));
      expect(engine.state.money).toBe(cash + 5);
    }
    expect(engine.purchaseUpgrade('cashier')).toBe(false);
  });

  it('the accountant grants timed XP, advances player levels, and persists partial intervals', () => {
    const state = createInitialState();
    const progression = new ProgressionSystem(state);
    progression.update(20000);
    expect(state.xp).toBe(0);
    state.upgrades.accountant = 2;
    progression.update(9999);
    expect(state.xp).toBe(0);
    progression.update(1);
    expect(state.xp).toBe(10);
    progression.update(90000);
    expect(state.xp).toBe(100);
    expect(playerLevel(state.xp)).toBe(2);
    progression.update(4200);
    const restored = validateSave(JSON.parse(JSON.stringify(state)))!;
    expect(restored.xp).toBe(100);
    expect(restored.accountantElapsed).toBe(4200);
  });

  it('preserves helper cargo, purchased plots, and machine inputs and unfinished batches', () => {
    const engine = new GameEngine();
    engine.economy.earn(10000);
    engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('pasteMachine');
    engine.purchaseUpgrade('helpers');
    engine.purchaseUpgrade('tomatoPlots');
    engine.state.workers[0].basket.tomato = 2;
    engine.state.farms.tomato.plots[1].ready = 4;
    engine.state.farms.tomato.ready += 4;
    engine.state.machines.paste = { input: 5, output: 3, processing: 2, elapsed: 2500 };
    const restored = validateSave(engine.snapshot())!;
    expect(restored.workers[0].basket.tomato).toBe(2);
    expect(restored.machines.paste).toEqual(engine.state.machines.paste);
    expect(restored.farms.tomato.plots).toEqual(engine.state.farms.tomato.plots);
    expect(restored.upgrades).toEqual(engine.state.upgrades);
    expect(restored.money).toBe(engine.state.money);
  });

  it('uses eight individually harvestable carrot beds and 20 percent price scaling', () => {
    const engine = new GameEngine();
    engine.economy.earn(100000);
    for (let i = 0; i < 3; i++) engine.purchaseUpgrade('expansion');
    for (let level = 0; level < 7; level++) {
      expect(upgradeCost(engine.state, 'carrotPlots')).toBe(Math.ceil(60 * 1.2 ** level));
      expect(engine.purchaseUpgrade('carrotPlots')).toBe(true);
    }
    expect(plotCount(engine.state, 'carrot')).toBe(8);
    expect(engine.purchaseUpgrade('carrotPlots')).toBe(false);
    const before = engine.state.farms.carrot.plots[7].ready;
    engine.state.player = plotPosition('carrot', 7);
    advance(engine, 2500);
    expect(engine.state.inventory.carrot).toBeGreaterThan(before);
  });

  it('automatically loads and collects processing machines while preserving raw conversion', () => {
    const engine = new GameEngine();
    engine.economy.earn(10000);
    engine.purchaseUpgrade('expansion');
    engine.purchaseUpgrade('pasteMachine');
    const machine = MACHINES[0];
    engine.state.inventory.tomato = 4;
    engine.state.player = { x: machine.position.x + 55, y: machine.position.y };
    advance(engine, 21000);
    const remaining = engine.state.machines.paste;
    expect(engine.state.inventory.tomatoPaste).toBe(4);
    expect(
      engine.state.inventory.tomato + remaining.input + remaining.processing + remaining.output,
    ).toBe(0);
  });
});
