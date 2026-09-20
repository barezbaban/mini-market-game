import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems, productById } from '../data/products';
import type { CustomerData, GameState, ProductId, Vec2 } from '../types';
import { InventorySystem, itemCount } from './InventorySystem';

const COLORS = [0x739ebd, 0xe58b71, 0xa78bb7, 0xe7bd67, 0x78a68f, 0xd599ae];
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const isInQueue = (customer: CustomerData): boolean =>
  ['MOVING_TO_CHECKOUT', 'QUEUEING', 'PAYING'].includes(customer.state);
export const orderedQueue = (state: GameState): CustomerData[] =>
  state.customers.filter(isInQueue).sort((a, b) => (a.queueOrder ?? a.id) - (b.queueOrder ?? b.id));
export const remainingCustomerNeed = (customer: CustomerData): number =>
  Math.max(
    0,
    Math.min(
      2 - itemCount(customer.basket),
      customer.targetQuantity - customer.basket[customer.targetProduct],
    ),
  );
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
  // Arrival and departure routes include a long exterior approach. Moving a
  // little faster there keeps store throughput unchanged while the shopper is
  // still visibly walking; all in-store movement stays at the normal speed.
  const exteriorMultiplier = ['ENTERING', 'LEAVING'].includes(customer.state)
    ? GAME_CONFIG.customerExteriorSpeedMultiplier
    : 1;
  let remaining = (GAME_CONFIG.customerSpeed * exteriorMultiplier * deltaMs) / 1000;
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

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
      )
    : 0;
  return Math.hypot(point.x - start.x - dx * fraction, point.y - start.y - dy * fraction);
}

function distanceToApproach(point: Vec2, customer: CustomerData): number {
  let start: Vec2 = customer;
  let remaining = 70;
  let closest = Infinity;
  for (const waypoint of customer.path) {
    const length = distance(start, waypoint);
    const fraction = length ? Math.min(1, remaining / length) : 1;
    const end = {
      x: start.x + (waypoint.x - start.x) * fraction,
      y: start.y + (waypoint.y - start.y) * fraction,
    };
    closest = Math.min(closest, distanceToSegment(point, start, end));
    remaining -= length;
    if (remaining <= 0) break;
    start = waypoint;
  }
  return closest;
}

function crossesSolid(
  start: Vec2,
  end: Vec2,
  left: number,
  right: number,
  top: number,
  bottom: number,
): boolean {
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, low, high] of [
    [start.x, end.x - start.x, left + 1e-6, right - 1e-6],
    [start.y, end.y - start.y, top + 1e-6, bottom - 1e-6],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < low || origin > high) return false;
    } else {
      const first = (low - origin) / delta;
      const second = (high - origin) / delta;
      enter = Math.max(enter, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (enter >= exit) return false;
    }
  }
  return enter < exit;
}

