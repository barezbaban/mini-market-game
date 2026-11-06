import { describe, expect, it, afterEach } from 'vitest';
import { OFFICE } from '../src/game/data/office';
import { CASH_POINTS, uncollectedCash } from '../src/game/data/cashPoints';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { PRODUCTS, emptyItems } from '../src/game/data/products';
import {
  UPGRADES,
  cartCapacity,
  requiredPlayerLevel,
  upgradeCost,
  xpForLevel,
} from '../src/game/data/upgrades';
import { customerShelfSpot } from '../src/game/data/standSpots';
import { GameEngine } from '../src/game/systems/GameEngine';
import { validateSave } from '../src/game/systems/SaveSystem';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import { canStand, clearWalk, walkRoute } from '../src/game/systems/Navigation';
import { queuePosition } from '../src/game/systems/CustomerSystem';
import { setLanguage, t } from '../src/i18n';
import { officeCopy, officePatterns } from '../src/i18n/office';
import type { AccountantPhase } from '../src/game/types';

function office(level = 1) {
  const engine = new GameEngine();
  Object.assign(engine.state.upgrades, {
    accountant: level,
    expansion: 4,
    cashier: 1,
    secondCashier: 1,
    driveThrough: 1,
  });
  applyUpgradeEffects(engine.state);
  return engine;
}
function until(engine: GameEngine, condition: () => boolean) {
  for (let n = 0; n < 12000 && !condition(); n++) engine.office.update(50);
  expect(condition(), JSON.stringify(engine.state.office.accountant)).toBe(true);
}
function conservation(engine: GameEngine, total: number) {
  expect(engine.state.money + uncollectedCash(engine.state)).toBe(total);
  expect(engine.state.totalEarned).toBe(total);
}

