import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import { UPGRADES, upgradeAvailable, upgradeCost } from '../data/upgrades';
import type { GameEvent, GameState, UpgradeId, WorkerData } from '../types';
import { EconomySystem } from './EconomySystem';
import { refreshFarmTotals } from './FarmingSystem';

export function createWorker(id: number): WorkerData {
  const position = { x: 965 + (id - 1) * 22, y: 480 };
  return {
    id,
    ...position,
    basket: emptyItems(),
    task: 'idle',
    product: null,
    target: { ...position },
    path: [],
    actionElapsed: 0,
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
  for (const product of PRODUCTS) state.shelfCapacities[product.id] = product.shelfCapacity;
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
    if (!upgrade || id === 'shelf' || this.state.upgrades[id] >= upgrade.maxLevel) return false;
    if (!upgradeAvailable(this.state, id)) {
      this.emit({
        type: 'notice',
        text: 'Unlock the required area or staff first',
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
