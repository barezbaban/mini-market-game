import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems, productById } from '../data/products';
import type { DriveThroughOrder, GameEvent, GameState, ItemCounts, ProductId } from '../types';
import { EconomySystem } from './EconomySystem';
import { distance } from './CustomerSystem';
import { InventorySystem } from './InventorySystem';
import { awardXp } from './ProgressionSystem';

const VEHICLE_COLORS = [0xe7775e, 0x5f9fc4, 0xe4b84d, 0x8c73ae, 0x62a276];

export const driveThroughRemaining = (order: DriveThroughOrder, id: ProductId): number =>
  Math.max(0, order.requested[id] - order.delivered[id]);

export const driveThroughComplete = (order: DriveThroughOrder): boolean =>
  PRODUCTS.every(({ id }) => driveThroughRemaining(order, id) === 0);

export const driveThroughTotal = (items: ItemCounts): number =>
  PRODUCTS.reduce((sum, { id }) => sum + items[id], 0);

export const driveThroughValue = (order: DriveThroughOrder): number =>
  PRODUCTS.reduce((sum, product) => sum + order.requested[product.id] * product.sellingPrice, 0);

function moveX(order: DriveThroughOrder, target: number, deltaMs: number): boolean {
  const step = (GAME_CONFIG.driveThroughVehicleSpeed * deltaMs) / 1000;
  if (Math.abs(order.x - target) <= step) {
    order.x = target;
    return true;
  }
  order.x += Math.sign(target - order.x) * step;
  return false;
}

/** A separate lane: players load and charge orders until its dedicated staff are hired. */
export class DriveThroughSystem {
  private nextId: number;
  private activeId: number | null = null;