/** Shoppers follow explicit aisle routes, then occupy stable, ordered queue slots. */
export class CustomerSystem {
  private spawnElapsed: number;
  private nextId: number;
  private nextQueueOrder: number;
  private readonly queueIndices = new Map<number, number>();
  private readonly yielding = new Map<number, { earlierId: number; anchor: Vec2 }>();
  private readonly blockedElapsed = new Map<number, number>();

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
      ...GAME_CONFIG.customerSpawn,
      state: 'ENTERING',
      targetProduct: targets[(id - 1) % targets.length],
      targetQuantity: id % 2 === 0 ? 2 : 1,
      basket: emptyItems(),
      color: COLORS[(id - 1) % COLORS.length],
      waitTime: 0,
      path: [
        { ...GAME_CONFIG.entranceOutside },
        { ...GAME_CONFIG.entrance },
        { x: GAME_CONFIG.entrance.x, y: 450 },
      ],
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
    const requested = remainingCustomerNeed(customer);
    if (!requested) {
      this.joinCheckout(customer);
      return;
    }
    const taken = this.inventory.takeFromShelf(customer.targetProduct, requested);
    if (!taken) {
      const alternative = this.state.unlockedProducts.find(
        (id) =>
          id !== customer.targetProduct &&
          this.state.shelves[id] > 0 &&
          this.shoppersFor(id).length < 3,
      );
      if (customer.waitTime > 6000 && alternative) {
        const remaining = requested;
        customer.targetProduct = alternative;
        customer.targetQuantity = remaining;
        customer.waitTime = 0;
        this.routeToShelf(customer);
      } else if (customer.waitTime > 6000 && itemCount(customer.basket) > 0)
        this.joinCheckout(customer);
      return;
    }
    customer.basket[customer.targetProduct] += taken;
    if (remainingCustomerNeed(customer) > 0) return;
    const second = this.state.unlockedProducts.find(
      (id) =>
        id !== customer.targetProduct &&
        this.state.shelves[id] > 0 &&
        this.shoppersFor(id).length < 3,
    );
    if (customer.id % 3 === 0 && itemCount(customer.basket) < 2 && second) {
      customer.targetProduct = second;
      customer.targetQuantity = 1;
      customer.waitTime = 0;
      this.routeToShelf(customer);
    } else this.joinCheckout(customer);
  }

  private yieldToEarlier(
    customer: CustomerData,
    index: number,
    queue: CustomerData[],
    deltaMs: number,
  ): boolean {
    const reservation = this.yielding.get(customer.id);
    const reservedEarlier =
      reservation && queue.slice(0, index).find((other) => other.id === reservation.earlierId);
    let reservationActive = Boolean(
      reservation &&
      reservedEarlier?.path[0] &&
      distance(reservation.anchor, reservedEarlier) < 70 &&
      distanceToApproach(reservation.anchor, reservedEarlier) < 30,
    );
    if (!reservationActive) this.yielding.delete(customer.id);
    const approaching = queue.slice(0, index).find((other) => {
      return (
        other.path.length &&
        distance(customer, other) < 60 &&
        distanceToApproach(customer, other) < 28
      );
    });
    const earlier =
      reservationActive &&
      reservedEarlier &&
      (!approaching || queue.indexOf(reservedEarlier) < queue.indexOf(approaching))
        ? reservedEarlier
        : approaching;
    // A reservation for a later shopper cannot take priority over the queue head.
    reservationActive = reservationActive && earlier?.id === reservedEarlier?.id;
    if (!reservationActive) this.yielding.delete(customer.id);
    if (!earlier) return false;
    const step = (GAME_CONFIG.customerSpeed * deltaMs) / 1000;
    const direction = index < 5 ? 1 : -1;
    // Reserve the passing space until the older shopper clears the original
    // crossing point; returning to the slot immediately would cause oscillation.
    if (reservationActive && distanceToApproach(customer, earlier) >= 28) return true;
    const candidates = [
      { x: direction, y: 0 },
      { x: customer.x - earlier.x, y: customer.y - earlier.y },
      { x: direction, y: 1 },
      { x: direction, y: -1 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    let best: Vec2 | undefined;
    let clearance = distanceToApproach(customer, earlier);
    for (const vector of candidates) {
      const length = Math.hypot(vector.x, vector.y) || 1;
      const point = {
        x: customer.x + (vector.x / length) * step,
        y: customer.y + (vector.y / length) * step,
      };
      const candidateClearance = distanceToApproach(point, earlier);
      if (
        candidateClearance <= clearance ||
        queue.some((other) => other.id !== customer.id && distance(point, other) < 26)
      )
        continue;
      best = point;
      clearance = candidateClearance;
    }
    if (!best) return false;
    if (!reservationActive)
      this.yielding.set(customer.id, {
        earlierId: earlier.id,
        anchor: { x: customer.x, y: customer.y },
      });
    customer.x = best.x;
    customer.y = best.y;
    // Keep the assigned slot as the destination, so the shopper returns after the earlier one passes.
    if (!customer.path.length) customer.path = [queuePosition(index)];
    customer.state = 'MOVING_TO_CHECKOUT';
    return true;
  }

  /** Find a physical route around a stationary crowd when local yielding has no exit. */
  private routeAroundCrowd(customer: CustomerData, target: Vec2, queue: CustomerData[]): boolean {
    const obstacles = queue.filter((other) => other.id !== customer.id);
    const clear = (start: Vec2, end: Vec2): boolean =>
      obstacles.every((other) => distanceToSegment(other, start, end) >= 26) &&
      !crossesSolid(start, end, 863, 937, 172, 260) &&
      PRODUCTS.every(
        (product) =>
          !crossesSolid(
            start,
            end,
            product.shelf.x - 78,
            product.shelf.x + 78,
            product.shelf.y - 43,
            product.shelf.y + 44,
          ),
      );
    if (!clear(target, target)) return false;
    const nodes: Vec2[] = [{ x: customer.x, y: customer.y }, target];
    const right = GAME_CONFIG.areaBounds[this.state.upgrades.expansion];
    // Eight points on a 30-unit circle leave every connecting chord outside the
    // 26-unit collision radius. Intersecting circles discard their inner points.
    for (const obstacle of obstacles) {
      for (let direction = 0; direction < 8; direction += 1) {
        const angle = (direction * Math.PI) / 4;
        const point = {
          x: obstacle.x + Math.cos(angle) * 30,
          y: obstacle.y + Math.sin(angle) * 30,
        };
        if (
          point.x < GAME_CONFIG.bounds.left ||
          point.x > right ||
          point.y < GAME_CONFIG.bounds.top ||
          point.y > GAME_CONFIG.bounds.bottom ||
          !clear(point, point)
        )
          continue;
        nodes.push(point);
      }
    }
    const costs = nodes.map(() => Infinity);
    const previous = nodes.map(() => -1);
    const visited = new Set<number>();
    costs[0] = 0;
    while (visited.size < nodes.length) {
      let next = -1;
      for (let index = 0; index < nodes.length; index += 1)
        if (
          !visited.has(index) &&
          Number.isFinite(costs[index]) &&
          (next < 0 || costs[index] < costs[next])
        )
          next = index;
      if (next < 0) return false;
      if (next === 1) {
        const route: Vec2[] = [];
        for (let index = 1; index !== 0; index = previous[index])
          route.unshift({ ...nodes[index] });
        customer.path = route;
        return true;
      }
      visited.add(next);
      for (let index = 0; index < nodes.length; index += 1) {
        if (visited.has(index)) continue;
        const cost = costs[next] + distance(nodes[next], nodes[index]);
        if (cost >= costs[index] || !clear(nodes[next], nodes[index])) continue;
        costs[index] = cost;
        previous[index] = next;
      }
    }
    return false;
  }

  update(deltaMs: number): void {
    const interval = GAME_CONFIG.customerSpawnInterval / (1 + this.state.upgrades.customers * 0.2);
    this.spawnElapsed += deltaMs;
    if (this.spawnElapsed >= interval) {
      this.spawnElapsed %= interval;
      this.spawn();
    }
    const queue = orderedQueue(this.state);
    for (const customer of [
      ...queue,
      ...this.state.customers.filter((entry) => !isInQueue(entry)),
    ]) {
      customer.waitTime += deltaMs;
      if (isInQueue(customer)) {
        const index = queue.findIndex((entry) => entry.id === customer.id);
        const target = queuePosition(index);
        const previous = this.queueIndices.get(customer.id);
        if (previous !== index) {
          // Append each vacated slot instead of rewriting the previous endpoint.
          // In particular, the left-to-right bend must survive several rapid sales.
          if (previous !== undefined && previous > index) {
            for (let slot = previous - 1; slot >= index; slot -= 1)
              customer.path.push(queuePosition(slot));
          } else customer.path = [target];
          this.queueIndices.set(customer.id, index);
          customer.state = 'MOVING_TO_CHECKOUT';
        }
        if (!customer.path.length && distance(customer, target) > 1) customer.path = [target];
        if (this.yieldToEarlier(customer, index, queue, deltaMs)) continue;
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
          if (index === 0) {
            const blocked = (this.blockedElapsed.get(customer.id) ?? 0) + deltaMs;
            this.blockedElapsed.set(customer.id, blocked);
            if (blocked >= 250) {
              this.routeAroundCrowd(customer, target, queue);
              this.blockedElapsed.set(customer.id, 0);
            }
          }
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
        } else this.blockedElapsed.delete(customer.id);
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
        this.yielding.delete(customer.id);
        this.blockedElapsed.delete(customer.id);
      }
    }
  }
}
