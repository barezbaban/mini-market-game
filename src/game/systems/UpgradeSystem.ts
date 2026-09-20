import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import type { GameEvent, GameState, UpgradeId } from '../types';
import { EconomySystem } from './EconomySystem';

/** Derived values are rebuilt on load; saved capacities cannot grant free upgrades. */
export function applyUpgradeEffects(state: GameState): void {
  state.inventoryCapacity = GAME_CONFIG.playerStartCapacity + state.upgrades.inventory * 4;
  for (const product of PRODUCTS)
    state.shelfCapacities[product.id] =
      product.shelfCapacity + (product.id === 'tomato' ? state.upgrades.shelf * 4 : 0);
  state.unlockedProducts = PRODUCTS.filter(
    (product) => product.unlockCost === 0 || state.upgrades[product.id as UpgradeId] > 0,
  ).map((product) => product.id);
  state.cashier = state.upgrades.cashier > 0;
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
    if (!this.economy.spend(upgrade.cost)) {
      this.emit({
        type: 'notice',
        text: `Need $${upgrade.cost - this.state.money} more`,
        ...upgrade.position,
      });
      return false;
    }
    this.state.upgrades[id] += 1;
    applyUpgradeEffects(this.state);
    if (id === 'corn') this.state.farms.corn.ready = Math.max(1, this.state.farms.corn.ready);
    this.state.tutorialStep = Math.max(this.state.tutorialStep, 6);
    this.emit({ type: 'upgrade', text: upgrade.name, ...upgrade.position });
    return true;
  }
}
