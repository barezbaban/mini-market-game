import { GAME_CONFIG } from '../data/gameConfig';
import { emptyItems, productById } from '../data/products';
import type { CustomerData, GameState, ProductId, Vec2 } from '../types';
import { InventorySystem, itemCount } from './InventorySystem';

const COLORS = [0x739ebd, 0xe58b71, 0xa78bb7, 0xe7bd67, 0x78a68f, 0xd599ae];
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const isInQueue = (customer: CustomerData): boolean =>
  ['MOVING_TO_CHECKOUT', 'QUEUEING', 'PAYING'].includes(customer.state);
export const orderedQueue = (state: GameState): CustomerData[] =>
  state.customers.filter(isInQueue).sort((a, b) => (a.queueOrder ?? a.id) - (b.queueOrder ?? b.id));
export function queuePosition(index: number): Vec2 {
  const safe = Math.max(0, Math.min(GAME_CONFIG.customerMax - 1, index));
  return safe < 5
    ? { x: GAME_CONFIG.queueStart.x, y: GAME_CONFIG.queueStart.y + safe * GAME_CONFIG.queueSpacing }
    : {
        x: GAME_CONFIG.queueStart.x - 50,
        y: GAME_CONFIG.queueStart.y + (9 - safe) * GAME_CONFIG.queueSpacing,
      };
}

function move(customer: CustomerData, deltaMs: number): void {
  let remaining = (GAME_CONFIG.customerSpeed * deltaMs) / 1000;
  while (customer.path.length && remaining > 0) {
    const target = customer.path[0];
    const length = distance(customer, target);
    if (length <= remaining) {
      customer.x = target.x;
      customer.y = target.y;
      customer.path.shift();
      remaining -= length;
    } else {
      customer.x += ((target.x - customer.x) / length) * remaining;
      customer.y += ((target.y - customer.y) / length) * remaining;
      remaining = 0;
    }
  }
}

/** Shoppers follow explicit aisle routes, then occupy stable, ordered queue slots. */
export class CustomerSystem {
  private spawnElapsed: number;
  private nextId: number;
  private nextQueueOrder: number;
  private readonly queueIndices = new Map<number, number>();

  constructor(
    private readonly state: GameState,
    private readonly inventory: InventorySystem,
  ) {
    this.spawnElapsed =
      state.elapsed === 0
        ? GAME_CONFIG.customerSpawnInterval - 2000
        : state.elapsed % GAME_CONFIG.customerSpawnInterval;
    this.nextId = Math.max(
      state.totalServed + 1,
      ...state.customers.map((customer) => customer.id + 1),
    );
    this.nextQueueOrder = Math.max(
      1,
      ...state.customers.map((customer) => (customer.queueOrder ?? customer.id) + 1),
    );
    orderedQueue(state).forEach((customer, index) => this.queueIndices.set(customer.id, index));
  }

  private shoppersFor(id: ProductId): CustomerData[] {
    return this.state.customers
      .filter(
        (customer) =>
          customer.targetProduct === id &&
          ['ENTERING', 'MOVING_TO_SHELF', 'WAITING_FOR_PRODUCT'].includes(customer.state),
      )
      .sort((a, b) => a.id - b.id);
  }

  private shelfPosition(customer: CustomerData): Vec2 {
    const product = productById(customer.targetProduct)!;
    const index = Math.max(
      0,
      this.shoppersFor(product.id).findIndex((entry) => entry.id === customer.id),
    );
    return { x: product.shelf.x, y: product.shelf.y + 65 + index * 34 };
  }

  private routeToShelf(customer: CustomerData): void {
    const target = this.shelfPosition(customer);
    customer.state = 'MOVING_TO_SHELF';
    customer.path = [{ x: customer.x, y: 450 }, { x: target.x, y: 450 }, target];
  }

  private spawn(): void {
    if (this.state.customers.length >= GAME_CONFIG.customerMax) return;
    const choices = this.state.unlockedProducts.filter((id) => this.shoppersFor(id).length < 3);
    if (!choices.length) return;
    const id = this.nextId++;
    const available = choices.filter((product) => this.state.shelves[product] > 0);
    const targets = available.length ? available : choices;
    const customer: CustomerData = {
      id,
      ...GAME_CONFIG.entrance,
      state: 'ENTERING',
      targetProduct: targets[(id - 1) % targets.length],
      basket: emptyItems(),
      color: COLORS[(id - 1) % COLORS.length],
      waitTime: 0,
      path: [{ x: GAME_CONFIG.entrance.x, y: 450 }],
    };
    this.state.customers.push(customer);
  }

  private joinCheckout(customer: CustomerData): void {
    customer.state = 'MOVING_TO_CHECKOUT';
    customer.queueOrder = this.nextQueueOrder++;
    const queue = orderedQueue(this.state);
    const index = queue.findIndex((entry) => entry.id === customer.id);
    this.queueIndices.set(customer.id, index);
    const target = queuePosition(index);
    // Join each row from its outside aisle. A later arrival can reach its slot
    // first without occupying an earlier shopper's route through the line.
    const approachX = index < 5 ? 880 : 765;
    customer.path = [
      { x: customer.x, y: 450 },
      { x: approachX, y: 450 },
      { x: approachX, y: target.y },
      target,
    ];
    customer.waitTime = 0;
  }