describe('accountant office and manual vault collection', () => {
  it('provides real routes through every office doorway to all three cash piles', () => {
    const e = office();
    const spots = [
      OFFICE.entrance,
      OFFICE.marketingSeat,
      OFFICE.managerSeat,
      OFFICE.accountantSeat,
      OFFICE.vaultDeposit,
      OFFICE.vaultCollect,
      ...CASH_POINTS.map((p) => p.position),
    ];
    for (const start of spots) {
      expect(canStand(e.state, start, 'accountant'), JSON.stringify(start)).toBe(true);
      for (const destination of spots) {
        const route = walkRoute(e.state, start, destination, 'accountant');
        expect(route.at(-1), JSON.stringify({ start, destination })).toEqual(destination);
        expect(
          route.every((p, i) => clearWalk(e.state, i ? route[i - 1] : start, p, 'accountant')),
        ).toBe(true);
      }
    }
  });
  it('carries only $100 at level one, does paperwork, then deposits without minting or banking cash', () => {
    const e = office();
    e.economy.deposit('store', 275);
    until(e, () => e.state.office.accountant.carrying > 0);
    expect(e.state.office.accountant.carrying).toBe(100);
    expect(e.state.cashStacks.store.amount).toBe(175);
    expect(e.state.office.vault).toBe(0);
    until(e, () => e.state.office.accountant.phase === 'PAPERWORK');
    expect(e.state.office.accountant).toMatchObject(OFFICE.accountantSeat);
    e.office.update(OFFICE.paperworkMs - 1);
    expect(e.state.office.accountant.phase).toBe('PAPERWORK');
    until(e, () => e.state.office.vault > 0);
    expect(e.state.money).toBe(0);
    expect(e.state.office.vault).toBe(100);
    conservation(e, 275);
    e.state.player = { ...OFFICE.vaultCollect };
    e.cashCollection.update(0);
    expect(e.state.money).toBe(100);
    expect(e.state.office.vault).toBe(0);
    conservation(e, 275);
    until(e, () => e.state.office.vault === 175);
    e.cashCollection.update(0);
    expect(e.state.money).toBe(100); // Waiting on the ring does not auto-bank.
    e.state.player = { ...OFFICE.entrance };
    e.cashCollection.update(0);
    e.state.player = { ...OFFICE.vaultCollect };
    e.cashCollection.update(0);
    expect(e.state.money).toBe(275);
    expect(e.state.office.vault).toBe(0);
    conservation(e, 275);
  });
  it.each<AccountantPhase>([
    'DESK',
    'TO_CASH',
    'PICKUP',
    'TO_DESK',
    'PAPERWORK',
    'TO_VAULT',
    'DEPOSIT',
    'RETURNING',
  ])('saves and resumes %s without losing or duplicating cash', (phase) => {
    let e = office();
    e.economy.deposit('store', 100);
    until(e, () => e.state.office.accountant.phase === phase);
    e = new GameEngine(validateSave(e.snapshot())!);
    conservation(e, 100);
    until(e, () => e.state.office.vault === 100);
    for (let n = 0; n < 100; n++) e.office.update(50);
    expect(e.state.office.accountant.carrying).toBe(0);
    expect(e.state.money).toBe(0);
    e.state.player = { ...OFFICE.vaultCollect };
    e.cashCollection.update(0);
    e = new GameEngine(validateSave(e.snapshot())!);
    e.cashCollection.update(0);
    conservation(e, 100);
    expect(e.state.money).toBe(100);
  });
  it('respects a player pickup before the accountant arrives and fairly visits other registers', () => {
    const e = office();
    e.economy.deposit('store', 250);
    e.office.update(1800);
    e.state.player = { ...GAME_CONFIG.storeCash };
    e.cashCollection.update(0);
    until(e, () => e.state.office.accountant.phase === 'DESK');
    expect(e.state.office.accountant.carrying).toBe(0);
    conservation(e, 250);
    e.economy.deposit('store', 400);
    e.economy.deposit('second', 125);
    e.economy.deposit('drive', 75);
    const visited = new Set<string>();
    for (let n = 0; n < 20000 && e.state.office.vault < 600; n++) {
      e.office.update(50);
      if (e.state.office.accountant.lastTarget) visited.add(e.state.office.accountant.lastTarget);
      conservation(e, 850);
    }
    expect([...visited].sort()).toEqual(['drive', 'second', 'store']);
    expect(e.state.office.vault).toBe(600);
  });
  it('rotates between continuously busy tills instead of starving drive-through cash', () => {
    const e = office();
    const pickups: string[] = [];
    let previous = e.state.office.accountant.phase;
    for (let n = 0; n < 10000 && pickups.length < 3; n++) {
      for (const point of CASH_POINTS) e.state.cashStacks[point.id].amount = 1000;
      e.office.update(50);
      const a = e.state.office.accountant;
      if (previous === 'PICKUP' && a.phase === 'TO_DESK') pickups.push(a.lastTarget!);
      previous = a.phase;
    }
    expect(pickups).toEqual(['store', 'second', 'drive']);
  });

  it('upgrades carrying capacity and keeps an in-flight bag intact when reloaded', () => {
    const e = office(2);
    e.economy.deposit('store', 360);
    until(e, () => e.state.office.accountant.carrying > 0);
    expect(e.state.office.accountant.carrying).toBe(200);
    e.state.upgrades.accountant = 30;
    const restored = new GameEngine(validateSave(e.snapshot())!);
    expect(restored.state.office.accountant.carrying).toBe(200);
    until(restored, () => restored.state.office.vault === 360);
    conservation(restored, 360);
  });
  it('migrates old saves without a vault and conserves cash from a damaged staff state', () => {
    const e = office();
    e.economy.deposit('store', 90);
    const old = JSON.parse(JSON.stringify(e.snapshot()));
    delete old.office;
    old.layoutVersion = 4;
    const restored = validateSave(old)!;
    expect(restored.layoutVersion).toBe(5);
    expect(restored.office.vault).toBe(0);
    expect(uncollectedCash(restored)).toBe(90);
    old.upgrades.accountant = 0;
    old.office = { vault: 20, accountant: { carrying: 50, phase: 'BROKEN', x: NaN, y: Infinity } };
    const repaired = validateSave(old)!;
    expect(repaired.office.vault).toBe(70);
    expect(repaired.office.accountant.carrying).toBe(0);
  });
});

