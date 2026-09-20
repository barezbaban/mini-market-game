import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import type {
  CustomerData,
  CustomerState,
  GameState,
  ItemCounts,
  SaveRepository,
  Vec2,
} from '../types';
import { applyUpgradeEffects } from './UpgradeSystem';

export function createInitialState(): GameState {
  const state: GameState = {
    version: 1,
    money: 0,
    inventory: emptyItems(),
    inventoryCapacity: GAME_CONFIG.playerStartCapacity,
    shelves: emptyItems(),
    shelfCapacities: { tomato: 8, egg: 8, corn: 8 },
    farms: {
      tomato: { ready: 3, elapsed: 0 },
      egg: { ready: 2, elapsed: 0 },
      corn: { ready: 0, elapsed: 0 },
    },
    unlockedProducts: ['tomato', 'egg'],
    upgrades: { shelf: 0, inventory: 0, customers: 0, corn: 0, cashier: 0 },
    cashier: false,
    player: { ...GAME_CONFIG.playerStart },
    customers: [],
    checkoutProgress: 0,
    upgradeProgress: 0,
    activeUpgrade: null,
    tutorialStep: 0,
    totalEarned: 0,
    totalServed: 0,
    totalHarvested: 0,
    elapsed: 0,
    soundEnabled: true,
  };
  applyUpgradeEffects(state);
  return state;
}

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, value))
    : fallback;
