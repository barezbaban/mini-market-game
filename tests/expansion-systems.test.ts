import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { FARM_PRODUCTS, PRODUCTS, emptyItems, plotCount } from '../src/game/data/products';
import { upgradeCost } from '../src/game/data/upgrades';
import { EconomySystem } from '../src/game/systems/EconomySystem';
import { FarmingSystem, refreshFarmTotals } from '../src/game/systems/FarmingSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { InventorySystem, itemCount } from '../src/game/systems/InventorySystem';
import { MachineSystem } from '../src/game/systems/MachineSystem';
import { createInitialState } from '../src/game/systems/SaveSystem';
import { UpgradeSystem, applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import { WorkerSystem, helperCapacity, helperSpeed } from '../src/game/systems/WorkerSystem';
import type { GameState, ProductId, UpgradeId } from '../src/game/types';

function fixture(upgrades: Partial<Record<UpgradeId, number>> = {}): GameState {
  const state = createInitialState();
  Object.assign(state.upgrades, upgrades);
  applyUpgradeEffects(state);
  return state;
}

function totalUnits(state: GameState): number {
  return (
    itemCount(state.inventory) +
    itemCount(state.shelves) +
    PRODUCTS.reduce(
      (sum, product) =>
        sum + state.farms[product.id].plots.reduce((count, plot) => count + plot.ready, 0),
      0,
    ) +
    state.workers.reduce((sum, worker) => sum + itemCount(worker.basket), 0) +
    MACHINES.reduce((sum, definition) => {
      const machine = state.machines[definition.id];
      return sum + machine.input + machine.processing + machine.output;
    }, 0)
  );
}

describe('individual farm plots', () => {
  it('grows each owned tomato plot independently and refreshes aggregate aliases', () => {
    const state = fixture({ tomatoPlots: 2 });
    state.farms.tomato.plots.forEach((plot) => {
      plot.ready = 0;
      plot.elapsed = 0;
    });
    state.farms.tomato.plots[1].elapsed = 1000;
    const farming = new FarmingSystem(state);
    farming.update(2000);
    expect(state.farms.tomato.plots.slice(0, 3).map((plot) => plot.ready)).toEqual([0, 3, 0]);
    expect(state.farms.tomato.ready).toBe(3);
    expect(state.farms.tomato.elapsed).toBe(2000);
    farming.update(1000);
    expect(state.farms.tomato.plots.slice(0, 3).map((plot) => plot.ready)).toEqual([3, 3, 3]);
    expect(state.farms.tomato.ready).toBe(9);
    expect(state.farms.tomato.elapsed).toBe(0);
    expect(state.farms.tomato.plots[3]).toEqual({ ready: 0, elapsed: 0 });
  });

  it('caps each plot at12 independently, with eight carrot beds and no processed-crop growth', () => {
    const state = fixture({
      expansion: 3,
      corn: 1,
      tomatoPlots: 4,
      carrotPlots: 7,
      pasteMachine: 1,
    });
    const farming = new FarmingSystem(state);
    farming.update(2000);
    expect(state.farms.carrot.ready).toBe(8);
    expect(state.farms.carrot.plots.map((plot) => plot.ready)).toEqual(Array(8).fill(1));
    farming.update(100_000);
    expect(state.farms.tomato.ready).toBe(60);
    expect(state.farms.carrot.ready).toBe(96);
    expect(state.farms.tomato.plots.every((plot) => plot.ready === 12 && plot.elapsed === 0)).toBe(
      true,
    );
    expect(state.farms.tomatoPaste.ready).toBe(0);
    expect(state.farms.tomatoPaste.plots).toEqual([]);
  });

  it('harvests only the requested owned plot and respects shared actor capacity', () => {
    const state = fixture({ tomatoPlots: 1 });
    state.farms.tomato.plots[0].ready = 3;
    state.farms.tomato.plots[1].ready = 6;
    const inventory = new InventorySystem(state);
    expect(inventory.harvest('tomato', 5, 1)).toBe(5);
    expect(state.farms.tomato.plots[0].ready).toBe(3);
    expect(state.farms.tomato.plots[1].ready).toBe(1);
    expect(inventory.harvest('tomato', 8, 0)).toBe(3);
    expect(inventory.total).toBe(8);
    expect(inventory.harvest('tomato', 1, 2)).toBe(0);
    const workerBasket = { ...emptyItems(), egg: 1 };
    expect(inventory.harvestInto('tomato', workerBasket, 2, 8, 1)).toBe(1);
    expect(workerBasket).toEqual({ ...emptyItems(), egg: 1, tomato: 1 });
    expect(state.farms.tomato.ready).toBe(0);
    expect(state.totalHarvested).toBe(9);
    expect(inventory.harvestInto('tomatoPaste', workerBasket, 6, 1)).toBe(0);
  });

  it('does not grow locked areas or unowned plots', () => {
    const state = fixture();
    new FarmingSystem(state).update(100_000);
    expect(state.farms.tomato.plots[0].ready).toBe(12);
    expect(
      state.farms.tomato.plots.slice(1).every((plot) => plot.ready === 0 && plot.elapsed === 0),
    ).toBe(true);
    expect(state.farms.coffee.ready + state.farms.carrot.ready + state.farms.corn.ready).toBe(0);
  });
});

describe('processing machines', () => {
  it('converts one input into one output, including a partial final batch and exact elapsed time', () => {
    const state = fixture({ expansion: 1, pasteMachine: 1 });
    const actor = { ...emptyItems(), tomato: 5 };
    const machine = new MachineSystem(state);
    expect(machine.supply('paste', actor, 5)).toBe(5);
    machine.update(5999);
    expect(state.machines.paste).toEqual({ input: 3, processing: 2, output: 0, elapsed: 5999 });
    machine.update(1);
    expect(state.machines.paste).toEqual({ input: 3, processing: 0, output: 2, elapsed: 0 });
    machine.update(12_000);
    expect(state.machines.paste).toEqual({ input: 0, processing: 0, output: 5, elapsed: 0 });
    expect(machine.collect('paste', actor, 3, 8)).toBe(3);
    expect(itemCount(actor) + state.machines.paste.output).toBe(5);
    expect(machine.collect('paste', actor, 3, 1)).toBe(0);
  });

  it('uses2/4/6/8 batch capacities, keeps an in-flight batch unchanged, and grinds coffee in8s', () => {
    const state = fixture({ expansion: 2, pasteMachine: 1, coffeeMachine: 2 });
    const machines = new MachineSystem(state);
    const actor = { ...emptyItems(), tomato: 12, coffee: 4 };
    machines.supply('paste', actor, 12);
    machines.update(3000);
    state.upgrades.pasteMachine = 4;
    machines.update(3000);
    expect(state.machines.paste.output).toBe(2);
    machines.update(6000);
    expect(state.machines.paste.output).toBe(10);
    machines.supply('coffee', actor, 4);
    machines.update(7999);
    expect(state.machines.coffee.output).toBe(0);
    expect(state.machines.coffee.processing).toBe(4);
    machines.update(1);
    expect(state.machines.coffee.output).toBe(4);
    expect(state.machines.paste.output).toBe(12);
  });

  it('reserves output space, pauses when full, and never overflows either buffer', () => {
    const state = fixture({ expansion: 1, pasteMachine: 4 });
    const machines = new MachineSystem(state);
    const actor = { ...emptyItems(), tomato: 40 };
    expect(machines.supply('paste', actor, 40)).toBe(24);
    expect(actor.tomato).toBe(16);
    state.machines.paste.output = 23;
    const initial = itemCount(actor) + 47;
    machines.update(60_000);
    expect(state.machines.paste).toEqual({ input: 23, output: 24, processing: 0, elapsed: 0 });
    const collector = emptyItems();
    expect(machines.collect('paste', collector, 2, 4)).toBe(2);
    machines.update(6000);
    expect(state.machines.paste.output).toBe(24);
    expect(
      itemCount(actor) +
        itemCount(collector) +
        state.machines.paste.input +
        state.machines.paste.output,
    ).toBe(initial);
  });

  it('rejects locked machines and invalid transfer quantities without mutating actors', () => {
    const state = fixture();
    const machines = new MachineSystem(state);
    const actor = { ...emptyItems(), tomato: 8 };
    expect(machines.supply('paste', actor, 8)).toBe(0);
    state.upgrades.pasteMachine = 1;
    expect(machines.supply('paste', actor, 8)).toBe(0);
    state.upgrades.expansion = 1;
    for (const invalid of [-1, 0, 1.5, NaN, Infinity])
      expect(machines.supply('paste', actor, invalid)).toBe(0);
    expect(actor.tomato).toBe(8);
    expect(state.machines.paste.input).toBe(0);
  });
});

describe('multi-level upgrade rules', () => {
  it('enforces prerequisites, charging escalating prices exactly once per level', () => {
    const state = fixture();
    state.money = 10_000;
    const upgrades = new UpgradeSystem(state, new EconomySystem(state));
    for (const id of [
      'cornPlots',
      'coffeePlots',
      'carrotPlots',
      'pasteMachine',
      'coffeeMachine',
      'helperCapacity',
    ] as const)
      expect(upgrades.purchase(id)).toBe(false);
    expect(upgrades.purchase('shelf')).toBe(false);
    expect(state.money).toBe(10_000);
    for (let level = 0; level < 3; level += 1) {
      const cost = upgradeCost(state, 'expansion');
      const before = state.money;
      expect(upgrades.purchase('expansion')).toBe(true);
      expect(state.money).toBe(before - cost);
    }
    for (let level = 0; level < 7; level += 1) {
      const before = state.money;
      expect(upgradeCost(state, 'carrotPlots')).toBe(Math.ceil(60 * 1.2 ** level));
      expect(upgrades.purchase('carrotPlots')).toBe(true);
      expect(state.money).toBe(before - Math.ceil(60 * 1.2 ** level));
    }
    const money = state.money;
    expect(upgrades.purchase('carrotPlots')).toBe(false);
    expect(upgrades.purchase('expansion')).toBe(false);
    expect(state.money).toBe(money);
    expect(plotCount(state, 'carrot')).toBe(8);
    expect(Object.values(state.shelfCapacities).every((capacity) => capacity === 12)).toBe(true);
  });

  it('hires at most3 helpers and preserves held goods when capacity or speed levels change', () => {
    const state = fixture();
    state.money = 100_000;
    const upgrades = new UpgradeSystem(state, new EconomySystem(state));
    expect(helperCapacity(state)).toBe(2);
    expect(helperSpeed(state)).toBe(110);
    expect(upgrades.purchase('helpers')).toBe(true);
    state.workers[0].basket.tomato = 2;
    const firstWorker = state.workers[0];
    for (let level = 1; level <= 4; level += 1) {
      expect(upgrades.purchase('helperCapacity')).toBe(true);
      expect(helperCapacity(state)).toBe(level + 2);
    }
    for (let level = 1; level <= 9; level += 1) {
      expect(upgrades.purchase('helperSpeed')).toBe(true);
      expect(helperSpeed(state)).toBeCloseTo(110 * 1.1 ** level);
    }
    expect(upgrades.purchase('helpers')).toBe(true);
    expect(upgrades.purchase('helpers')).toBe(true);
    expect(upgrades.purchase('helpers')).toBe(false);
    expect(upgrades.purchase('helperCapacity')).toBe(false);
    expect(upgrades.purchase('helperSpeed')).toBe(false);
    expect(state.workers).toHaveLength(3);
    expect(state.workers[0]).toBe(firstWorker);
    expect(state.workers[0].basket.tomato).toBe(2);
    expect(new Set(state.workers.map((worker) => worker.id)).size).toBe(3);
  });
});

describe('autonomous helper flow', () => {
  it('ignores locked wings and unowned plots even if those buffers contain fixture goods', () => {
    const state = fixture({ helpers: 1 });
    state.farms.tomato.plots[1].ready = 12;
    for (const id of ['corn', 'coffee', 'carrot'] as const) state.farms[id].plots[0].ready = 12;
    const inventory = new InventorySystem(state);
    const workers = new WorkerSystem(state, inventory, new MachineSystem(state));
    let farthest = state.workers[0].x;
    for (let time = 0; time < 60_000; time += 50) {
      workers.update(50);
      farthest = Math.max(
        farthest,
        state.workers[0].x,
        ...state.workers[0].path.map((point) => point.x),
      );
    }
    expect(farthest).toBeLessThanOrEqual(GAME_CONFIG.areaBounds[0]);
    expect(state.totalHarvested).toBe(5);
    expect(state.farms.tomato.plots[1].ready).toBe(12);
    for (const id of ['corn', 'coffee', 'carrot'] as const) {
      expect(state.farms[id].plots[0].ready).toBe(12);
      expect(state.shelves[id] + state.workers[0].basket[id]).toBe(0);
    }
  });

  it('keeps a full carried processed basket safe and delivers it when customer demand resumes', () => {
    const state = fixture({ expansion: 2, coffeeMachine: 1, helpers: 1 });
    for (const product of PRODUCTS) {
      state.shelves[product.id] = 12;
      state.farms[product.id].plots.forEach((plot) => {
        plot.ready = 0;
      });
    }
    refreshFarmTotals(state);
    state.workers[0].basket.groundCoffee = 2;
    const inventory = new InventorySystem(state);
    const workers = new WorkerSystem(state, inventory, new MachineSystem(state));
    const initial = totalUnits(state);
    workers.update(5000);
    expect(state.workers[0].basket.groundCoffee).toBe(2);
    expect(state.workers[0].task).toBe('idle');
    expect(inventory.takeFromShelf('groundCoffee', 2)).toBe(2);
    workers.update(20_000);
    expect(state.shelves.groundCoffee).toBe(12);
    expect(itemCount(state.workers[0].basket)).toBe(0);
    expect(totalUnits(state)).toBe(initial - 2);
  });

  it('walks to harvest and stock useful products even when another shelf is full', () => {
    const state = fixture({ helpers: 1 });
    state.money = 777;
    state.shelves.tomato = 12;
    state.farms.tomato.plots[0].ready = 12;
    state.farms.egg.plots[0].ready = 12;
    refreshFarmTotals(state);
    const inventory = new InventorySystem(state);
    const machines = new MachineSystem(state);
    const workers = new WorkerSystem(state, inventory, machines);
    const initial = totalUnits(state);
    const upgrades = { ...state.upgrades };
    let greatestStep = 0;
    for (let time = 0; time < 60_000; time += 50) {
      const before = { x: state.workers[0].x, y: state.workers[0].y };
      workers.update(50);
      greatestStep = Math.max(
        greatestStep,
        Math.hypot(state.workers[0].x - before.x, state.workers[0].y - before.y),
      );
      expect(itemCount(state.workers[0].basket)).toBeLessThanOrEqual(2);
    }
    expect(greatestStep).toBeGreaterThan(0);
    expect(greatestStep).toBeLessThanOrEqual(110 * 0.05 + 1e-6);
    expect(state.shelves.egg).toBeGreaterThanOrEqual(6);
    expect(state.shelves.tomato).toBe(12);
    expect(state.farms.tomato.plots[0].ready).toBe(12);
    expect(totalUnits(state)).toBe(initial);
    expect(state.money).toBe(777);
    expect(state.upgrades).toEqual(upgrades);
  });

  it('autonomously supplies both machines, collects outputs, and stocks every product without losing goods', () => {
    const state = fixture({
      expansion: 3,
      corn: 1,
      helpers: 3,
      helperCapacity: 4,
      helperSpeed: 9,
      tomatoPlots: 4,
      eggPlots: 4,
      cornPlots: 4,
      coffeePlots: 4,
      carrotPlots: 7,
      pasteMachine: 4,
      coffeeMachine: 4,
    });
    for (const product of FARM_PRODUCTS)
      for (const plot of state.farms[product.id].plots) plot.ready = 12;
    refreshFarmTotals(state);
    const inventory = new InventorySystem(state);
    const machines = new MachineSystem(state);
    const workers = new WorkerSystem(state, inventory, machines);
    const initial = totalUnits(state);
    let greatestStep = 0;
    let greatestBasket = 0;
    for (let time = 0; time < 300_000; time += 50) {
      const previous = state.workers.map((worker) => ({ x: worker.x, y: worker.y }));
      machines.update(50);
      workers.update(50);
      state.workers.forEach((worker, index) => {
        greatestBasket = Math.max(greatestBasket, itemCount(worker.basket));
        greatestStep = Math.max(
          greatestStep,
          Math.hypot(worker.x - previous[index].x, worker.y - previous[index].y),
        );
      });
    }
    expect(PRODUCTS.map((product) => state.shelves[product.id])).toEqual(Array(7).fill(12));
    expect(greatestBasket).toBeLessThanOrEqual(6);
    expect(greatestStep).toBeLessThanOrEqual(helperSpeed(state) * 0.05 + 1e-6);
    expect(totalUnits(state)).toBe(initial);
    expect(state.money).toBe(0);
    expect(state.totalHarvested).toBeGreaterThan(84);
    for (const definition of MACHINES) {
      const machine = state.machines[definition.id];
      expect(machine.input).toBeLessThanOrEqual(24);
      expect(machine.output + machine.processing).toBeLessThanOrEqual(24);
    }
  });

  it('turns helper-grown raw and processed stock into exact cashier payments without player assistance', () => {
    const state = fixture({
      expansion: 3,
      corn: 1,
      helpers: 3,
      helperCapacity: 4,
      helperSpeed: 9,
      tomatoPlots: 4,
      eggPlots: 4,
      cornPlots: 4,
      coffeePlots: 4,
      carrotPlots: 7,
      pasteMachine: 4,
      coffeeMachine: 4,
      cashier: 1,
    });
    const engine = new GameEngine(state);
    const sold = new Set<ProductId>();
    let paid = 0;
    let enteredSolid = false;
    for (let time = 0; time < 300_000; time += 50) {
      const before = new Map(
        state.customers.map((customer) => [
          customer.id,
          { state: customer.state, basket: { ...customer.basket } },
        ]),
      );
      engine.update(50);
      for (const customer of state.customers) {
        enteredSolid ||=
          (customer.x > 863 + 1e-5 &&
            customer.x < 937 - 1e-5 &&
            customer.y > 172 + 1e-5 &&
            customer.y < 260 - 1e-5) ||
          PRODUCTS.some(
            (product) =>
              Math.abs(customer.x - product.shelf.x) < 78 - 1e-5 &&
              customer.y > product.shelf.y - 43 + 1e-5 &&
              customer.y < product.shelf.y + 44 - 1e-5,
          );
        const previous = before.get(customer.id);
        if (!previous || previous.state === 'LEAVING' || customer.state !== 'LEAVING') continue;
        for (const product of PRODUCTS) {
          if (previous.basket[product.id]) sold.add(product.id);
          paid += previous.basket[product.id] * product.sellingPrice;
        }
      }
    }
    expect([...sold].sort()).toEqual(PRODUCTS.map((product) => product.id).sort());
    expect(state.totalServed).toBeGreaterThan(20);
    expect(state.money).toBe(paid);
    expect(state.totalEarned).toBe(paid);
    expect(state.totalHarvested).toBeGreaterThan(state.totalServed);
    expect(state.player).toEqual(GAME_CONFIG.playerStart);
    expect(enteredSolid, 'normal and recovery routes stay outside solid checkout and shelves').toBe(
      false,
    );
  });
});
