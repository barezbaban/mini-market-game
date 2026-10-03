import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import type { CustomerData, GameEvent, GameState } from '../types';
import { InventorySystem } from './InventorySystem';

export const CUSTOMER_PATIENCE_MS = 120000;
export const patienceRemaining = (customer: CustomerData): number =>
  Math.max(0, 1 - (customer.patienceElapsed ?? 0) / CUSTOMER_PATIENCE_MS);

/** Walking and actual payment never consume patience. Abandoned goods aren't destroyed. */
export class PatienceSystem {
  constructor(
    private readonly state: GameState,
    private readonly inventory: InventorySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    for (const customer of this.state.customers) {
      if (!['WAITING_FOR_PRODUCT', 'QUEUEING', 'SECOND_QUEUEING'].includes(customer.state))
        continue;
      customer.patienceElapsed = Math.min(
        CUSTOMER_PATIENCE_MS,
        (customer.patienceElapsed ?? 0) + deltaMs,
      );
      if (customer.patienceElapsed < CUSTOMER_PATIENCE_MS) continue;
      for (const { id } of PRODUCTS) this.state.returnedStock[id] += customer.basket[id];
      customer.basket = emptyItems();
      customer.unhappy = true;
      customer.state = 'LEAVING';
      // Leave via the front aisle, doorway and cart return; never disappear in-store.
      customer.path = [
        { x: customer.x, y: 450 },
        { x: 1000, y: 450 },
        { ...GAME_CONFIG.entrance },
        { ...GAME_CONFIG.entranceOutside },
        { ...GAME_CONFIG.cartStation },
        { ...GAME_CONFIG.customerExit },
      ];
      this.state.totalWalkouts++;
      this.emit({
        type: 'notice',
        text: 'A customer left unhappy. Restock shelves and keep checkout moving.',
        x: customer.x,
        y: customer.y,
      });
    }
    // If a shelf filled while someone queued, keep the excess safely until space opens.
    for (const { id } of PRODUCTS)
      if (this.state.returnedStock[id])
        this.inventory.stockFrom(id, this.state.returnedStock, this.state.returnedStock[id]);
  }
}