const integer = (value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Math.floor(number(value, fallback, max));
const point = (value: unknown, fallback: Vec2, outside = false): Vec2 => {
  const source = object(value);
  const bounds = GAME_CONFIG.bounds;
  return {
    x: Math.max(
      outside ? 0 : bounds.left,
      number(source.x, fallback.x, outside ? GAME_CONFIG.width + 100 : bounds.right),
    ),
    y: Math.max(
      outside ? 0 : bounds.top,
      number(source.y, fallback.y, outside ? GAME_CONFIG.height : bounds.bottom),
    ),
  };
};

/** Accepts only this schema version, repairing individual corrupt values conservatively. */
export function validateSave(value: unknown): GameState | null {
  const raw = object(value);
  if (raw.version !== 1) return null;
  const state = createInitialState();
  const upgrades = object(raw.upgrades);
  for (const upgrade of UPGRADES)
    state.upgrades[upgrade.id] = integer(upgrades[upgrade.id], 0, upgrade.maxLevel);
  applyUpgradeEffects(state);
  state.money = integer(raw.money);
  state.totalEarned = integer(raw.totalEarned);
  state.totalServed = integer(raw.totalServed);
  state.totalHarvested = integer(raw.totalHarvested);
  state.tutorialStep = integer(raw.tutorialStep, 0, 6);
  state.elapsed = number(raw.elapsed);
  state.player = point(raw.player, state.player);
  state.soundEnabled = typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true;
  let inventoryRoom = state.inventoryCapacity;
  const inventory = object(raw.inventory);
  const shelves = object(raw.shelves);
  const farms = object(raw.farms);
  for (const product of PRODUCTS) {
    const unlocked = state.unlockedProducts.includes(product.id);
    state.inventory[product.id] = unlocked ? integer(inventory[product.id], 0, inventoryRoom) : 0;
    inventoryRoom -= state.inventory[product.id];
    state.shelves[product.id] = unlocked
      ? integer(shelves[product.id], 0, state.shelfCapacities[product.id])
      : 0;
    const farm = object(farms[product.id]);
    state.farms[product.id] = {
      ready: unlocked
        ? integer(farm.ready, state.farms[product.id].ready, GAME_CONFIG.farmCapacity)
        : 0,
      elapsed: unlocked ? number(farm.elapsed, 0, product.productionTime - 1) : 0,
    };
  }
  const states: CustomerState[] = [
    'ENTERING',
    'MOVING_TO_SHELF',
    'WAITING_FOR_PRODUCT',
    'MOVING_TO_CHECKOUT',
    'QUEUEING',
    'PAYING',
    'LEAVING',
  ];
  const ids = new Set<number>();
  if (Array.isArray(raw.customers)) {
    for (const value of raw.customers.slice(0, GAME_CONFIG.customerMax)) {
      const customer = object(value);
      const product = PRODUCTS.find(
        (entry) => entry.id === customer.targetProduct && state.unlockedProducts.includes(entry.id),
      );
      const id = integer(customer.id);
      if (!product || id < 1 || ids.has(id) || !states.includes(customer.state as CustomerState))
        continue;
      ids.add(id);
      const basket: ItemCounts = emptyItems();
      const rawBasket = object(customer.basket);
      let basketRoom = 2;
      for (const item of PRODUCTS) {
        basket[item.id] = state.unlockedProducts.includes(item.id)
          ? integer(rawBasket[item.id], 0, basketRoom)
          : 0;
        basketRoom -= basket[item.id];
      }
      const restored: CustomerData = {
        id,
        ...point(customer, GAME_CONFIG.entrance, true),
        state: customer.state as CustomerState,
        targetProduct: product.id,
        basket,
        color: integer(customer.color, 0x6296d1, 0xffffff),
        waitTime: number(customer.waitTime, 0, 60000),
        path: Array.isArray(customer.path)
          ? customer.path.slice(0, 16).map((entry) => point(entry, GAME_CONFIG.entrance, true))
          : [],
      };
      if (
        typeof customer.queueOrder === 'number' &&
        Number.isSafeInteger(customer.queueOrder) &&
        customer.queueOrder > 0
      )
        restored.queueOrder = customer.queueOrder;
      // A leaving shopper has already paid. Never let its old basket pay twice.
      if (restored.state === 'LEAVING') restored.basket = emptyItems();
      if (
        ['QUEUEING', 'PAYING', 'MOVING_TO_CHECKOUT'].includes(restored.state) &&
        basketRoom === 2
      ) {
        restored.state = 'MOVING_TO_SHELF';
        restored.path = [];
      }
      state.customers.push(restored);
    }
  }
  state.checkoutProgress = state.customers.some((customer) => customer.state === 'PAYING')
    ? number(raw.checkoutProgress, 0, GAME_CONFIG.checkoutTime - 1)
    : 0;
  return state;
}

export type SaveStatus = 'idle' | 'loaded' | 'saved' | 'reset' | 'invalid' | 'unavailable';

export class SaveSystem {
  lastError: string | null = null;
  status: SaveStatus = 'idle';
  constructor(private readonly repository: SaveRepository) {}

  load(): GameState {
    try {
      const stored = this.repository.read();
      if (!stored) {
        this.status = 'idle';
        this.lastError = null;
        return createInitialState();
      }
      const state = validateSave(JSON.parse(stored) as unknown);
      if (!state)
        throw new Error('This save uses an unsupported version. A fresh market is ready.');
      this.status = 'loaded';
      this.lastError = null;
      return state;
    } catch (error) {
      this.status =
        error instanceof SyntaxError ||
        (error instanceof Error && error.message.includes('unsupported version'))
          ? 'invalid'
          : 'unavailable';
      this.lastError =
        error instanceof Error ? error.message : 'The saved market could not be read.';
      return createInitialState();
    }
  }

  save(state: GameState): boolean {
    try {
      this.repository.write(JSON.stringify(state));
      this.status = 'saved';
      this.lastError = null;
      return true;
    } catch (error) {
      this.status = 'unavailable';
      this.lastError =
        error instanceof Error ? error.message : 'Your browser could not save this market.';
      return false;
    }
  }

  reset(): boolean {
    try {
      this.repository.clear();
      this.status = 'reset';
      this.lastError = null;
      return true;
    } catch (error) {
      this.status = 'unavailable';
      this.lastError =
        error instanceof Error ? error.message : 'Your browser could not reset the save.';
      return false;
    }
  }
}
