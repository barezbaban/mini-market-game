import { describe, expect, it } from 'vitest';
import { BUSINESS_MILESTONES, currentChapter } from '../src/game/data/career';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { emptyItems } from '../src/game/data/products';
import { xpForLevel, checkoutDuration } from '../src/game/data/upgrades';
import { contractProgress } from '../src/game/systems/CareerSystem';
import { GameEngine } from '../src/game/systems/GameEngine';
import { awardSaleXp } from '../src/game/systems/ProgressionSystem';
import { SaveSystem, createInitialState, validateSave } from '../src/game/systems/SaveSystem';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import type { CustomerData, SaveRepository } from '../src/game/types';

function customer(overrides: Partial<CustomerData> = {}): CustomerData {
  return {
    id: 1,
    ...GAME_CONFIG.queueStart,
    state: 'QUEUEING',
    targetProduct: 'tomato',
    targetQuantity: 1,
    basket: { ...emptyItems(), tomato: 1 },
    color: 0xffffff,
    waitTime: 0,
    queueOrder: 1,
    path: [],
    ...overrides,
  };
}
function production(): GameEngine {
  const state = createInitialState();
  Object.assign(state.upgrades, { expansion: 1, pasteMachine: 2, helpers: 1 });
  applyUpgradeEffects(state);
  return new GameEngine(state);
}
class MemorySave implements SaveRepository {
  value: string | null = null;
  previous: string | null = null;
  recovery: string | null = null;
  read() {
    return this.value;
  }
  write(value: string) {
    this.value = value;
  }
  clear() {
    this.value = null;
  }
  backup(value: string) {
    this.previous = value;
  }
  readBackup() {
    return this.previous;
  }
  backupRecovery(value: string) {
    this.recovery = value;
  }
  readRecovery() {
    return this.recovery;
  }
}

describe('business chapters and meaningful progression', () => {
  it('money cannot skip levels or paid-order requirements, but old purchases stay owned', () => {
    const engine = new GameEngine();
    engine.state.money = 100000;
    expect(engine.purchaseUpgrade('expansion')).toBe(false);
    engine.state.xp = xpForLevel(3);
    expect(engine.purchaseUpgrade('expansion')).toBe(false);
    engine.state.totalServed = 20;
    expect(engine.purchaseUpgrade('expansion')).toBe(true);
    expect(currentChapter(engine.state)).toBe(2);
    expect(engine.purchaseUpgrade('expansion')).toBe(false);
    const old = createInitialState();
    Object.assign(old.upgrades, { expansion: 4, cowPlots: 4, helpers: 3 });
    const migrated = validateSave(old)!;
    expect(migrated.upgrades).toMatchObject({ expansion: 4, cowPlots: 4, helpers: 3 });
    expect(migrated.workers).toHaveLength(3);
    expect(migrated.career.accountantCheckpoint).toBe(0);
  });
  it('milestone rewards are optional, manual and exactly once across saves', () => {
    let engine = new GameEngine();
    expect(engine.career.claimMilestone('first-sale')).toBe(false);
    engine.state.totalServed = 1;
    expect(engine.state.money).toBe(0);
    expect(engine.career.claimMilestone('first-sale')).toBe(true);
    expect(engine.state.money).toBe(20);
    expect(engine.state.xp).toBe(25);
    engine = new GameEngine(validateSave(engine.snapshot())!);
    expect(engine.career.claimMilestone('first-sale')).toBe(false);
    expect(engine.career.claimMilestone('not-a-goal')).toBe(false);
    expect(engine.state.money).toBe(20);
    expect(new Set(BUSINESS_MILESTONES.map((m) => m.id)).size).toBe(BUSINESS_MILESTONES.length);
  });
  it('accountant rewards new paid work, not idle time or purchases before hiring', () => {
    const engine = new GameEngine();
    engine.state.totalServed = 90;
    engine.state.money = 100000;
    engine.purchaseUpgrade('accountant');
    engine.progression.update(600000);
    expect(engine.state.xp).toBe(0);
    engine.state.totalServed += 4;
    engine.progression.update(10000);
    expect(engine.state.xp).toBe(0);
    engine.state.totalServed++;
    engine.progression.update(10000);
    expect(engine.state.xp).toBe(2);
    engine.progression.update(600000);
    expect(engine.state.xp).toBe(2);
  });
  it('regulars earn loyalty only when a completed purchase includes their favorite', () => {
    const engine = new GameEngine();
    engine.state.player = { ...GAME_CONFIG.cashierSpot };
    for (let i = 0; i < 5; i++) {
      engine.state.customers = [customer({ id: i + 1, regularId: 'ava' })];
      engine.checkout.update(checkoutDuration(engine.state));
    }
    expect(engine.state.career.regularVisits.ava).toBe(5);
    expect(engine.state.career.sold.tomato).toBe(5);
    expect(engine.state.xp).toBe(5 * 7 + 25);
    expect(engine.state.money).toBe(0);
    engine.state.customers = [
      customer({
        id: 6,
        regularId: 'ava',
        targetProduct: 'egg',
        basket: { ...emptyItems(), egg: 1 },
      }),
    ];
    engine.checkout.update(checkoutDuration(engine.state));
    expect(engine.state.career.regularVisits.ava).toBe(5);
  });
  it('cashier upgrades measurably relieve a busy checkout bottleneck', () => {
    const run = (cashier: number) => {
      const state = createInitialState();
      Object.assign(state.upgrades, { cashier, carts: 12, customers: 13, corn: 1 });
      state.xp = xpForLevel(30);
      applyUpgradeEffects(state);
      const engine = new GameEngine(state);
      engine.securityProtected = true;
      for (let t = 0; t < 300000; t += 50) {
        for (const id of state.unlockedProducts) state.shelves[id] = state.shelfCapacities[id];
        engine.update(50);
      }
      return state.totalServed;
    };
    const basic = run(1),
      upgraded = run(5);
    expect(basic).toBeGreaterThan(30);
    expect(upgraded).toBeGreaterThan(basic * 1.3);
  });
});