  constructor(
    private readonly state: GameState,
    private readonly inventory: InventorySystem,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {
    this.nextId = Math.max(1, ...state.driveThroughOrders.map((order) => order.id + 1));
  }

  private spawn(): void {
    if (this.state.driveThroughOrders.length >= GAME_CONFIG.driveThroughMax) return;
    const choices = this.state.unlockedProducts;
    if (!choices.length) return;
    const id = this.nextId++;
    const requested = emptyItems();
    const units = 2 + (id % 3);
    const productCount = Math.min(3, choices.length, units);
    for (let index = 0; index < units; index += 1) {
      const product = choices[(id + index) % productCount];
      requested[product] += 1;
    }
    this.state.driveThroughOrders.push({
      id,
      vehicle: id % 3 === 0 ? 'bike' : 'car',
      state: 'ARRIVING',
      x: 1480,
      y: GAME_CONFIG.driveThroughVehicleSpot.y,
      color: VEHICLE_COLORS[(id - 1) % VEHICLE_COLORS.length],
      requested,
      delivered: emptyItems(),
    });
  }

  private transferOne(order: DriveThroughOrder): boolean {
    const manual =
      distance(this.state.player, GAME_CONFIG.driveThroughPlayerSpot) <=
      GAME_CONFIG.interactionRadius;
    const id = PRODUCTS.find(
      (product) =>
        driveThroughRemaining(order, product.id) > 0 &&
        ((manual && this.state.inventory[product.id] > 0) ||
          (this.state.upgrades.driveRunner > 0 && this.state.shelves[product.id] > 0)),
    )?.id;
    if (!id) return false;
    if (manual && this.state.inventory[id] > 0) this.state.inventory[id] -= 1;
    else if (this.state.upgrades.driveRunner > 0 && this.inventory.takeFromShelf(id, 1)) {
      // The dedicated runner serves only this window and takes exactly one requested item.
    } else return false;
    order.delivered[id] += 1;
    const product = productById(id)!;
    this.emit({
      type: 'stock',
      text: `${product.name} delivered`,
      ...GAME_CONFIG.driveThroughWindow,
    });
    return true;
  }

  private updateService(order: DriveThroughOrder, deltaMs: number): void {
    if (order.state === 'WAITING_FOR_ITEMS') {
      if (driveThroughComplete(order)) {
        order.state = 'READY_TO_PAY';
        this.state.driveThroughHandoffProgress = 0;
        return;
      }
      const manual =
        distance(this.state.player, GAME_CONFIG.driveThroughPlayerSpot) <=
        GAME_CONFIG.interactionRadius;
      const canSupply = PRODUCTS.some(
        ({ id }) =>
          driveThroughRemaining(order, id) > 0 &&
          ((manual && this.state.inventory[id] > 0) ||
            (this.state.upgrades.driveRunner > 0 && this.state.shelves[id] > 0)),
      );
      if (!canSupply) {
        this.state.driveThroughHandoffProgress = 0;
        return;
      }
      this.state.driveThroughHandoffProgress += deltaMs;
      if (this.state.driveThroughHandoffProgress < GAME_CONFIG.driveThroughHandoffTime) return;
      this.state.driveThroughHandoffProgress = 0;
      this.transferOne(order);
      if (driveThroughComplete(order)) order.state = 'READY_TO_PAY';
      return;
    }
    if (!['READY_TO_PAY', 'PAYING'].includes(order.state)) return;
    const canCharge =
      this.state.upgrades.driveCashier > 0 ||
      distance(this.state.player, GAME_CONFIG.driveThroughPlayerSpot) <=
        GAME_CONFIG.interactionRadius;
    if (!canCharge) {
      this.state.driveThroughCheckoutProgress = 0;
      order.state = 'READY_TO_PAY';
      return;
    }
    order.state = 'PAYING';
    this.state.driveThroughCheckoutProgress += deltaMs;
    if (this.state.driveThroughCheckoutProgress < GAME_CONFIG.driveThroughCheckoutTime) return;
    const amount = driveThroughValue(order);
    if (!this.economy.earn(amount)) return;
    this.state.driveThroughCheckoutProgress = 0;
    this.state.driveThroughServed += 1;
    this.state.totalServed += 1;
    awardXp(this.state, 5, this.emit);
    order.state = 'LEAVING';
    this.emit({ type: 'money', text: `+$${amount}`, ...GAME_CONFIG.driveThroughWindow });
    this.emit({ type: 'checkout', text: 'Drive-through served!', x: order.x, y: order.y });
  }

  update(deltaMs: number): void {
    if (this.state.upgrades.driveThrough < 1) {
      this.state.driveThroughSpawnElapsed = 0;
      this.state.driveThroughHandoffProgress = 0;
      this.state.driveThroughCheckoutProgress = 0;
      return;
    }
    this.state.driveThroughSpawnElapsed += deltaMs;
    if (this.state.driveThroughSpawnElapsed >= GAME_CONFIG.driveThroughSpawnInterval) {
      this.state.driveThroughSpawnElapsed %= GAME_CONFIG.driveThroughSpawnInterval;
      this.spawn();
    }
    const waiting = this.state.driveThroughOrders.filter((order) => order.state !== 'LEAVING');
    const departureInLane = this.state.driveThroughOrders.some(
      (order) => order.state === 'LEAVING' && order.x < 1505,
    );
    waiting.forEach((order, index) => {
      // Let the departing vehicle clear the single lane before the next order advances.
      const target =
        GAME_CONFIG.driveThroughVehicleSpot.x + (index + (departureInLane ? 2 : 0)) * 105;
      if (moveX(order, target, deltaMs) && index === 0 && order.state === 'ARRIVING')
        order.state = 'WAITING_FOR_ITEMS';
    });
    const active = waiting[0];
    if ((active?.id ?? null) !== this.activeId) {
      this.activeId = active?.id ?? null;
      this.state.driveThroughHandoffProgress = 0;
      this.state.driveThroughCheckoutProgress = 0;
    }
    if (active?.x === GAME_CONFIG.driveThroughVehicleSpot.x) this.updateService(active, deltaMs);
    for (const order of this.state.driveThroughOrders) {
      if (order.state === 'LEAVING') moveX(order, 1510, deltaMs);
    }
    this.state.driveThroughOrders = this.state.driveThroughOrders.filter(
      (order) => order.state !== 'LEAVING' || order.x < 1505,
    );
  }
}
