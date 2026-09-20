import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems, plotCount } from '../data/products';
import { MACHINES } from '../data/machines';
import { UPGRADES, checkoutDuration, upgradeAvailable } from '../data/upgrades';
import type {
  CustomerData,
  CustomerState,
  DriveThroughOrder,
  DriveThroughState,
  GameState,
  ItemCounts,
  SaveRepository,
  Vec2,
  UpgradeId,
  WorkerData,
} from '../types';
import { applyUpgradeEffects } from './UpgradeSystem';

export function createInitialState(): GameState {
  const state: GameState = {
    version: 2,
    money: 0,
    inventory: emptyItems(),
    inventoryCapacity: GAME_CONFIG.playerStartCapacity,
    shelves: emptyItems(),
    shelfCapacities: emptyItems(),
    farms: Object.fromEntries(
      PRODUCTS.map((product) => [
        product.id,
        {
          ready: product.id === 'tomato' ? 3 : product.id === 'egg' ? 2 : 0,
          elapsed: 0,
          plots: Array.from({ length: product.maxPlots }, (_, index) => ({
            ready: index === 0 ? (product.id === 'tomato' ? 3 : product.id === 'egg' ? 2 : 0) : 0,
            elapsed: 0,
          })),
        },
      ]),
    ) as GameState['farms'],
    unlockedProducts: ['tomato', 'egg'],
    upgrades: Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])) as Record<
      UpgradeId,
      number
    >,
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
    machines: {
      paste: { input: 0, output: 0, processing: 0, elapsed: 0 },
      coffee: { input: 0, output: 0, processing: 0, elapsed: 0 },
    },
    workers: [],
    xp: 0,
    accountantElapsed: 0,
    driveThroughOrders: [],
    driveThroughSpawnElapsed: GAME_CONFIG.driveThroughSpawnInterval - 2500,
    driveThroughHandoffProgress: 0,
    driveThroughCheckoutProgress: 0,
    driveThroughServed: 0,
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
  const coordinate = (entry: unknown, original: number, minimum: number, maximum: number) =>
    typeof entry === 'number' && Number.isFinite(entry)
      ? Math.max(minimum, Math.min(maximum, entry))
      : original;
  return {
    x: coordinate(
      source.x,
      fallback.x,
      outside ? -500 : bounds.left,
      outside ? GAME_CONFIG.width + 100 : bounds.right,
    ),
    y: coordinate(
      source.y,
      fallback.y,
      outside ? -500 : bounds.top,
      outside ? GAME_CONFIG.height : bounds.bottom,
    ),
  };
};