describe('optional contracts and earned shop styles', () => {
  it('counts new sales only, survives reload, and grants each contract reward once', () => {
    let engine = new GameEngine();
    expect(engine.career.acceptContract('produce')).toBe(false);
    engine.state.totalServed = 10;
    engine.state.career.sold.tomato = 100;
    expect(engine.career.acceptContract('produce')).toBe(true);
    expect(engine.career.acceptContract('variety')).toBe(false);
    expect(contractProgress(engine.state)).toBe(0);
    awardSaleXp(engine.state, 12, undefined, { ...emptyItems(), tomato: 12 });
    engine = new GameEngine(validateSave(engine.snapshot())!);
    expect(contractProgress(engine.state)).toBe(0.5);
    expect(engine.career.claimContract()).toBe(false);
    const reward = engine.state.career.contract!.rewardMoney;
    awardSaleXp(engine.state, 12, undefined, { ...emptyItems(), tomato: 12 });
    expect(engine.career.claimContract()).toBe(true);
    expect(engine.state.money).toBe(reward);
    expect(engine.state.career.contractsCompleted).toBe(1);
    expect(engine.career.claimContract()).toBe(false);
    expect(engine.career.setStyle('sunflower')).toBe(false);
    engine.state.career.contractsCompleted = 2;
    expect(engine.career.setStyle('sunflower')).toBe(true);
    expect(validateSave(engine.snapshot())!.career.style).toBe('sunflower');
  });
  it('never requests locked products and abandonment has no fee or time pressure', () => {
    const engine = new GameEngine();
    engine.state.totalServed = 10;
    engine.career.acceptContract('variety');
    const contract = engine.state.career.contract!;
    expect(
      Object.entries(contract.goals)
        .filter(([, n]) => n > 0)
        .map(([id]) => id),
    ).toEqual(['tomato', 'egg']);
    const wallet = engine.state.money;
    engine.state.elapsed += 86400000;
    expect(engine.state.career.contract).toBe(contract);
    engine.career.cancelContract();
    expect(engine.state.money).toBe(wallet);
    expect(engine.career.acceptContract('drive')).toBe(false);
    engine.state.upgrades.driveThrough = 1;
    engine.state.driveThroughServed = 99;
    expect(engine.career.acceptContract('drive')).toBe(true);
    engine.state.totalServed += 8;
    expect(contractProgress(engine.state)).toBe(0); // Store orders are not deliveries.
    engine.state.driveThroughServed += 8;
    expect(contractProgress(engine.state)).toBe(1);
  });
});

