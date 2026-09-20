import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import type { GameState } from '../types';

export class FarmingSystem {
  constructor(private readonly state: GameState) {}

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    for (const product of PRODUCTS) {
      if (!this.state.unlockedProducts.includes(product.id)) continue;
      const farm = this.state.farms[product.id];
      if (farm.ready >= GAME_CONFIG.farmCapacity) {
        farm.elapsed = 0;
        continue;
      }
      farm.elapsed += deltaMs;
      const grown = Math.min(
        GAME_CONFIG.farmCapacity - farm.ready,
        Math.floor(farm.elapsed / product.productionTime),
      );
      farm.ready += grown;
      farm.elapsed =
        farm.ready === GAME_CONFIG.farmCapacity ? 0 : farm.elapsed % product.productionTime;
    }
  }
}
