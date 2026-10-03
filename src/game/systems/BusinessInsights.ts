import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, plotPosition } from '../data/products';
import { BUSINESS_MILESTONES, nextBusinessGoal } from '../data/career';
import { cartCapacity, UPGRADES, upgradeAvailable } from '../data/upgrades';
import type { GameState, UpgradeId, Vec2 } from '../types';

export function businessInsight(state: GameState): {
  title: string;
  detail: string;
  upgrades: UpgradeId[];
} {
  const waitingStock = state.customers.filter(
    (c) => c.state === 'WAITING_FOR_PRODUCT' && !state.shelves[c.targetProduct],
  ).length;
  const waitingPay = state.customers.filter((c) => ['QUEUEING', 'PAYING'].includes(c.state)).length;
  if (!state.totalServed)
    return {
      title: 'Make your first sale',
      detail: 'Harvest, fill a shelf, then stand beside checkout. Collect the cash afterward.',
      upgrades: ['inventory'],
    };
  if (!state.cashier)
    return {
      title: 'Checkout needs you',
      detail: 'A cashier frees you to harvest while customers pay.',
      upgrades: ['cashier', 'inventory'],
    };
  if (waitingStock)
    return {
      title: `${waitingStock} shopper${waitingStock === 1 ? '' : 's'} waiting for stock`,
      detail:
        'Restock first. Bigger helper baskets and useful staff priorities can help more than marketing.',
      upgrades: ['helpers', 'helperCapacity', 'helperSpeed'],
    };
  if (waitingPay >= 2)
    return {
      title: 'Checkout is the bottleneck',
      detail: 'A faster cashier clears payments. A second checkout becomes available at level 20.',
      upgrades: ['cashier', 'secondCashier'],
    };
  if (state.customers.length >= cartCapacity(state))
    return {
      title: 'All carts are in use',
      detail: 'More marketing cannot admit shoppers until a cart is free. Consider another cart.',
      upgrades: ['carts'],
    };
  if (!state.upgrades.helpers)
    return {
      title: 'Time for a helping hand',
      detail: 'A helper harvests and stocks while you plan your next department.',
      upgrades: ['helpers', 'inventory'],
    };
  return {
    title: 'Your shop has room to grow',
    detail:
      'Choose a contract or bring in more customers. Extra plots help when crops, not transport, are limiting you.',
    upgrades: ['customers', 'expansion', 'helperCapacity'],
  };
}

export function recommendedUpgrades(state: GameState): UpgradeId[] {
  return businessInsight(state)
    .upgrades.filter((id) => {
      const upgrade = UPGRADES.find((u) => u.id === id)!;
      return state.upgrades[id] < upgrade.maxLevel && upgradeAvailable(state, id);
    })
    .slice(0, 3);
}

export function guidanceTarget(state: GameState): { position: Vec2; label: string } | null {
  if (state.tutorialStep < 2) return { position: plotPosition('tomato', 0), label: 'Tomatoes' };
  if (state.tutorialStep === 2) {
    const item = PRODUCTS.find((p) => state.inventory[p.id] > 0);
    if (item) return { position: { x: item.shelf.x, y: item.shelf.y + 65 }, label: 'Stock shelf' };
    return { position: plotPosition('tomato', 0), label: 'Harvest' };
  }
  if (state.tutorialStep < 5) return { position: GAME_CONFIG.cashierSpot, label: 'Serve here' };
  if (state.tutorialStep === 5) return { position: GAME_CONFIG.storeCash, label: 'Collect cash' };
  if (
    BUSINESS_MILESTONES.some((m) => !state.career.claimed.includes(m.id) && m.progress(state) >= 1)
  )
    return null;
  const goal = nextBusinessGoal(state);
  return goal.target ? { position: goal.target, label: 'Next goal' } : null;
}
