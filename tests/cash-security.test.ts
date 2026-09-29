import { describe, expect, it } from 'vitest';
import { CASH_POINTS } from '../src/game/data/cashPoints';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { emptyItems } from '../src/game/data/products';
import { xpForLevel } from '../src/game/data/upgrades';
import { queuePosition } from '../src/game/systems/CustomerSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { validateSave } from '../src/game/systems/SaveSystem';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import type { CustomerData, ThiefData } from '../src/game/types';
import { collectTakings } from './helpers/collectCash';

const buyer = (id = 1): CustomerData => ({
  id,
  ...queuePosition(id - 1),
  state: 'QUEUEING',
  targetProduct: 'tomato',
  targetQuantity: 1,
  basket: { ...emptyItems(), tomato: 1 },
  color: 0x739ebd,
  waitTime: 0,
  path: [],
  queueOrder: id,
});
function advance(engine: GameEngine, duration: number): void {
  for (let time = 0; time < duration; time += 50) engine.update(50);
}
function securityAdvance(engine: GameEngine, duration: number): void {
  for (let time = 0; time < duration; time += 50) engine.security.update(50);
}
function fleeing(engine: GameEngine, amount = 100): ThiefData {
  engine.state.security.thief = {
    x: 600,
    y: 450,
    phase: 'FLEEING',
    target: 'store',
    stolen: amount,
    elapsed: 0,
    path: [
      { x: 1210, y: 900 },
      { x: -250, y: 900 },
    ],
  };
  return engine.state.security.thief;
}