describe('intentional helper and production choices', () => {
  it('prefers the assigned crop while preserving carried goods and saved preferences', () => {
    const engine = production(),
      worker = engine.state.workers[0];
    worker.priority = 'egg';
    engine.workers.update(50);
    expect(worker.task).toBe('harvest');
    expect(worker.product).toBe('egg');
    worker.basket.egg = 2;
    const restored = validateSave(engine.snapshot())!;
    expect(restored.workers[0].priority).toBe('egg');
    expect(restored.workers[0].basket.egg).toBe(2);
  });
  it('urgent shelf priority includes finished products, not just raw crops', () => {
    const engine = production(),
      worker = engine.state.workers[0];
    worker.priority = 'shelves';
    engine.state.customers = [
      customer({
        state: 'WAITING_FOR_PRODUCT',
        targetProduct: 'tomatoPaste',
        basket: emptyItems(),
      }),
    ];
    engine.state.machines.paste.output = 2;
    engine.workers.update(50);
    expect(worker.task).toBe('collect');
    expect(worker.product).toBe('tomatoPaste');
  });
  it('shelf-first reserves raw supply even for a processor-focused helper', () => {
    const engine = production(),
      worker = engine.state.workers[0];
    worker.priority = 'machines';
    engine.state.career.machinePolicies.paste = 'shelf-first';
    engine.state.career.stockTargets.tomato = 6;
    engine.workers.update(50);
    expect(worker.product).toBe('tomato');
    expect(worker.machine).toBeUndefined();
    const satisfied = production();
    satisfied.state.workers[0].priority = 'machines';
    satisfied.state.career.machinePolicies.paste = 'shelf-first';
    satisfied.state.shelves.tomato = 6;
    satisfied.workers.update(50);
    expect(satisfied.state.workers[0].machine).toBe('paste');
  });
  it('full batches wait without consuming partial input; pause finishes existing work only', () => {
    const engine = production();
    engine.state.career.batchModes.paste = 'full';
    engine.state.machines.paste.input = 2;
    engine.machines.update(50000);
    expect(engine.state.machines.paste).toMatchObject({ input: 2, processing: 0, output: 0 });
    engine.state.machines.paste.input += 2;
    engine.machines.update(100);
    expect(engine.state.machines.paste.processing).toBe(4);
    engine.state.career.machinePolicies.paste = 'paused';
    engine.state.machines.paste.input = 4;
    engine.machines.update(50000);
    expect(engine.state.machines.paste).toMatchObject({ input: 4, processing: 0, output: 4 });
    engine.machines.update(50000);
    expect(engine.state.machines.paste.output).toBe(4);
    engine.state.career.machinePolicies.paste = 'balanced';
    engine.state.career.batchModes.paste = 'quick';
    engine.state.machines.paste.input = 1;
    engine.machines.update(50000);
    expect(engine.state.machines.paste.output).toBe(5);
  });
});