describe('long-term staff, cart and equipment progression', () => {
  it('unlocks and charges for every cart, one at a time, up to exactly 50', () => {
    const e = new GameEngine();
    e.state.money = 1e9;
    while (cartCapacity(e.state) < 50) {
      const required = requiredPlayerLevel(e.state, 'carts'),
        before = cartCapacity(e.state),
        balance = e.state.money;
      if (required > 1) {
        e.state.xp = xpForLevel(required) - 1;
        expect(e.purchaseUpgrade('carts')).toBe(false);
        expect(e.state.money).toBe(balance);
      }
      e.state.xp = xpForLevel(required);
      const cost = upgradeCost(e.state, 'carts');
      expect(e.purchaseUpgrade('carts')).toBe(true);
      expect(cartCapacity(e.state)).toBe(before + 1);
      expect(e.state.money).toBe(balance - cost);
    }
    expect(e.state.xp).toBe(xpForLevel(98));
    expect(e.purchaseUpgrade('carts')).toBe(false);
    expect(cartCapacity(validateSave(e.snapshot())!)).toBe(50);
  });
  it('makes all advanced tiers purchasable at their actual gates with strictly increasing prices', () => {
    const e = new GameEngine();
    e.state.money = 1e12;
    e.state.xp = xpForLevel(100);
    e.state.totalServed = 1000;
    for (let pass = 0; pass < 50; pass++) for (const u of UPGRADES) e.purchaseUpgrade(u.id);
    expect(e.state.workers).toHaveLength(20);
    for (const id of [
      'helpers',
      'accountant',
      'helperCapacity',
      'helperSpeed',
      'cashier',
      'customers',
      'machineSpeed',
      'driveRunner',
      'driveCashier',
    ] as const) {
      const u = UPGRADES.find((u) => u.id === id)!;
      expect(e.state.upgrades[id]).toBe(u.maxLevel);
      const saved = e.state.upgrades[id];
      let previous = 0;
      for (let n = 0; n < u.maxLevel; n++) {
        e.state.upgrades[id] = n;
        const cost = upgradeCost(e.state, id);
        expect(cost).toBeGreaterThan(previous);
        expect(Number.isSafeInteger(cost)).toBe(true);
        previous = cost;
      }
      e.state.upgrades[id] = saved;
    }
    for (const p of PRODUCTS) expect(e.state.shelfCapacities[p.id]).toBe(32);
    for (const m of MACHINES) {
      const machine = e.state.machines[m.id];
      machine.input = 24;
      e.state.career.batchModes[m.id] = 'full';
      e.machines.update(50);
      expect(machine.processing, m.id).toBe(24);
    }
    const saved = validateSave(e.snapshot())!;
    expect(saved.workers).toHaveLength(20);
    expect(saved.upgrades).toEqual(e.state.upgrades);
  });
  it('fits 50 unique checkout positions and shelf waiters without crossing furniture', () => {
    const e = office();
    Object.assign(e.state.upgrades, { carts: 47, cashier: 30, customers: 30 });
    applyUpgradeEffects(e.state);
    const positions = Array.from({ length: 50 }, (_, i) => queuePosition(i));
    expect(new Set(positions.map((p) => `${p.x}:${p.y}`)).size).toBe(50);
    for (const p of positions) expect(canStand(e.state, p), JSON.stringify(p)).toBe(true);
    for (const product of PRODUCTS)
      for (let i = 0; i < 50; i++)
        expect(canStand(e.state, customerShelfSpot(product, i)), `${product.id} ${i}`).toBe(true);
    e.state.customers = positions.map((p, i) => ({
      id: i + 1,
      ...p,
      state: 'QUEUEING',
      queueOrder: i + 1,
      targetProduct: 'tomato',
      targetQuantity: 1,
      basket: { ...emptyItems(), tomato: 1 },
      color: 0x739ebd,
      waitTime: 0,
      path: [],
    }));
    e.state.unlockedProducts = [];
    for (let time = 0; time < 115000; time += 50) e.update(50);
    expect(e.state.totalServed).toBe(50);
  });
});

afterEach(() => setLanguage('en'));
it.each(['ar', 'ckb'] as const)(
  'translates office signs, cash states and every new menu sentence in %s',
  (locale) => {
    setLanguage(locale);
    for (const [source] of officeCopy) expect(t(source), source).not.toMatch(/[a-z]{2}/i);
    for (const [source] of officePatterns)
      expect(t(source.replace('{0}', '125')), source).not.toMatch(/[a-z]{2}/i);
  },
);
