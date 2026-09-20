import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { PRODUCTS, emptyItems } from '../src/game/data/products';
import { isInQueue, orderedQueue } from '../src/game/systems/CustomerSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { SaveSystem } from '../src/game/systems/SaveSystem';
import type { ItemCounts } from '../src/game/types';
import stuckQueue from './fixtures/stuck-queue.json';

// Preserve the recorded three-product schedules; newer wings stay locked here.
const QUEUE_PRODUCTS = PRODUCTS.filter((product) => ['tomato', 'egg', 'corn'].includes(product.id));

const valueOf = (items: ItemCounts): number =>
  PRODUCTS.reduce((total, product) => total + items[product.id] * product.sellingPrice, 0);

const unsoldValue = (engine: GameEngine): number =>
  valueOf(engine.state.shelves) +
  valueOf(engine.state.inventory) +
  engine.state.customers.reduce((total, customer) => total + valueOf(customer.basket), 0);

/** Observe movements and actual checkout transfers without changing simulation behavior. */
function trackSimulation(engine: GameEngine) {
  let closest = Infinity;
  let movementExcess = 0;
  let paidValue = 0;
  let correctPayments = true;
  const paidIds: number[] = [];
  const paymentOrders: number[] = [];
  return {
    resume(restored: GameEngine): void {
      engine = restored;
    },
    step(deltaMs: number): void {
      const before = new Map(
        engine.state.customers.map((customer) => [
          customer.id,
          {
            x: customer.x,
            y: customer.y,
            state: customer.state,
            value: valueOf(customer.basket),
            order: customer.queueOrder,
          },
        ]),
      );
      const money = engine.state.money;
      const earned = engine.state.totalEarned;
      const served = engine.state.totalServed;
      engine.update(deltaMs);
      let frameValue = 0;
      let frameSales = 0;
      for (const customer of engine.state.customers) {
        const previous = before.get(customer.id);
        if (!previous) continue;
        const moved = Math.hypot(customer.x - previous.x, customer.y - previous.y);
        movementExcess = Math.max(
          movementExcess,
          moved - (GAME_CONFIG.customerSpeed * deltaMs) / 1000,
        );
        if (previous.state !== 'LEAVING' && customer.state === 'LEAVING') {
          frameSales += 1;
          frameValue += previous.value;
          paidIds.push(customer.id);
          paymentOrders.push(previous.order!);
          correctPayments &&= valueOf(customer.basket) === 0;
        }
      }
      correctPayments &&=
        engine.state.money - money === frameValue &&
        engine.state.totalEarned - earned === frameValue &&
        engine.state.totalServed - served === frameSales;
      paidValue += frameValue;
      const queue = engine.state.customers.filter(isInQueue);
      for (let i = 0; i < queue.length; i++)
        for (let j = i + 1; j < queue.length; j++)
          closest = Math.min(closest, Math.hypot(queue[i].x - queue[j].x, queue[i].y - queue[j].y));
    },
    verify(): void {
      expect(closest, 'queued shoppers retain their collision spacing').toBeGreaterThanOrEqual(
        26 - 1e-6,
      );
      expect(movementExcess, 'route repairs cannot teleport customers').toBeLessThan(1e-6);
      expect(correctPayments, 'each completed sale pays the exact basket value once').toBe(true);
      expect(new Set(paidIds).size, 'each customer pays once').toBe(paidIds.length);
      expect(paymentOrders, 'checkout follows arrival order').toEqual(
        [...paymentOrders].sort((a, b) => a - b),
      );
    },
    get paidIds(): number[] {
      return paidIds;
    },
    get paidValue(): number {
      return paidValue;
    },
  };
}

