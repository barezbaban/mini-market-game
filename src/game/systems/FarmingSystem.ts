import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, plotCount } from '../data/products';
import type { GameState, ProductId } from '../types';

/** Plot buffers are authoritative; these aliases keep the HUD and saved totals useful. */
export function refreshFarmTotals(state: GameState, id?: ProductId): void {
  for (const product of PRODUCTS) {
    if (id && product.id !== id) continue;
    const farm = state.farms[product.id];
    const count = plotCount(state, product.id);
    farm.ready = farm.plots.slice(0, count).reduce((total, plot) => total + plot.ready, 0);
    farm.elapsed = count ? (farm.plots[0]?.elapsed ?? 0) : 0;
  }
}

export class FarmingSystem {
  constructor(private readonly state: GameState) {}

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    for (const product of PRODUCTS) {
      for (const plot of this.state.farms[product.id].plots.slice(
        0,
        plotCount(this.state, product.id),
      )) {
        if (plot.ready >= GAME_CONFIG.farmCapacity) {
          plot.elapsed = 0;
          continue;
        }
        plot.elapsed += deltaMs;
        const batches = Math.floor(plot.elapsed / product.productionTime);
        plot.ready = Math.min(
          GAME_CONFIG.farmCapacity,
          plot.ready + batches * product.yieldPerPlot,
        );
        plot.elapsed =
          plot.ready === GAME_CONFIG.farmCapacity ? 0 : plot.elapsed % product.productionTime;
      }
    }
    refreshFarmTotals(this.state);
  }
}
