import { describe, it, expect } from 'vitest';
import { OFFICE, VAULT_DOOR, type VaultAccess } from '../src/game/data/office';
import { GameEngine } from '../src/game/systems/GameEngine';
import {
  canStand,
  clearWalk,
  clearMovement,
  walkRoute,
  vaultAccessAllows,
} from '../src/game/systems/Navigation';
import { validateSave } from '../src/game/systems/SaveSystem';
import { createWorker } from '../src/game/systems/UpgradeSystem';
import { emptyItems } from '../src/game/data/products';

const outside = { x: VAULT_DOOR.x, y: 640 };
const inside = { x: VAULT_DOOR.x, y: 925 };
function advance(e: GameEngine, ms: number, x = 0, y = 0, sprint = false) {
  for (let time = 0; time < ms; time += 25) e.update(25, { x, y, sprint });
}

describe('secure, usable vault entrance', () => {
  it.each([false, true])(
    'opens for the manager and permits straight entry and exit (sprint=%s)',
    (sprint) => {
      const e = new GameEngine();
      e.state.player = { ...outside };
      e.state.walkSpeed = sprint ? 1.35 : 1;
      expect(clearWalk(e.state, outside, inside, 'manager')).toBe(true); // No rack behind the door.
      expect(clearMovement(e.state, outside, inside, 'manager')).toBe(false);
      advance(e, 150, 0, 1, sprint);
      expect(e.state.player.y).toBeLessThan(690);
      expect(e.state.office.doorOpen).toBeGreaterThan(0);
      advance(e, sprint ? 900 : 1400, 0, 1, sprint);
      expect(e.state.player.y).toBeGreaterThan(880);
      expect(e.state.player.y).toBeLessThan(980);
      // The automatic door also unlocks from inside, including after a reload.
      const loaded = new GameEngine(validateSave(e.snapshot())!);
      expect(loaded.state.player).toEqual(e.state.player);
      advance(loaded, 2500, 0, -1);
      expect(loaded.state.player.y).toBeLessThan(580);
      advance(loaded, 700);
      expect(loaded.state.office.doorOpen).toBe(0);
    },
  );
  it('keeps the door open around an authorized visitor, even without a hired accountant', () => {
    const e = new GameEngine();
    e.state.player = { x: VAULT_DOOR.x, y: 700 };
    advance(e, 2000);
    expect(e.state.office.doorOpen).toBe(1);
    e.state.player = { ...OFFICE.managerSeat };
    advance(e, 500);
    expect(e.state.office.doorOpen).toBe(0);
  });
  it('opens for a hired accountant, but ignores other nearby staff and customers', () => {
    const e = new GameEngine();
    Object.assign(e.state.office.accountant, outside);
    e.state.workers = [{ ...createWorker(1), ...outside }];
    e.state.upgrades.helpers = 1;
    e.office.update(500);
    expect(e.state.office.doorOpen).toBe(0);
    e.state.upgrades.accountant = 1;
    e.office.update(500);
    expect(e.state.office.doorOpen).toBe(1);
  });
  it('keeps role-specific routes distinct in the navigation cache even while the door is open', () => {
    const e = new GameEngine();
    e.state.office.doorOpen = 1;
    for (const access of [
      'public',
      'manager',
      'accountant',
      'public',
      'accountant',
      'manager',
      'public',
    ] as VaultAccess[]) {
      expect(canStand(e.state, inside, access)).toBe(access !== 'public');
      expect(clearMovement(e.state, outside, inside, access)).toBe(access !== 'public');
      const route = walkRoute(e.state, outside, inside, access);
      if (access === 'public') expect(route).toEqual([]);
      else expect(route.at(-1)).toEqual(inside);
    }
  });
  it('blocks helpers, shoppers and thieves from following a manager through the open door', () => {
    const e = new GameEngine();
    e.state.player = { x: VAULT_DOOR.x, y: 700 };
    e.state.office.doorOpen = 1;
    e.state.upgrades.helpers = 1;
    const worker = {
      ...createWorker(1),
      ...outside,
      task: 'stock' as const,
      product: 'tomato' as const,
      basket: { ...emptyItems(), tomato: 2 },
      path: [inside],
    };
    e.state.workers = [worker];
    const customer = {
      id: 1,
      ...outside,
      state: 'LEAVING' as const,
      targetProduct: 'tomato' as const,
      targetQuantity: 1,
      basket: emptyItems(),
      color: 0,
      waitTime: 0,
      path: [inside],
    };
    e.state.customers = [customer];
    e.state.security.thief = {
      ...outside,
      phase: 'APPROACHING',
      target: 'store',
      stolen: 0,
      elapsed: 0,
      path: [inside],
    };
    advance(e, 1000);
    for (const actor of [worker, customer, e.state.security.thief!]) {
      expect(actor.y).toBeLessThan(690);
      expect(vaultAccessAllows(actor, actor)).toBe(true);
    }
    expect(e.state.office.doorOpen).toBe(1);
  });
  it('keeps an escorted thief outside the vault when police walk beside its wall', () => {
    const e = new GameEngine();
    e.state.security.police = { x: 40, y: 800, path: [{ x: 40, y: 900 }] };
    e.state.security.thief = {
      x: 40,
      y: 800,
      phase: 'ESCORTED',
      target: 'store',
      stolen: 0,
      elapsed: 0,
      path: [],
    };
    e.security.update(50);
    expect(vaultAccessAllows(e.state.security.thief, e.state.security.thief)).toBe(true);
    expect(e.state.security.thief.x).toBe(40);
  });
  it('repairs old staff routes through the room without losing carried goods or vault cash', () => {
    const e = new GameEngine();
    e.state.upgrades.helpers = 1;
    e.state.workers = [
      {
        ...createWorker(1),
        ...inside,
        basket: { ...emptyItems(), tomato: 2 },
        target: { x: 300, y: 315 },
        path: [{ x: 300, y: 315 }],
        task: 'stock',
        product: 'tomato',
      },
    ];
    e.state.office.vault = 350;
    e.state.player = { ...OFFICE.vaultCollect };
    const loaded = new GameEngine(validateSave(e.snapshot())!);
    expect(loaded.state.office.vault).toBe(350);
    expect(loaded.state.workers[0].basket.tomato).toBe(2);
    expect(vaultAccessAllows(loaded.state.workers[0], loaded.state.workers[0])).toBe(true);
    expect(
      loaded.state.workers[0].path.every((p, i) =>
        vaultAccessAllows(i ? loaded.state.workers[0].path[i - 1] : loaded.state.workers[0], p),
      ),
    ).toBe(true);
    expect(loaded.state.player).toEqual(OFFICE.vaultCollect);
    loaded.cashCollection.update(0);
    expect(loaded.state.money).toBe(350);
  });
});
