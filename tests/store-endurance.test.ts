import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { PRODUCTS, emptyItems, plotCount } from '../src/game/data/products';
import { GameEngine } from '../src/game/systems/GameEngine';
import { itemCount } from '../src/game/systems/InventorySystem';
import { SaveSystem } from '../src/game/systems/SaveSystem';
import { helperCapacity } from '../src/game/systems/WorkerSystem';
import type { GameState, ItemCounts, ProductId, UpgradeId } from '../src/game/types';

const duration = 15 * 60_000;
const basketValue = (basket: ItemCounts): number =>
  PRODUCTS.reduce((total, product) => total + basket[product.id] * product.sellingPrice, 0);

function bounded(value: number, maximum: number, context: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error(`${context}: ${value} is outside the integer range 0…${maximum}`);
}

function verifyBuffers(state: GameState): void {
  bounded(itemCount(state.inventory), state.inventoryCapacity, 'player basket');
  for (const worker of state.workers) {
    bounded(itemCount(worker.basket), helperCapacity(state), `helper ${worker.id} basket`);
    for (const product of PRODUCTS)
      bounded(
        worker.basket[product.id],
        helperCapacity(state),
        `helper ${worker.id}/${product.id}`,
      );
  }
  for (const customer of state.customers) {
    bounded(itemCount(customer.basket), 2, `customer ${customer.id} basket`);
    for (const product of PRODUCTS)
      bounded(customer.basket[product.id], 2, `customer ${customer.id}/${product.id}`);
  }
  for (const product of PRODUCTS) {
    bounded(state.inventory[product.id], state.inventoryCapacity, `player/${product.id}`);
    bounded(state.shelves[product.id], state.shelfCapacities[product.id], `${product.id} shelf`);
    const owned = plotCount(state, product.id);
    let ready = 0;
    state.farms[product.id].plots.forEach((plot, index) => {
      bounded(plot.ready, GAME_CONFIG.farmCapacity, `${product.id} plot ${index}`);
      if (index < owned) ready += plot.ready;
    });
    if (state.farms[product.id].ready !== ready)
      throw new Error(`${product.id} farm total does not match its individual plots`);
  }
  for (const machine of MACHINES) {
    const buffer = state.machines[machine.id];
    bounded(buffer.input, machine.bufferCapacity, `${machine.id} input`);
    bounded(buffer.output, machine.bufferCapacity, `${machine.id} output`);
    bounded(buffer.processing, 2 * state.upgrades[machine.upgrade], `${machine.id} batch`);
    bounded(
      buffer.output + buffer.processing,
      machine.bufferCapacity,
      `${machine.id} reserved output`,
    );
  }
}

function establishStore(marketing: number, speed: number, capacity: number): GameEngine {
  const engine = new GameEngine();
  engine.economy.earn(1_000_000);
  const levels: Partial<Record<UpgradeId, number>> = {
    expansion: 3,
    corn: 1,
    tomatoPlots: 4,
    eggPlots: 4,
    cornPlots: 4,
    coffeePlots: 4,
    carrotPlots: 7,
    pasteMachine: 4,
    coffeeMachine: 4,
    helpers: 3,
    helperSpeed: speed,
    helperCapacity: capacity,
    cashier: 3,
    customers: marketing,
    accountant: 1,
  };
  for (const [id, count] of Object.entries(levels)) {
    for (let level = 0; level < count; level += 1)
      expect(engine.purchaseUpgrade(id as UpgradeId), `purchase ${id}/${level + 1}`).toBe(true);
  }
  // The player stays clear of every interaction area. No shelf, machine buffer,
  // or worker basket receives injected stock: all sales depend on real helpers.
  engine.state.player = { x: 105, y: 450 };
  expect(engine.state.shelves).toEqual(emptyItems());
  expect(engine.state.unlockedProducts).toEqual(PRODUCTS.map(({ id }) => id));
  engine.drainEvents();
  return engine;
}