describe('safe local recovery and challenge migration', () => {
  it('still writes the primary save when storage cannot fit a second rolling copy', () => {
    const repository = new MemorySave();
    const saves = new SaveSystem(repository);
    const state = createInitialState();
    saves.save(state);
    repository.backup = () => {
      throw new Error('Quota full');
    };
    state.money = 90;
    expect(saves.save(state)).toBe(true);
    expect(JSON.parse(repository.value!).money).toBe(90);
    expect(saves.lastError).toBeNull();
    expect(saves.lastWarning).toContain('Download a backup');
  });
  it('previews without writing, restores all preferences and keeps the previous save', () => {
    const repository = new MemorySave(),
      saves = new SaveSystem(repository);
    const old = createInitialState();
    old.money = 75;
    saves.save(old);
    const state = production().snapshot();
    state.lowPower = true;
    state.safePause = true;
    state.workers[0].priority = 'machines';
    state.career.batchModes.paste = 'full';
    state.career.machinePolicies.paste = 'shelf-first';
    const before = repository.value;
    const backup = saves.export(state);
    expect(saves.previewImport(backup).career).toEqual(state.career);
    expect(repository.value).toBe(before);
    expect(saves.restore(backup)).toBe(true);
    expect(saves.previousBackup()).toBe(before);
    const restored = saves.load();
    expect(restored.lowPower && restored.safePause).toBe(true);
    expect(restored.workers[0].priority).toBe('machines');
    expect(restored.career.machinePolicies.paste).toBe('shelf-first');
    saves.save(restored);
    saves.save(restored);
    expect(saves.previousBackup()).toBe(before); // Autosaves cannot erase pre-import recovery.
  });
  it('rejects incomplete, huge and invalid imports without altering either copy', () => {
    const repository = new MemorySave(),
      saves = new SaveSystem(repository);
    saves.save(createInitialState());
    const before = repository.value;
    for (const value of [
      '{',
      '{}',
      ' '.repeat(2_000_001),
      JSON.stringify({ version: 2, money: 1, upgrades: [], inventory: [], farms: [] }),
    ]) {
      expect(() => saves.previewImport(value)).toThrow();
      expect(saves.restore(value)).toBe(false);
      expect(repository.value).toBe(before);
    }
    repository.value = '{broken-original';
    saves.load();
    expect(saves.save(createInitialState())).toBe(false);
    expect(repository.value).toBe('{broken-original');
  });
  it('normalizes unknown preferences and keeps active legacy rush goals', () => {
    const state = createInitialState();
    const restored = validateSave({
      ...state,
      career: { stockTargets: { tomato: 5000 }, style: 'lavender', batchModes: { paste: 'bogus' } },
      rush: { remainingMs: 40000, servedAtStart: 0, completed: 1, result: 'none' },
    })!;
    expect(restored.career.stockTargets.tomato).toBe(12);
    expect(restored.career.style).toBe('classic');
    expect(restored.career.batchModes.paste).toBe('quick');
    expect(restored.rush.goal).toBe(8);
    expect(restored.rush.rewardXp).toBe(100);
  });
  it('higher rush difficulty requires stock, carts and completed business', () => {
    const engine = new GameEngine();
    expect(engine.rush.start()).toBe(false);
    engine.state.totalServed = 150;
    expect(engine.rush.start('festival')).toBe(false);
    engine.state.upgrades.carts = 7;
    expect(engine.rush.start('festival')).toBe(false);
    engine.state.shelves.tomato = 1;
    expect(engine.rush.start('festival')).toBe(true);
    expect(engine.state.rush).toMatchObject({ goal: 20, rewardXp: 250 });
  });
  it('menu protection freezes an active thief without stopping the shop', () => {
    const engine = new GameEngine();
    engine.state.player = { x: 100, y: 920 };
    engine.state.cashStacks.store.amount = 120;
    engine.state.security.thief = {
      ...GAME_CONFIG.storeCash,
      phase: 'STEALING',
      target: 'store',
      stolen: 0,
      elapsed: GAME_CONFIG.thiefStealTime - 50,
      path: [],
    };
    engine.securityProtected = true;
    engine.update(50);
    expect(engine.state.elapsed).toBe(50);
    expect(engine.state.security.thief.phase).toBe('STEALING');
    expect(engine.state.cashStacks.store.amount).toBe(120);
    engine.securityProtected = false;
    engine.update(50);
    expect(engine.state.cashStacks.store.amount).toBe(90);
  });
});
