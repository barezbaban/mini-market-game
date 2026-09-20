import { PRODUCTS } from '../data/products';
import type { GameState, ItemCounts, ProductId } from '../types';

export const itemCount = (items: ItemCounts): number =>
  PRODUCTS.reduce((total, product) => total + items[product.id], 0);

/** Transfers return the actual quantity moved, never creating or losing goods. */
export class InventorySystem {
  constructor(private readonly state: GameState) {}

  get total(): number {
    return itemCount(this.state.inventory);
  }
  get room(): number {
    return Math.max(0, this.state.inventoryCapacity - this.total);
  }

  harvest(id: ProductId, requested = 1): number {
    if (
      !this.state.unlockedProducts.includes(id) ||
      !Number.isSafeInteger(requested) ||
      requested <= 0
    )
      return 0;
    const quantity = Math.min(requested, this.room, this.state.farms[id].ready);
    this.state.farms[id].ready -= quantity;
    this.state.inventory[id] += quantity;
    this.state.totalHarvested += quantity;
    return quantity;
  }

  stock(id: ProductId, requested = 1): number {
    if (
      !this.state.unlockedProducts.includes(id) ||
      !Number.isSafeInteger(requested) ||
      requested <= 0
    )
      return 0;
    const quantity = Math.min(
      requested,
      this.state.inventory[id],
      Math.max(0, this.state.shelfCapacities[id] - this.state.shelves[id]),
    );
    this.state.inventory[id] -= quantity;
    this.state.shelves[id] += quantity;
    return quantity;
  }

  takeFromShelf(id: ProductId, requested = 1): number {
    if (
      !this.state.unlockedProducts.includes(id) ||
      !Number.isSafeInteger(requested) ||
      requested <= 0
    )
      return 0;
    const quantity = Math.min(requested, this.state.shelves[id]);
    this.state.shelves[id] -= quantity;
    return quantity;
  }
}
