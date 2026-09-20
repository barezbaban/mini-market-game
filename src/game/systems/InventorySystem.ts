import { PRODUCTS, plotCount, productById } from '../data/products';
import type { GameState, ItemCounts, ProductId } from '../types';
import { refreshFarmTotals } from './FarmingSystem';

export const itemCount = (items: ItemCounts): number =>
  PRODUCTS.reduce((total, product) => total + items[product.id], 0);
const validQuantity = (quantity: number): boolean => Number.isSafeInteger(quantity) && quantity > 0;

/** Every actor uses the same capacity-checked transfers; no items are minted here. */
export class InventorySystem {
  constructor(private readonly state: GameState) {}
  get total(): number {
    return itemCount(this.state.inventory);
  }
  get room(): number {
    return Math.max(0, this.state.inventoryCapacity - this.total);
  }

  discardAll(): number {
    const discarded = this.total;
    PRODUCTS.forEach(({ id }) => {
      this.state.inventory[id] = 0;
    });
    return discarded;
  }

  harvest(id: ProductId, requested = 1, plotIndex?: number): number {
    return this.harvestInto(
      id,
      this.state.inventory,
      this.state.inventoryCapacity,
      requested,
      plotIndex,
    );
  }

  harvestInto(
    id: ProductId,
    actor: ItemCounts,
    capacity: number,
    requested = 1,
    plotIndex?: number,
  ): number {
    const product = productById(id);
    if (
      !product ||
      product.kind !== 'farm' ||
      !validQuantity(requested) ||
      !validQuantity(capacity)
    )
      return 0;
    const count = plotCount(this.state, id);
    if (
      !count ||
      (plotIndex !== undefined &&
        (!Number.isSafeInteger(plotIndex) || plotIndex < 0 || plotIndex >= count))
    )
      return 0;
    let remaining = Math.min(requested, Math.max(0, capacity - itemCount(actor)));
    let harvested = 0;
    const plots = this.state.farms[id].plots;
    for (let index = 0; index < count && remaining > 0; index += 1) {
      if (plotIndex !== undefined && index !== plotIndex) continue;
      const taken = Math.min(remaining, plots[index].ready);
      plots[index].ready -= taken;
      remaining -= taken;
      harvested += taken;
    }
    actor[id] += harvested;
    this.state.totalHarvested += harvested;
    refreshFarmTotals(this.state, id);
    return harvested;
  }

  stock(id: ProductId, requested = 1): number {
    return this.stockFrom(id, this.state.inventory, requested);
  }

  stockFrom(id: ProductId, actor: ItemCounts, requested = 1): number {
    if (!this.state.unlockedProducts.includes(id) || !validQuantity(requested)) return 0;
    const quantity = Math.min(
      requested,
      actor[id],
      Math.max(0, this.state.shelfCapacities[id] - this.state.shelves[id]),
    );
    actor[id] -= quantity;
    this.state.shelves[id] += quantity;
    return quantity;
  }

  takeFromShelf(id: ProductId, requested = 1): number {
    if (!this.state.unlockedProducts.includes(id) || !validQuantity(requested)) return 0;
    const quantity = Math.min(requested, this.state.shelves[id]);
    this.state.shelves[id] -= quantity;
    return quantity;
  }
}