/** Migrate the original market without resetting funds, purchases, or unpaid baskets. */
export function validateSave(value: unknown): GameState | null {
  const raw = object(value);
  if (raw.version !== 1 && raw.version !== 2) return null;
  const state = createInitialState();
  const upgrades = object(raw.upgrades);
  for (const upgrade of UPGRADES)
    state.upgrades[upgrade.id] = integer(upgrades[upgrade.id], 0, upgrade.maxLevel);
  for (let pass = 0; pass < 2; pass++)
    for (const upgrade of UPGRADES)
      if (!upgradeAvailable(state, upgrade.id)) state.upgrades[upgrade.id] = 0;
  applyUpgradeEffects(state);
  state.money = integer(raw.money);
  state.totalEarned = integer(raw.totalEarned);
  state.totalServed = integer(raw.totalServed);
  state.totalHarvested = integer(raw.totalHarvested);
  state.xp = integer(raw.xp, state.totalServed * 5);
  state.accountantElapsed = number(raw.accountantElapsed, 0, GAME_CONFIG.accountantInterval - 1);
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
    const owned = plotCount(state, product.id);
    const plots = Array.from({ length: product.maxPlots }, (_, index) => {
      const original = Array.isArray(farm.plots)
        ? object(farm.plots[index])
        : index === 0
          ? farm
          : {};
      return {
        ready: index < owned ? integer(original.ready, 0, GAME_CONFIG.farmCapacity) : 0,
        elapsed: index < owned ? number(original.elapsed, 0, product.productionTime - 1) : 0,
      };
    });
    state.farms[product.id] = {
      plots,
      ready: plots.reduce((sum, plot) => sum + plot.ready, 0),
      elapsed: plots[0]?.elapsed ?? 0,
    };
  }
  const rawMachines = object(raw.machines);
  for (const machine of MACHINES) {
    if (state.upgrades[machine.upgrade] < 1) continue;
    const stored = object(rawMachines[machine.id]);
    const output = integer(stored.output, 0, machine.bufferCapacity);
    const processing = integer(
      stored.processing,
      0,
      Math.min(state.upgrades[machine.upgrade] * 2, machine.bufferCapacity - output),
    );
    state.machines[machine.id] = {
      input: integer(stored.input, 0, machine.bufferCapacity),
      output,
      processing,
      // Frame deltas can leave a legitimate fractional millisecond just below
      // completion; preserve it exactly so saving never changes a live batch.
      elapsed: processing ? number(stored.elapsed, 0, machine.batchMs) : 0,
    };
  }
  const rawWorkers = Array.isArray(raw.workers) ? raw.workers : [];
  const workerCapacity = GAME_CONFIG.helperCapacities[state.upgrades.helperCapacity];
  state.workers = Array.from({ length: state.upgrades.helpers }, (_, index): WorkerData => {
    const id = index + 1;
    const original = object(rawWorkers.find((entry) => object(entry).id === id));
    const position = point(original, { x: 990 + index * 35, y: 780 });
    const basket = emptyItems();
    const storedBasket = object(original.basket);
    let room = workerCapacity;
    for (const product of PRODUCTS) {
      basket[product.id] = state.unlockedProducts.includes(product.id)
        ? integer(storedBasket[product.id], 0, room)
        : 0;
      room -= basket[product.id];
    }
    // Replan jobs on load, but never discard the goods a helper is carrying.
    return {
      id,
      ...position,
      basket,
      task: 'idle',
      product: null,
      target: { ...position },
      path: [],
      actionElapsed: 0,
    };
  });
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
        ...point(
          customer,
          customer.state === 'ENTERING' ? GAME_CONFIG.customerSpawn : GAME_CONFIG.entrance,
          true,
        ),
        state: customer.state as CustomerState,
        targetProduct: product.id,
        targetQuantity: Math.max(1, integer(customer.targetQuantity, id % 2 === 0 ? 2 : 1, 2)),
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
    ? number(raw.checkoutProgress, 0, checkoutDuration(state) - 1)
    : 0;
  state.driveThroughServed = integer(raw.driveThroughServed);
  state.driveThroughSpawnElapsed = number(
    raw.driveThroughSpawnElapsed,
    GAME_CONFIG.driveThroughSpawnInterval - 2500,
    GAME_CONFIG.driveThroughSpawnInterval - 1,
  );
  const driveStates: DriveThroughState[] = [
    'ARRIVING',
    'WAITING_FOR_ITEMS',
    'READY_TO_PAY',
    'PAYING',
    'LEAVING',
  ];
  const driveIds = new Set<number>();
  if (state.upgrades.driveThrough > 0 && Array.isArray(raw.driveThroughOrders)) {
    for (const value of raw.driveThroughOrders.slice(0, GAME_CONFIG.driveThroughMax)) {
      const stored = object(value);
      const id = integer(stored.id);
      const driveState = stored.state as DriveThroughState;
      if (id < 1 || driveIds.has(id) || !driveStates.includes(driveState)) continue;
      driveIds.add(id);
      const requested = emptyItems();
      const delivered = emptyItems();
      const rawRequested = object(stored.requested);
      const rawDelivered = object(stored.delivered);
      let orderRoom = 4;
      let productSlots = 3;
      for (const product of PRODUCTS) {
        if (!state.unlockedProducts.includes(product.id)) continue;
        const wanted = integer(rawRequested[product.id], 0, orderRoom);
        requested[product.id] = wanted > 0 && productSlots > 0 ? wanted : 0;
        if (requested[product.id] > 0) productSlots -= 1;
        orderRoom -= requested[product.id];
        delivered[product.id] = integer(rawDelivered[product.id], 0, requested[product.id]);
      }
      if (Object.values(requested).reduce((sum, count) => sum + count, 0) === 0) continue;
      const position = point(stored, GAME_CONFIG.driveThroughVehicleSpot, true);
      const restored: DriveThroughOrder = {
        id,
        vehicle: stored.vehicle === 'bike' ? 'bike' : 'car',
        state: driveState,
        ...position,
        color: integer(stored.color, 0xe7775e, 0xffffff),
        requested,
        delivered,
      };
      if (
        ['READY_TO_PAY', 'PAYING', 'LEAVING'].includes(restored.state) &&
        PRODUCTS.some(({ id: product }) => delivered[product] < requested[product])
      )
        restored.state = 'WAITING_FOR_ITEMS';
      state.driveThroughOrders.push(restored);
    }
  }
  const activeDriveOrder = state.driveThroughOrders.find(
    (order) => order.state !== 'LEAVING' && order.x === GAME_CONFIG.driveThroughVehicleSpot.x,
  );
  state.driveThroughHandoffProgress =
    activeDriveOrder?.state === 'WAITING_FOR_ITEMS'
      ? number(raw.driveThroughHandoffProgress, 0, GAME_CONFIG.driveThroughHandoffTime - 1)
      : 0;
  state.driveThroughCheckoutProgress =
    activeDriveOrder && ['READY_TO_PAY', 'PAYING'].includes(activeDriveOrder.state)
      ? number(raw.driveThroughCheckoutProgress, 0, GAME_CONFIG.driveThroughCheckoutTime - 1)
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