describe('expanded store endurance through real production', () => {
  it.each([
    { marketing: 0, speed: 3, capacity: 2, frames: [50] },
    { marketing: 5, speed: 9, capacity: 4, frames: [1000 / 30] },
    { marketing: 10, speed: 7, capacity: 3, frames: [16, 80, 50, 1000 / 30] },
  ])(
    'keeps the entire supply chain selling for 15 minutes with marketing $marketing',
    ({ marketing, speed, capacity, frames }) => {
      let engine = establishStore(marketing, speed, capacity);
      const startingMoney = engine.state.money;
      const startingEarned = engine.state.totalEarned;
      const startingXp = engine.state.xp;
      const purchased = { ...engine.state.upgrades };
      let saved: string | null = null;
      const saves = new SaveSystem({
        read: () => saved,
        write: (value) => {
          saved = value;
        },
        clear: () => {
          saved = null;
        },
      });
      const paidIds = new Set<number>();
      const sold = emptyItems();
      const everStocked = new Set<ProductId>();
      const emptiedAfterStock = new Set<ProductId>();
      const batchObserved = new Set<string>();
      let paidValue = 0;
      let lastQueueOrder = -1;
      let lateSales = 0;
      let lastSaleAt = 0;
      let frame = 0;
      let elapsed = 0;
      let reloaded = false;
      while (elapsed < duration) {
        if (!reloaded && elapsed >= duration / 2) {
          const beforeSave = engine.snapshot();
          expect(saves.save(beforeSave)).toBe(true);
          const restored = saves.load();
          expect(restored.money).toBe(beforeSave.money);
          expect(restored.totalEarned).toBe(beforeSave.totalEarned);
          expect(restored.shelves).toEqual(beforeSave.shelves);
          expect(restored.machines).toEqual(beforeSave.machines);
          expect(restored.workers.map(({ id, basket }) => ({ id, basket }))).toEqual(
            beforeSave.workers.map(({ id, basket }) => ({ id, basket })),
          );
          expect(restored.customers.map(({ id, basket }) => ({ id, basket }))).toEqual(
            beforeSave.customers.map(({ id, basket }) => ({ id, basket })),
          );
          engine = new GameEngine(restored);
          reloaded = true;
        }
        const previous = new Map(
          engine.state.customers.map((customer) => [
            customer.id,
            {
              state: customer.state,
              basket: { ...customer.basket },
              order: customer.queueOrder,
            },
          ]),
        );
        const moneyBefore = engine.state.money;
        const earnedBefore = engine.state.totalEarned;
        const servedBefore = engine.state.totalServed;
        const delta = Math.min(frames[frame++ % frames.length], duration - elapsed);
        engine.update(delta);
        elapsed += delta;
        let frameValue = 0;
        let frameSales = 0;
        for (const customer of engine.state.customers) {
          const before = previous.get(customer.id);
          if (!before || before.state === 'LEAVING' || customer.state !== 'LEAVING') continue;
          if (paidIds.has(customer.id)) throw new Error(`Customer ${customer.id} paid twice`);
          if (before.order === undefined || before.order < lastQueueOrder)
            throw new Error(`Customer ${customer.id} paid outside FIFO order`);
          if (itemCount(customer.basket) !== 0)
            throw new Error(`Paid basket ${customer.id} was not cleared`);
          lastQueueOrder = before.order;
          paidIds.add(customer.id);
          const value = basketValue(before.basket);
          frameValue += value;
          frameSales += 1;
          for (const product of PRODUCTS) sold[product.id] += before.basket[product.id];
          lastSaleAt = elapsed;
          if (elapsed >= duration - 3 * 60_000) lateSales += 1;
        }
        if (
          engine.state.money - moneyBefore !== frameValue ||
          engine.state.totalEarned - earnedBefore !== frameValue ||
          engine.state.totalServed - servedBefore !== frameSales
        )
          throw new Error(`Cash/earnings/sales do not match paid baskets at ${elapsed} ms`);
        paidValue += frameValue;
        verifyBuffers(engine.state);
        for (const product of PRODUCTS) {
          if (engine.state.shelves[product.id] > 0) everStocked.add(product.id);
          else if (everStocked.has(product.id)) emptiedAfterStock.add(product.id);
        }
        for (const machine of MACHINES)
          if (engine.state.machines[machine.id].processing > 0) batchObserved.add(machine.id);
        engine.drainEvents();
      }
      expect(reloaded).toBe(true);
      expect([...everStocked].sort(), 'helpers eventually stock all seven products').toEqual(
        PRODUCTS.map(({ id }) => id).sort(),
      );
      expect(
        emptiedAfterStock.size,
        'customer demand naturally depletes stocked shelves',
      ).toBeGreaterThan(0);
      expect([...batchObserved].sort()).toEqual(MACHINES.map(({ id }) => id).sort());
      for (const product of PRODUCTS)
        expect(sold[product.id], `${product.id} reaches a paid basket`).toBeGreaterThan(0);
      expect(lateSales, 'sales continue during the last three minutes').toBeGreaterThan(8);
      expect(duration - lastSaleAt, 'cashier still receives customers at the end').toBeLessThan(
        60_000,
      );
      expect(engine.state.totalServed).toBe(paidIds.size);
      expect(engine.state.money).toBe(startingMoney + paidValue);
      expect(engine.state.totalEarned).toBe(startingEarned + paidValue);
      expect(engine.state.xp).toBeGreaterThan(startingXp);
      expect(engine.state.upgrades).toEqual(purchased);
      expect(engine.state.totalHarvested).toBeGreaterThan(100);
    },
  );
});
