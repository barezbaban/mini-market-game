import { BUSINESS_MILESTONES, createCareer, REGULARS, SHOP_STYLES } from '../data/career';
import { MACHINES } from '../data/machines';
import { PRODUCTS, emptyItems } from '../data/products';
import type { CareerState, GameState, ProductId, WorkerPriority } from '../types';

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const count = (v: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(max, Math.floor(v)))
    : fallback;
export function workerPriority(value: unknown, state: GameState): WorkerPriority {
  return value === 'shelves' ||
    value === 'machines' ||
    (typeof value === 'string' && state.unlockedProducts.includes(value as ProductId))
    ? (value as WorkerPriority)
    : 'balanced';
}
export function validateCareer(value: unknown, state: GameState): CareerState {
  const raw = object(value),
    result = createCareer();
  result.contractsCompleted = count(raw.contractsCompleted);
  result.accountantCheckpoint = count(
    raw.accountantCheckpoint,
    state.totalServed,
    state.totalServed,
  );
  result.claimed = BUSINESS_MILESTONES.filter(
    (m) => Array.isArray(raw.claimed) && raw.claimed.includes(m.id),
  ).map((m) => m.id);
  for (const { id } of PRODUCTS) {
    result.sold[id] = count(object(raw.sold)[id]);
    result.stockTargets[id] = count(object(raw.stockTargets)[id], 6, state.shelfCapacities[id]);
  }
  for (const { id } of REGULARS) result.regularVisits[id] = count(object(raw.regularVisits)[id]);
  for (const { id } of MACHINES) {
    const policy = object(raw.machinePolicies)[id];
    if (policy === 'shelf-first' || policy === 'processing-first' || policy === 'paused')
      result.machinePolicies[id] = policy;
    result.batchModes[id] = object(raw.batchModes)[id] === 'full' ? 'full' : 'quick';
  }
  const style = SHOP_STYLES.find(
    (s) => s.id === raw.style && s.contracts <= result.contractsCompleted,
  );
  result.style = style?.id ?? 'classic';
  for (const key of ['harvest', 'stock', 'sale', 'cash', 'upgrade']) {
    const value = object(raw.firstActions)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      result.firstActions[key] = Math.min(value, state.elapsed);
  }
  const contract = object(raw.contract);
  if (
    ['produce', 'variety', 'drive'].includes(String(contract.kind)) &&
    (contract.kind !== 'drive' || state.upgrades.driveThrough)
  ) {
    const goals = emptyItems(),
      baseline = emptyItems();
    for (const { id } of PRODUCTS) {
      goals[id] = state.unlockedProducts.includes(id)
        ? count(object(contract.goals)[id], 0, 100)
        : 0;
      baseline[id] = count(object(contract.baseline)[id], result.sold[id], result.sold[id]);
    }
    if (contract.kind === 'drive' || Object.values(goals).some((n) => n > 0))
      result.contract = {
        kind: contract.kind as NonNullable<CareerState['contract']>['kind'],
        goals,
        baseline,
        ordersAtStart: count(
          contract.ordersAtStart,
          state.driveThroughServed,
          state.driveThroughServed,
        ),
        targetOrders: Math.max(1, count(contract.targetOrders, 8, 100)),
        rewardMoney: count(contract.rewardMoney, 0, 1000),
        rewardXp: count(contract.rewardXp, 0, 500),
      };
  }
  return result;
}