describe('player-collected cash', () => {
  it('stacks sales and XP but makes no cash spendable until the player approaches', () => {
    const engine = new GameEngine();
    engine.state.player = { ...GAME_CONFIG.cashierSpot };
    engine.state.customers = [buyer()];
    advance(engine, 2000);
    expect(engine.state.money).toBe(0);
    expect(engine.state.cashStacks.store.amount).toBe(5);
    expect(engine.state.totalEarned).toBe(5);
    expect(engine.state.xp).toBe(7);
    expect(engine.economy.spend(1)).toBe(false);
    engine.state.player = { ...GAME_CONFIG.storeCash };
    engine.cashCollection.update(50);
    expect(engine.state.money).toBe(5);
    expect(engine.state.totalEarned).toBe(5);
    expect(engine.state.cashStacks.store.amount).toBe(0);
  });

  it('cannot collect new payments by camping beside a pile, even across reloads', () => {
    let engine = new GameEngine();
    engine.state.player = { ...GAME_CONFIG.storeCash };
    engine.cashCollection.update(50);
    engine.economy.deposit('store', 50);
    engine.cashCollection.update(1000);
    expect(engine.state.money).toBe(0);
    engine = new GameEngine(validateSave(engine.snapshot())!);
    engine.cashCollection.update(1000);
    expect(engine.state.money).toBe(0);
    engine.state.player.x += GAME_CONFIG.cashCollectRadius + 26;
    engine.cashCollection.update(0);
    engine.state.player = { ...GAME_CONFIG.storeCash };
    engine.cashCollection.update(0);
    expect(engine.state.money).toBe(50);
    engine.cashCollection.update(1000);
    expect(engine.state.money).toBe(50);
  });

  it('stops before a sale would overflow, without taking goods or granting XP', () => {
    const engine = new GameEngine();
    engine.state.cashier = true;
    engine.state.customers = [buyer()];
    engine.economy.deposit('store', 248);
    advance(engine, 5000);
    expect(engine.state.cashStacks.store).toMatchObject({ amount: 248, blocked: true });
    expect(engine.state.customers[0].basket.tomato).toBe(1);
    expect(engine.state.xp).toBe(0);
    expect(engine.state.totalServed).toBe(0);
    engine.state.player = { ...GAME_CONFIG.storeCash };
    advance(engine, 2000);
    expect(engine.state.money).toBe(248);
    expect(engine.state.cashStacks.store.amount).toBe(5);
    expect(engine.state.totalServed).toBe(1);
  });

  it('handles three independent piles and rejects invalid deposits', () => {
    const engine = new GameEngine();
    expect(engine.economy.deposit('second', 20)).toBe(false);
    expect(engine.economy.deposit('drive', 20)).toBe(false);
    Object.assign(engine.state.upgrades, { secondCashier: 1, cashier: 1, driveThrough: 1 });
    for (const { id } of CASH_POINTS) {
      for (const invalid of [0, -1, 1.1, NaN, Infinity, 251])
        expect(engine.economy.deposit(id, invalid)).toBe(false);
      expect(engine.economy.deposit(id, 250)).toBe(true);
      expect(engine.economy.deposit(id, 1)).toBe(false);
    }
    const restored = new GameEngine(validateSave(engine.snapshot())!);
    for (const { id, position } of CASH_POINTS) {
      expect(restored.state.cashStacks[id].amount).toBe(250);
      restored.state.player = { ...position };
      restored.cashCollection.update(0);
      expect(restored.state.cashStacks[id].amount).toBe(0);
    }
    expect(restored.state.money).toBe(750);
    expect(restored.state.totalEarned).toBe(750);
  });

  it('stops the drive-through at capacity and resumes after collection', () => {
    const engine = new GameEngine();
    Object.assign(engine.state.upgrades, { driveThrough: 1, driveCashier: 1 });
    engine.driveThrough.update(3000);
    const order = engine.state.driveThroughOrders[0];
    order.x = GAME_CONFIG.driveThroughVehicleSpot.x;
    order.state = 'READY_TO_PAY';
    order.delivered = { ...order.requested };
    engine.economy.deposit('drive', 250);
    advance(engine, 3000);
    expect(engine.state.driveThroughServed).toBe(0);
    expect(engine.state.cashStacks.drive.blocked).toBe(true);
    expect(order.state).toBe('READY_TO_PAY');
    engine.state.player = { ...GAME_CONFIG.driveCash };
    advance(engine, 3000);
    expect(engine.state.money).toBe(250);
    expect(engine.state.driveThroughServed).toBe(1);
    expect(engine.state.cashStacks.drive.amount).toBeGreaterThan(0);
  });

  it('adds a second staffed checkout only at level 20 and pays each shopper once', () => {
    const engine = new GameEngine();
    engine.state.money = 10000;
    engine.state.xp = xpForLevel(19);
    expect(engine.purchaseUpgrade('secondCashier')).toBe(false);
    engine.state.xp = xpForLevel(20);
    expect(engine.purchaseUpgrade('secondCashier')).toBe(false);
    expect(engine.purchaseUpgrade('cashier')).toBe(true);
    expect(engine.purchaseUpgrade('secondCashier')).toBe(true);
    expect(engine.purchaseUpgrade('secondCashier')).toBe(false);
    engine.state.customers = [buyer(), buyer(2)];
    const money = engine.state.money;
    advance(engine, 10000);
    expect(engine.state.totalServed).toBe(2);
    expect(engine.state.cashStacks.store.amount).toBe(5);
    expect(engine.state.cashStacks.second.amount).toBe(5);
    expect(engine.state.money).toBe(money);
    expect(engine.state.totalEarned).toBe(10);
  });

  it('keeps the second register selling when the first is full', () => {
    const engine = new GameEngine();
    Object.assign(engine.state.upgrades, { cashier: 1, secondCashier: 1 });
    applyUpgradeEffects(engine.state);
    engine.state.customers = [buyer()];
    engine.economy.deposit('store', 250);
    advance(engine, 10000);
    expect(engine.state.cashStacks.store.amount).toBe(250);
    expect(engine.state.cashStacks.second.amount).toBe(5);
    expect(engine.state.totalServed).toBe(1);
  });

  it('preserves a partially paid second-register customer across reload', () => {
    let engine = new GameEngine();
    Object.assign(engine.state.upgrades, { cashier: 1, secondCashier: 1 });
    applyUpgradeEffects(engine.state);
    engine.state.customers = [
      { ...buyer(), ...GAME_CONFIG.secondQueueStart, state: 'SECOND_PAYING' },
    ];
    engine.state.secondCheckoutProgress = 500;
    engine = new GameEngine(validateSave(engine.snapshot())!);
    expect(engine.state.customers[0].state).toBe('SECOND_PAYING');
    expect(engine.state.secondCheckoutProgress).toBe(500);
    advance(engine, 500);
    expect(engine.state.totalServed).toBe(1);
    expect(engine.state.cashStacks.second.amount).toBe(5);
    advance(engine, 3000);
    expect(engine.state.totalEarned).toBe(5);
  });

  it('sustains a busy two-checkout queue with collection rounds and a mid-session reload', () => {
    let engine = new GameEngine();
    Object.assign(engine.state.upgrades, { cashier: 3, secondCashier: 1, carts: 12, customers: 8 });
    applyUpgradeEffects(engine.state);
    const soldAt = new Set<string>();
    for (let time = 0; time < 240000; time += 50) {
      engine.state.shelves.tomato = 12;
      engine.state.shelves.egg = 12;
      engine.update(50);
      for (const id of ['store', 'second'] as const)
        if (engine.state.cashStacks[id].amount) soldAt.add(id);
      if (time % 10000 === 0) collectTakings(engine);
      if (time === 120000) engine = new GameEngine(validateSave(engine.snapshot())!);
    }
    collectTakings(engine);
    expect([...soldAt].sort()).toEqual(['second', 'store']);
    expect(engine.state.totalServed).toBeGreaterThan(50);
    expect(engine.state.money).toBe(engine.state.totalEarned);
    expect(engine.state.security.lost).toBe(0);
  });
});

