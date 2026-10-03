import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import {
  UPGRADES,
  upgradeAvailable,
  upgradeCost,
  requiredPlayerLevel,
  requiredOrders,
  playerLevel,
  SHELF_COLUMNS,
} from '../data/upgrades';
import type { GameEvent, GameState, UpgradeId, WorkerData } from '../types';
import { EconomySystem } from './EconomySystem';
import { refreshFarmTotals } from './FarmingSystem';

export function createWorker(id: number): WorkerData {
  const position = { x: GAME_CONFIG.helperHub.x + (id - 1) * 22, y: GAME_CONFIG.helperHub.y };
  return {
    id,
    ...position,
    basket: emptyItems(),
    task: 'idle',
    product: null,
    target: { ...position },
    path: [],
    actionElapsed: 0,
    priority: 'balanced',
  };
}

/** Hiring adds workers; level upgrades preserve all existing workers and their baskets. */
export function syncWorkers(state: GameState): void {
  const desired = Math.min(3, state.upgrades.helpers);
  while (state.workers.length < desired) {
    const id = Math.max(0, ...state.workers.map((worker) => worker.id)) + 1;
    state.workers.push(createWorker(id));
  }
}

export function applyUpgradeEffects(state: GameState): void {
  state.inventoryCapacity = GAME_CONFIG.playerStartCapacity + state.upgrades.inventory * 4;
  for (const product of PRODUCTS)
    state.shelfCapacities[product.id] =
      product.shelfCapacity + state.upgrades.shelf * SHELF_COLUMNS;
  state.unlockedProducts = PRODUCTS.filter(
    (product) =>
      product.area <= state.upgrades.expansion &&
      (!product.unlockUpgrade || state.upgrades[product.unlockUpgrade] > 0),
  ).map((product) => product.id);
  state.cashier = state.upgrades.cashier > 0;
  syncWorkers(state);
  refreshFarmTotals(state);
}

export class UpgradeSystem {
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  purchase(id: UpgradeId): boolean {
    const upgrade = UPGRADES.find((entry) => entry.id === id);
    if (!upgrade || this.state.upgrades[id] >= upgrade.maxLevel) return false;
    if (!upgradeAvailable(this.state, id)) {
      this.emit({
        type: 'notice',
        text:
          playerLevel(this.state.xp) < requiredPlayerLevel(this.state, id)
            ? `Reach player level ${requiredPlayerLevel(this.state, id)} to unlock this upgrade`
            : this.state.totalServed < requiredOrders(this.state, id)
              ? `Complete ${requiredOrders(this.state, id)} paid orders before opening this service`
              : 'Unlock the required area or staff first',
        ...upgrade.position,
      });
      return false;
    }
    const cost = upgradeCost(this.state, id);
    if (!this.economy.spend(cost)) {
      this.emit({
        type: 'notice',
        text: `Need $${cost - this.state.money} more`,
        ...upgrade.position,
      });
      return false;
    }
    this.state.upgrades[id] += 1;
    if (id === 'accountant' && this.state.upgrades.accountant === 1)
      this.state.career.accountantCheckpoint = this.state.totalServed;
    this.state.career.firstActions.upgrade ??= this.state.elapsed;
    if (id === 'driveThrough')
      this.state.driveThroughSpawnElapsed = GAME_CONFIG.driveThroughSpawnInterval - 2500;
    applyUpgradeEffects(this.state);
    this.state.tutorialStep = Math.max(this.state.tutorialStep, 6);
    this.emit({
      type: 'upgrade',
      text: `${upgrade.name} · level ${this.state.upgrades[id]}`,
      ...upgrade.position,
    });
    return true;
  }
}
