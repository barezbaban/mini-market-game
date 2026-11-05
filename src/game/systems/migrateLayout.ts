import { shelfStandSpot } from '../data/standSpots';
import { GAME_CONFIG } from '../data/gameConfig';
import { cashPosition } from '../data/cashPoints';
import { productById } from '../data/products';
import type { GameState } from '../types';
import { orderedQueue, queuePosition } from './CustomerSystem';
import { exitRoute, repairWalk, walkRoute } from './Navigation';

/** The perimeter remodel only moves shelves. Preserve the rest of a running market. */
export function migrateShelfRoutes(state: GameState): void {
  const player = { ...state.player, path: [] };
  repairWalk(state, player);
  state.player = { x: player.x, y: player.y };
  for (const worker of state.workers) repairWalk(state, worker);
  const shoppers = [...state.customers].sort((a, b) => a.id - b.id);
  const slots = new Map<string, number>();
  for (const customer of shoppers) {
    repairWalk(state, customer);
    if (!['ENTERING', 'MOVING_TO_SHELF', 'WAITING_FOR_PRODUCT'].includes(customer.state)) continue;
    const slot = slots.get(customer.targetProduct) ?? 0;
    slots.set(customer.targetProduct, slot + 1);
    if (customer.state === 'ENTERING') continue;
    const target = shelfStandSpot(productById(customer.targetProduct)!, 75 + slot * 34);
    customer.state = 'MOVING_TO_SHELF';
    customer.path = walkRoute(state, customer, target);
  }
  if (state.security.thief) repairWalk(state, state.security.thief);
  if (state.security.police) repairWalk(state, state.security.police);
}

/** One-time relocation only. Balances, goods, purchases, XP and encounter outcomes stay intact. */
export function migrateLayout(state: GameState): void {
  state.player = { ...GAME_CONFIG.playerStart };
  state.workers.forEach((worker, index) => {
    Object.assign(worker, { x: GAME_CONFIG.helperHub.x + index * 25, y: GAME_CONFIG.helperHub.y });
    worker.target = { x: worker.x, y: worker.y };
    worker.path = [];
    worker.task = 'idle';
    worker.actionElapsed = 0;
  });
  const queue = orderedQueue(state);
  const shelfWaiters = new Map<string, number>();
  state.customers.forEach((customer, index) => {
    const queueIndex = queue.indexOf(customer);
    if (queueIndex >= 0) {
      Object.assign(customer, queuePosition(queueIndex));
      if (customer.state !== 'PAYING') customer.state = 'QUEUEING';
      customer.path = [];
    } else if (
      ['MOVING_TO_SECOND_CHECKOUT', 'SECOND_QUEUEING', 'SECOND_PAYING'].includes(customer.state)
    ) {
      Object.assign(customer, GAME_CONFIG.secondQueueStart);
      if (customer.state !== 'SECOND_PAYING') customer.state = 'SECOND_QUEUEING';
      customer.path = [];
    } else if (customer.state === 'LEAVING') {
      Object.assign(customer, { x: 640 + index * 12, y: 835 });
      customer.path = exitRoute(state, customer);
    } else if (customer.state === 'ENTERING') {
      Object.assign(customer, {
        x: GAME_CONFIG.customerSpawn.x - index * 30,
        y: GAME_CONFIG.customerSpawn.y,
      });
      customer.path = [
        { ...GAME_CONFIG.cartStation },
        { ...GAME_CONFIG.entranceOutside },
        { ...GAME_CONFIG.entrance },
      ];
    } else {
      const slot = shelfWaiters.get(customer.targetProduct) ?? 0;
      shelfWaiters.set(customer.targetProduct, slot + 1);
      const product = productById(customer.targetProduct)!;
      Object.assign(customer, shelfStandSpot(product, 75 + slot * 34));
      customer.state = 'WAITING_FOR_PRODUCT';
      customer.path = [];
    }
  });
  state.driveThroughOrders.forEach((order, index) => {
    order.x =
      GAME_CONFIG.driveThroughVehicleSpot.x + (order.state === 'LEAVING' ? -140 : index * 130);
    order.y = GAME_CONFIG.driveThroughVehicleSpot.y;
  });
  const thief = state.security.thief;
  if (thief) {
    Object.assign(thief, cashPosition(thief.target));
    if (thief.phase === 'APPROACHING') {
      Object.assign(thief, GAME_CONFIG.entranceOutside);
      thief.path = walkRoute(state, thief, cashPosition(thief.target));
    } else if (thief.phase === 'FLEEING') thief.path = exitRoute(state, thief);
    else thief.path = [];
    if (state.security.police) {
      Object.assign(state.security.police, { x: thief.x + 25, y: thief.y });
      state.security.police.path =
        thief.phase === 'ESCORTED' ? exitRoute(state, state.security.police) : [];
    }
  }
}