describe('cash security and net rescue', () => {
  it('waits three minutes, approaches visibly, then steals after a six-second warning', () => {
    const engine = new GameEngine();
    engine.state.player = { x: 200, y: 450 };
    engine.economy.deposit('store', 120);
    engine.cashCollection.update(GAME_CONFIG.thiefDelay - 1);
    engine.security.update(1);
    expect(engine.state.security.thief).toBeNull();
    engine.cashCollection.update(1);
    engine.security.update(1);
    expect(engine.state.security.thief).toMatchObject({
      phase: 'APPROACHING',
      ...GAME_CONFIG.customerSpawn,
    });
    for (
      let count = 0;
      count < 400 && engine.state.security.thief?.phase === 'APPROACHING';
      count++
    )
      engine.security.update(50);
    expect(engine.state.security.thief?.phase).toBe('STEALING');
    securityAdvance(engine, GAME_CONFIG.thiefStealTime - 50);
    expect(engine.state.cashStacks.store.amount).toBe(120);
    engine.security.update(50);
    expect(engine.state.security.thief).toMatchObject({ phase: 'FLEEING', stolen: 120 });
    expect(engine.state.cashStacks.store.amount).toBe(0);
    expect(engine.state.money).toBe(0);
    expect(engine.state.totalEarned).toBe(120);
  });

  it('never spawns at empty piles or while the player is tending the cash area', () => {
    const engine = new GameEngine();
    engine.cashCollection.update(GAME_CONFIG.thiefDelay * 2);
    engine.security.update(50);
    expect(engine.state.security.thief).toBeNull();
    engine.economy.deposit('store', 100);
    engine.state.player = { x: GAME_CONFIG.storeCash.x - 150, y: GAME_CONFIG.storeCash.y };
    engine.cashCollection.update(GAME_CONFIG.thiefDelay * 2);
    engine.security.update(50);
    expect(engine.state.security.thief).toBeNull();
  });

  it('can target the drive-through and abandon an emptied cash pile', () => {
    const engine = new GameEngine();
    engine.state.upgrades.driveThrough = 1;
    engine.economy.deposit('drive', 100);
    engine.cashCollection.update(GAME_CONFIG.thiefDelay);
    engine.security.update(50);
    expect(engine.state.security.thief?.target).toBe('drive');
    engine.state.player = { ...GAME_CONFIG.driveCash };
    engine.cashCollection.update(0);
    engine.security.update(50);
    expect(engine.state.money).toBe(100);
    expect(engine.state.security.thief).toMatchObject({ phase: 'FLEEING', stolen: 0 });
  });

  it('recovers stolen money once after reload, guards the thief, and releases staff after police arrive', () => {
    let engine = new GameEngine();
    engine.state.upgrades.helpers = 1;
    applyUpgradeEffects(engine.state);
    const worker = engine.state.workers[0];
    worker.basket.tomato = 2;
    fleeing(engine, 100);
    engine.state.totalEarned = 100;
    engine = new GameEngine(validateSave(engine.snapshot())!);
    expect(engine.state.security.thief?.stolen).toBe(100);
    engine.state.player = { x: 650, y: 450 };
    engine.security.update(50);
    expect(engine.state.security.thief?.phase).toBe('CAUGHT');
    expect(engine.state.money).toBe(100);
    expect(engine.state.security.guardId).toBe(worker.id);
    engine = new GameEngine(validateSave(engine.snapshot())!);
    const guard = engine.state.workers[0];
    const before = { ...guard.basket };
    engine.workers.update(1000);
    expect(guard.basket).toEqual(before);
    securityAdvance(engine, 15000);
    expect(engine.state.security.thief?.phase).toBe('ESCORTED');
    expect(engine.state.security.guardId).toBeNull();
    expect(guard.basket).toEqual(before);
    securityAdvance(engine, 15000);
    expect(engine.state.security.thief).toBeNull();
    expect(engine.state.security.police).toBeNull();
    expect(engine.state.money).toBe(100);
    expect(engine.state.totalEarned).toBe(100);
    expect(engine.state.security.recovered).toBe(100);
  });

  it('holds a captured thief safely without staff and does not catch outside the visible net radius', () => {
    const engine = new GameEngine();
    const thief = fleeing(engine, 50);
    engine.state.player = { x: thief.x, y: thief.y + GAME_CONFIG.netRadius + 1 };
    engine.security.update(1);
    expect(thief.phase).toBe('FLEEING');
    engine.state.player = { x: thief.x, y: thief.y + GAME_CONFIG.netRadius - 1 };
    engine.security.update(1);
    expect(thief.phase).toBe('CAUGHT');
    expect(engine.state.security.guardId).toBeNull();
    securityAdvance(engine, 30000);
    expect(engine.state.security.thief).toBeNull();
    expect(engine.state.money).toBe(50);
  });

  it('prevents net captures through solid shelves', () => {
    const engine = new GameEngine();
    const thief = fleeing(engine, 50);
    Object.assign(thief, { x: 265, y: 250, path: [{ x: 265, y: 450 }] });
    engine.state.player = { x: 265, y: 310 };
    engine.security.update(1);
    expect(thief.phase).toBe('FLEEING');
    expect(engine.state.money).toBe(0);
  });

  it('does not bank stolen cash when a thief runs past an idle player', () => {
    const engine = new GameEngine();
    engine.state.player = { x: 600, y: 450 };
    securityAdvance(engine, 1000);
    const thief = fleeing(engine, 100);
    thief.x = 620;
    engine.security.update(50);
    expect(thief.phase).toBe('FLEEING');
    expect(engine.state.money).toBe(0);
    engine.state.player.x += 5;
    engine.security.update(50);
    expect(thief.phase).toBe('CAUGHT');
    expect(engine.state.money).toBe(100);
  });

  it('records escaped cash as lost without granting player money or duplicate revenue', () => {
    const engine = new GameEngine();
    engine.state.player = { x: 200, y: 200 };
    const thief = fleeing(engine, 75);
    thief.path = [{ x: -250, y: 900 }];
    engine.state.totalEarned = 75;
    securityAdvance(engine, 10000);
    expect(engine.state.security.lost).toBe(75);
    expect(engine.state.security.thief).toBeNull();
    expect(engine.state.money).toBe(0);
    expect(engine.state.totalEarned).toBe(75);
    expect(engine.state.security.cooldownMs).toBeGreaterThan(0);
  });

  it('migrates older saves without changing their wallet or granting new cash', () => {
    const engine = new GameEngine();
    engine.state.money = 321;
    const raw = JSON.parse(JSON.stringify(engine.state));
    delete raw.cashStacks;
    delete raw.security;
    delete raw.sprintEnergy;
    const restored = validateSave(raw)!;
    expect(restored.money).toBe(321);
    expect(restored.cashStacks.store.amount).toBe(0);
    expect(restored.security.thief).toBeNull();
    expect(restored.sprintEnergy).toBe(1);
  });
});