describe('checkout queue routing regressions', () => {
  it.each([
    { frameMs: 16, marketing: 0 },
    { frameMs: 33, marketing: 5 },
    { frameMs: 50, marketing: 10 },
  ])(
    'serves all seven expanded aisles with marketing $marketing and $frameMs ms frames across reload',
    ({ frameMs, marketing }) => {
      let engine = new GameEngine();
      engine.economy.earn(100000);
      for (const id of ['expansion', 'corn', 'pasteMachine', 'coffeeMachine', 'cashier'] as const)
        while (engine.purchaseUpgrade(id)) {
          /* exercise actual prerequisites and caps */
        }
      for (let level = 0; level < marketing; level++) engine.purchaseUpgrade('customers');
      const startingMoney = engine.state.money;
      engine.state.player = { x: 105, y: 920 };
      const observation = trackSimulation(engine);
      let supplied = 0;
      let lastSale = 0;
      let reloaded = false;
      for (let time = 0; time < 300000; time += frameMs) {
        for (const product of PRODUCTS) {
          const added = 12 - engine.state.shelves[product.id];
          engine.state.shelves[product.id] += added;
          supplied += added * product.sellingPrice;
        }
        if (!reloaded && time >= 150000) {
          let serialized: string | null = null;
          const save = new SaveSystem({
            read: () => serialized,
            write: (data) => {
              serialized = data;
            },
            clear: () => {},
          });
          save.save(engine.snapshot());
          engine = new GameEngine(save.load());
          observation.resume(engine);
          reloaded = true;
        }
        const before = engine.state.totalServed;
        observation.step(frameMs);
        if (engine.state.totalServed > before) lastSale = time;
      }
      expect(engine.state.totalServed).toBeGreaterThan(30);
      expect(300000 - lastSale).toBeLessThan(30000);
      observation.verify();
      expect(engine.state.money).toBe(startingMoney + observation.paidValue);
      expect(observation.paidValue + unsoldValue(engine)).toBe(supplied);
    },
  );

  it.each([16, 1000 / 60, 20, 1000 / 30, 50])(
    'keeps serving an upgraded, stocked market at %f ms per frame',
    (frameMs) => {
      const engine = new GameEngine();
      engine.economy.earn(1000);
      engine.purchaseUpgrade('corn');
      engine.purchaseUpgrade('customers');
      const observation = trackSimulation(engine);
      let suppliedValue = 0;
      let lastSale = 0;
      let salesAtNinetySeconds = 0;
      let time = 0;
      while (time < 150_000) {
        if (time >= 30_000 && !engine.state.cashier) engine.purchaseUpgrade('cashier');
        // Unlimited test stock isolates routing from the player's production schedule.
        for (const product of QUEUE_PRODUCTS) {
          const added = engine.state.shelfCapacities[product.id] - engine.state.shelves[product.id];
          suppliedValue += added * product.sellingPrice;
          engine.state.shelves[product.id] += added;
        }
        const beforeSales = engine.state.totalServed;
        const delta = Math.min(frameMs, 150_000 - time);
        observation.step(delta);
        time += delta;
        if (engine.state.totalServed > beforeSales) lastSale = time;
        if (time <= 90_000) salesAtNinetySeconds = engine.state.totalServed;
      }
      expect(
        engine.state.totalServed,
        'sales continue after the original six-sale stall',
      ).toBeGreaterThan(25);
      expect(
        engine.state.totalServed - salesAtNinetySeconds,
        'later shoppers keep reaching checkout',
      ).toBeGreaterThan(10);
      expect(time - lastSale, 'the cashier never ends in a permanent queue stall').toBeLessThan(
        15_000,
      );
      observation.verify();
      expect(engine.state.totalEarned).toBe(1000 + observation.paidValue);
      expect(engine.state.money).toBe(1000 - 150 - 90 - 300 + observation.paidValue);
      expect(observation.paidValue + unsoldValue(engine)).toBe(suppliedValue);
    },
  );

  it.each([
    { hireAt: 0, episodic: false },
    { hireAt: 15_000, episodic: true },
    { hireAt: 45_000, episodic: false },
    { hireAt: 90_000, episodic: true },
  ])(
    'handles variable frames, a mid-queue reload, and hiring at $hireAt ms (episodic stock: $episodic)',
    ({ hireAt, episodic }) => {
      let engine = new GameEngine();
      engine.economy.earn(1000);
      engine.purchaseUpgrade('corn');
      engine.purchaseUpgrade('customers');
      const observation = trackSimulation(engine);
      const framePattern = [8, 16, 33, 80];
      const end = hireAt + 150_000;
      let suppliedValue = 0;
      let previousDelivery = -1;
      let salesBeforeFinalThirtySeconds = 0;
      let lastSale = 0;
      let reloaded = false;
      let time = 0;
      let frame = 0;
      while (time < end) {
        if (time >= hireAt && !engine.state.cashier) engine.purchaseUpgrade('cashier');
        const delivery = Math.floor(time / 10_000);
        for (const [index, product] of QUEUE_PRODUCTS.entries()) {
          // Start fully stocked. Episodic cases then rotate the replenished shelf,
          // before a well-stocked final stretch establishes continued throughput.
          const refill =
            time === 0 ||
            !episodic ||
            time >= end - 45_000 ||
            (delivery !== previousDelivery && index === delivery % QUEUE_PRODUCTS.length);
          if (!refill) continue;
          const added = engine.state.shelfCapacities[product.id] - engine.state.shelves[product.id];
          suppliedValue += added * product.sellingPrice;
          engine.state.shelves[product.id] += added;
        }
        previousDelivery = delivery;
        if (!reloaded && time >= hireAt + 20_000 && orderedQueue(engine.state).length >= 2) {
          const beforeReload = engine.snapshot();
          let serialized: string | null = null;
          const saves = new SaveSystem({
            read: () => serialized,
            write: (value) => {
              serialized = value;
            },
            clear: () => {
              serialized = null;
            },
          });
          expect(saves.save(beforeReload)).toBe(true);
          engine = new GameEngine(saves.load());
          observation.resume(engine);
          expect(engine.state.money).toBe(beforeReload.money);
          expect(engine.state.totalEarned).toBe(beforeReload.totalEarned);
          expect(engine.state.totalServed).toBe(beforeReload.totalServed);
          expect(engine.state.upgrades).toEqual(beforeReload.upgrades);
          expect(
            engine.state.customers.map(({ id, x, y, basket }) => ({ id, x, y, basket })),
          ).toEqual(beforeReload.customers.map(({ id, x, y, basket }) => ({ id, x, y, basket })));
          reloaded = true;
        }
        const beforeSales = engine.state.totalServed;
        const delta = Math.min(framePattern[frame++ % framePattern.length], end - time);
        observation.step(delta);
        time += delta;
        if (engine.state.totalServed > beforeSales) lastSale = time;
        if (time <= end - 30_000) salesBeforeFinalThirtySeconds = engine.state.totalServed;
      }
      expect(reloaded, 'the save/load fixture contains at least two queued customers').toBe(true);
      expect(
        engine.state.totalServed,
        'hiring at different queue stages preserves throughput',
      ).toBeGreaterThan(25);
      expect(
        engine.state.totalServed - salesBeforeFinalThirtySeconds,
        'service continues in the final thirty seconds',
      ).toBeGreaterThan(4);
      expect(time - lastSale, 'a stocked cashier does not finish stalled').toBeLessThan(15_000);
      observation.verify();
      expect(engine.state.totalEarned).toBe(1000 + observation.paidValue);
      expect(engine.state.money).toBe(1000 - 150 - 90 - 300 + observation.paidValue);
      expect(observation.paidValue + unsoldValue(engine)).toBe(suppliedValue);
    },
  );

  it.each([2, 8])(
    'keeps checkout moving for recorded intermittent-stock schedule seed %i',
    (seed) => {
      // These two deterministic schedules caught later yielding deadlocks after
      // the original diagonal-route fix. Keep the random-call order reproducible.
      let randomState = Math.imul(seed, 0x9e3779b9) >>> 0;
      const random = (): number => {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
      };
      const hireAt = Math.floor(random() * 120_000);
      const engine = new GameEngine();
      engine.economy.earn(1000);
      engine.purchaseUpgrade('corn');
      engine.purchaseUpgrade('customers');
      const observation = trackSimulation(engine);
      const frames = [8, 12, 16, 1000 / 60, 20, 33, 50, 80];
      let nextStock = 0;
      let suppliedValue = 0;
      let stalled = 0;
      let longestStall = 0;
      let time = 0;
      while (time < 300_000) {
        if (time >= hireAt && !engine.state.cashier) engine.purchaseUpgrade('cashier');
        if (time >= nextStock) {
          for (const product of QUEUE_PRODUCTS) {
            const added = Math.min(
              engine.state.shelfCapacities[product.id] - engine.state.shelves[product.id],
              1 + Math.floor(random() * 8),
            );
            engine.state.shelves[product.id] += added;
            suppliedValue += added * product.sellingPrice;
          }
          nextStock = time + 3000 + random() * 15_000;
        }
        const beforeSales = engine.state.totalServed;
        const delta = Math.min(frames[Math.floor(random() * frames.length)], 300_000 - time);
        observation.step(delta);
        time += delta;
        stalled =
          engine.state.cashier &&
          engine.state.totalServed === beforeSales &&
          engine.state.customers.some(
            (customer) => isInQueue(customer) && valueOf(customer.basket) > 0,
          )
            ? stalled + delta
            : 0;
        longestStall = Math.max(longestStall, stalled);
      }
      expect(
        longestStall,
        'a staffed checkout with unpaid queued shoppers keeps making sales',
      ).toBeLessThan(30_000);
      observation.verify();
      expect(engine.state.totalEarned).toBe(1000 + observation.paidValue);
      expect(engine.state.money).toBe(1000 - 150 - 90 - 300 + observation.paidValue);
      expect(observation.paidValue + unsoldValue(engine)).toBe(suppliedValue);
    },
  );

  it('recovers a captured jammed save without losing purchases, stock, cash, or FIFO order', () => {
    // Captured from the original bug: 16 ms frames, corn + customer upgrades,
    // replenished shelves, cashier hired at 30 s, then saved at 90 s after six sales.
    // Customer 7 is diagonally blocked by customer 8 while the remaining queue waits.
    let saved: string | null = JSON.stringify(stuckQueue);
    const saves = new SaveSystem({
      read: () => saved,
      write: (value) => {
        saved = value;
      },
      clear: () => {
        saved = null;
      },
    });
    const engine = new GameEngine(saves.load());
    expect(engine.state.cashier).toBe(true);
    expect(engine.state.money).toBe(stuckQueue.money);
    expect(engine.state.totalEarned).toBe(stuckQueue.totalEarned);
    expect(engine.state.upgrades).toMatchObject(stuckQueue.upgrades);
    expect(engine.state.inventory).toEqual({ ...emptyItems(), ...stuckQueue.inventory });
    expect(engine.state.shelves).toEqual({ ...emptyItems(), ...stuckQueue.shelves });
    expect(engine.state.customers.map(({ id, basket }) => ({ id, basket }))).toEqual(
      stuckQueue.customers.map(({ id, basket }) => ({
        id,
        basket: { ...emptyItems(), ...basket },
      })),
    );
    const originalQueue = orderedQueue(engine.state);
    const expectedIds = originalQueue.map((customer) => customer.id);
    const originalStockValue = unsoldValue(engine);
    const observation = trackSimulation(engine);
    for (let time = 0; time < 60_000; time += 16) observation.step(16);
    expect(
      observation.paidIds.slice(0, expectedIds.length),
      'all saved shoppers finish in order',
    ).toEqual(expectedIds);
    observation.verify();
    expect(engine.state.money).toBe(stuckQueue.money + observation.paidValue);
    expect(engine.state.totalEarned).toBe(stuckQueue.totalEarned + observation.paidValue);
    expect(engine.state.totalServed).toBe(stuckQueue.totalServed + observation.paidIds.length);
    expect(observation.paidValue + unsoldValue(engine)).toBe(originalStockValue);
    expect(saves.save(engine.snapshot())).toBe(true);
    const restored = saves.load();
    expect(restored.money).toBe(engine.state.money);
    expect(restored.upgrades).toMatchObject(stuckQueue.upgrades);
    expect(restored.totalServed).toBe(engine.state.totalServed);
  });
});
