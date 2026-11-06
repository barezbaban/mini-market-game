import { expect, it } from 'vitest';
import { GameEngine } from '../src/game/systems/GameEngine';
import { createInitialState, validateSave } from '../src/game/systems/SaveSystem';
import {
  DEFAULT_BINDINGS,
  validateBindings,
  clampWalkSpeed,
  sprintDuration,
  heldAction,
} from '../src/game/data/movement';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { PRODUCTS, FARM_PRODUCTS, plotPosition, displayKind } from '../src/game/data/products';
import { UPGRADES, upgradeCost } from '../src/game/data/upgrades';
import { applyUpgradeEffects } from '../src/game/systems/UpgradeSystem';
import { farmStandSpot } from '../src/game/data/standSpots';
import { clearWalk } from '../src/game/systems/Navigation';

it('keeps the entire delivery promenade clear of collection zones in a fully built market', () => {
  const state = createInitialState();
  for (const u of UPGRADES) state.upgrades[u.id] = u.maxLevel;
  applyUpgradeEffects(state);
  const engine = new GameEngine(state);
  const from = { x: 1050, y: 1170 },
    to = GAME_CONFIG.driveThroughPlayerSpot;
  expect(clearWalk(state, from, to)).toBe(true);
  for (let y = from.y; y <= to.y; y += 15) {
    state.player = { x: from.x, y };
    engine.update(50, { x: 0, y: 1 });
    for (const product of FARM_PRODUCTS)
      for (let i = 0; i < product.maxPlots; i++) {
        const p = plotPosition(product.id, i);
        expect(Math.hypot(from.x - p.x, y - p.y)).toBeGreaterThan(100);
      }
  }
  expect(
    engine.drainEvents().filter((e) => e.type === 'harvest' && e.handoff?.actor === 'player'),
  ).toHaveLength(0);
  expect(Object.values(state.inventory).every((n) => n === 0)).toBe(true);
});

it('requires a brief deliberate stop to harvest, rather than filling the basket while passing', () => {
  const engine = new GameEngine();
  engine.state.player = farmStandSpot('tomato', 0);
  engine.update(100, { x: 1, y: 0 });
  expect(engine.state.inventory.tomato).toBe(0);
  engine.state.player = farmStandSpot('tomato', 0);
  engine.update(150);
  expect(engine.state.inventory.tomato).toBe(0);
  engine.update(150);
  expect(engine.state.inventory.tomato).toBeGreaterThan(0);
});

it('prices all 30 sprint upgrades progressively and preserves them with remapped controls in saves', () => {
  const e = new GameEngine();
  e.state.money = 1_000_000;
  let paid = 0,
    previous = 0;
  for (let i = 0; i < 30; i++) {
    const cost = upgradeCost(e.state, 'sprint');
    expect(cost).toBeGreaterThan(previous);
    previous = cost;
    paid += cost;
    expect(e.purchaseUpgrade('sprint')).toBe(true);
  }
  expect(e.state.money).toBe(1_000_000 - paid);
  expect(e.purchaseUpgrade('sprint')).toBe(false);
  expect(sprintDuration(e.state)).toBe(19000);
  e.state.controls.up[0] = 'KeyI';
  e.state.controls.sprint[0] = 'Space';
  e.state.walkSpeed = 1.25;
  const restored = validateSave(e.snapshot())!;
  expect(restored.controls).toEqual(e.state.controls);
  expect(restored.walkSpeed).toBe(1.25);
  expect(restored.upgrades.sprint).toBe(30);
  const normal = new GameEngine(),
    trained = new GameEngine(restored);
  for (const game of [normal, trained]) {
    game.state.player = { x: 1100, y: 1200 };
    game.state.walkSpeed = 1;
    for (let i = 0; i < 2; i++) game.update(1000, { x: 0, y: 1, sprint: true });
  }
  expect(normal.state.sprintEnergy).toBeCloseTo(0.5);
  expect(trained.state.sprintEnergy).toBeCloseTo(1 - 2000 / 19000);
});

it('sanitizes speed and conflicting key bindings, with physical keys independent of text language', () => {
  expect(clampWalkSpeed(Infinity)).toBe(1);
  expect(clampWalkSpeed(-8)).toBe(1);
  expect(clampWalkSpeed(20)).toBe(1.35);
  const bindings = structuredClone(DEFAULT_BINDINGS);
  bindings.up[0] = 'KeyI';
  expect(heldAction(new Set(['KeyI']), bindings, 'up')).toBe(true);
  expect(heldAction(new Set(['KeyW']), bindings, 'up')).toBe(false);
  bindings.down[0] = 'KeyI';
  expect(validateBindings(bindings)).toEqual(DEFAULT_BINDINGS);
  expect(validateBindings({ up: ['<script>'] })).toEqual(DEFAULT_BINDINGS);
  const old = createInitialState();
  const restored = validateSave({ ...old, controls: undefined, walkSpeed: undefined })!;
  expect(restored.controls).toEqual(DEFAULT_BINDINGS);
});

it('preserves an in-progress drive-through transaction when the old yard is relocated', () => {
  const state = createInitialState();
  state.upgrades.driveThrough = 1;
  state.driveThroughOrders = [
    {
      id: 1,
      x: 765,
      y: 1680,
      state: 'WAITING_FOR_ITEMS',
      vehicle: 'car',
      color: 0xffffff,
      requested: { ...state.inventory, tomato: 2 },
      delivered: { ...state.inventory, tomato: 1 },
    },
  ];
  state.driveThroughHandoffProgress = 200;
  state.money = 4321;
  state.inventory.egg = 2;
  const restored = validateSave({ ...state, layoutVersion: 3 })!;
  expect(restored.money).toBe(4321);
  expect(restored.inventory.egg).toBe(2);
  expect(restored.driveThroughHandoffProgress).toBe(200);
  expect(restored.driveThroughOrders[0].delivered.tomato).toBe(1);
  expect(restored.driveThroughOrders[0].y).toBe(GAME_CONFIG.driveThroughVehicleSpot.y);
  expect(restored.player).toEqual(GAME_CONFIG.playerStart);
});

it('uses category-appropriate displays, with no dairy inventory facing the right wall', () => {
  for (const id of ['tomato', 'corn', 'carrot', 'strawberry'] as const)
    expect(displayKind(id)).toBe('produce');
  expect(displayKind('grilledCorn')).toBe('heated');
  expect(displayKind('groundCoffee')).toBe('pantry');
  for (const id of ['egg', 'milk', 'cheese'] as const) {
    expect(displayKind(id)).toBe('chilled');
    expect(PRODUCTS.find((p) => p.id === id)!.shelf.facing).toBeUndefined();
  }
});

it('keeps maximum-speed sprinting from crossing store walls or display counters', () => {
  const engine = new GameEngine();
  engine.state.walkSpeed = 1.35;
  engine.state.player = { x: 1400, y: 1050 };
  engine.update(200, { x: 0, y: 1, sprint: true });
  expect(engine.state.player.y).toBeLessThan(1090);
  const tomato = PRODUCTS.find((p) => p.id === 'tomato')!;
  engine.state.player = { x: tomato.shelf.x, y: tomato.shelf.y + 100 };
  engine.update(500, { x: 0, y: -1, sprint: true });
  expect(engine.state.player.y).toBeGreaterThan(tomato.shelf.y + 44);
});