describe('sprinting', () => {
  it('runs faster, exhausts stamina, and requires recovery and release before another burst', () => {
    const walking = new GameEngine(),
      sprinting = new GameEngine();
    walking.state.player = { x: 300, y: 450 };
    sprinting.state.player = { ...walking.state.player };
    walking.update(50, { x: 1, y: 0 });
    sprinting.update(50, { x: 1, y: 0, sprint: true });
    expect(sprinting.state.player.x - 300).toBeCloseTo(
      (walking.state.player.x - 300) * GAME_CONFIG.sprintMultiplier,
    );
    for (let frame = 0; frame < 85; frame++) sprinting.update(50, { x: 1, y: 0, sprint: true });
    expect(sprinting.state.sprintExhausted).toBe(true);
    for (let frame = 0; frame < 130; frame++) sprinting.update(50, { x: -1, y: 0, sprint: true });
    expect(sprinting.state.sprinting).toBe(false);
    sprinting.update(50);
    sprinting.update(50, { x: 1, y: 0, sprint: true });
    expect(sprinting.state.sprinting).toBe(true);
    expect(sprinting.state.sprintEnergy).toBeGreaterThanOrEqual(0);
    expect(sprinting.state.sprintEnergy).toBeLessThanOrEqual(1);
  });
});