  private shop(customer: CustomerData, deltaMs: number): void {
    const shoppers = this.shoppersFor(customer.targetProduct);
    const target = this.shelfPosition(customer);
    if (distance(customer, target) > 1) {
      customer.path = [target];
      move(customer, deltaMs);
      return;
    }
    // Only the shopper at the front can take stock; the others advance behind it.
    if (shoppers[0]?.id !== customer.id) return;
    const held = itemCount(customer.basket);
    const requested = held ? 1 : customer.id % 2 === 0 ? 2 : 1;
    const taken = this.inventory.takeFromShelf(
      customer.targetProduct,
      Math.min(2 - held, requested),
    );
    if (!taken) {
      const alternative = this.state.unlockedProducts.find(
        (id) =>
          id !== customer.targetProduct &&
          this.state.shelves[id] > 0 &&
          this.shoppersFor(id).length < 3,
      );
      if (customer.waitTime > 6000 && alternative) {
        customer.targetProduct = alternative;
        customer.waitTime = 0;
        this.routeToShelf(customer);
      }
      return;
    }
    customer.basket[customer.targetProduct] += taken;
    const second = this.state.unlockedProducts.find(
      (id) =>
        id !== customer.targetProduct &&
        this.state.shelves[id] > 0 &&
        this.shoppersFor(id).length < 3,
    );
    if (customer.id % 3 === 0 && itemCount(customer.basket) < 2 && second) {
      customer.targetProduct = second;
      customer.waitTime = 0;
      this.routeToShelf(customer);
    } else this.joinCheckout(customer);
  }

  update(deltaMs: number): void {
    const interval = GAME_CONFIG.customerSpawnInterval / (this.state.upgrades.customers ? 1.65 : 1);
    this.spawnElapsed += deltaMs;
    if (this.spawnElapsed >= interval) {
      this.spawnElapsed %= interval;
      this.spawn();
    }
    const queue = orderedQueue(this.state);
    for (const customer of [...this.state.customers]) {
      customer.waitTime += deltaMs;
      if (isInQueue(customer)) {
        const index = queue.findIndex((entry) => entry.id === customer.id);
        const target = queuePosition(index);
        const previous = this.queueIndices.get(customer.id);
        if (previous !== index) {
          if (customer.state === 'QUEUEING' || customer.state === 'PAYING')
            customer.path = [target];
          else if (customer.path.length) {
            if (previous !== undefined && previous >= 5 && index < 5) customer.path.push(target);
            else {
              customer.path[customer.path.length - 1] = target;
              const corner = customer.path[customer.path.length - 2];
              if (corner && (corner.x === 765 || corner.x === 880)) corner.y = target.y;
            }
          }
          this.queueIndices.set(customer.id, index);
          customer.state = 'MOVING_TO_CHECKOUT';
        }
        if (!customer.path.length && distance(customer, target) > 1) customer.path = [target];
        const before = {
          x: customer.x,
          y: customer.y,
          path: customer.path.map((point) => ({ ...point })),
        };
        move(customer, deltaMs);
        const obstruction = queue.find(
          (other) =>
            other.id !== customer.id &&
            distance(customer, other) < 26 &&
            distance(customer, other) < distance(before, other),
        );
        if (obstruction) {
          customer.x = before.x;
          customer.y = before.y;
          customer.path = before.path;
          if (
            (obstruction.queueOrder ?? obstruction.id) < (customer.queueOrder ?? customer.id) &&
            customer.state === 'MOVING_TO_CHECKOUT'
          ) {
            // Yield a little at merging aisles, so crossing paths cannot deadlock.
            const separation = distance(customer, obstruction) || 1;
            const step = (GAME_CONFIG.customerSpeed * deltaMs) / 1000;
            const yieldPoint = {
              x: customer.x + ((customer.x - obstruction.x) / separation) * step,
              y: customer.y + ((customer.y - obstruction.y) / separation) * step,
            };
            if (
              queue.every((other) => other.id === customer.id || distance(yieldPoint, other) >= 26)
            ) {
              customer.x = yieldPoint.x;
              customer.y = yieldPoint.y;
            }
          }
        }
        if (!customer.path.length && customer.state !== 'PAYING') customer.state = 'QUEUEING';
        if (index === 0 && customer.state === 'QUEUEING')
          this.state.tutorialStep = Math.max(this.state.tutorialStep, 4);
        continue;
      }
      if (customer.state === 'WAITING_FOR_PRODUCT') {
        this.shop(customer, deltaMs);
        continue;
      }
      if (customer.state === 'MOVING_TO_SHELF' && !customer.path.length)
        this.routeToShelf(customer);
      move(customer, deltaMs);
      if (customer.path.length) continue;
      if (customer.state === 'ENTERING') this.routeToShelf(customer);
      else if (customer.state === 'MOVING_TO_SHELF') {
        customer.state = 'WAITING_FOR_PRODUCT';
        customer.waitTime = 0;
      } else if (customer.state === 'LEAVING') {
        this.state.customers.splice(this.state.customers.indexOf(customer), 1);
        this.queueIndices.delete(customer.id);
      }
    }
  }
}
