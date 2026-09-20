export type ProductId = 'tomato' | 'egg' | 'corn';
export type UpgradeId = 'shelf' | 'inventory' | 'customers' | 'corn' | 'cashier';
export interface Vec2 { x: number; y: number }
export type ItemCounts = Record<ProductId, number>;
export interface ProductDefinition {
  id: ProductId; name: string; plural: string; icon: string; productionTime: number;
  sellingPrice: number; shelfCapacity: number; unlockCost: number; sprite: string;
  color: number; shelf: Vec2; farm: Vec2;
}
export interface UpgradeDefinition {
  id: UpgradeId; name: string; description: string; cost: number; type: string;
  maxLevel: number; position: Vec2; icon: string;
}
export interface FarmState { ready: number; elapsed: number }
export type CustomerState = 'ENTERING' | 'MOVING_TO_SHELF' | 'WAITING_FOR_PRODUCT' | 'MOVING_TO_CHECKOUT' | 'QUEUEING' | 'PAYING' | 'LEAVING';
export interface CustomerData {
  id: number; x: number; y: number; state: CustomerState; targetProduct: ProductId;
  basket: ItemCounts; color: number; waitTime: number; path: Vec2[];
}
export interface GameState {
  version: 1; money: number; inventory: ItemCounts; inventoryCapacity: number;
  shelves: ItemCounts; shelfCapacities: ItemCounts; farms: Record<ProductId, FarmState>;
  unlockedProducts: ProductId[]; upgrades: Record<UpgradeId, number>; cashier: boolean;
  player: Vec2; customers: CustomerData[]; checkoutProgress: number;
  upgradeProgress: number; activeUpgrade: UpgradeId | null;
  tutorialStep: number; totalEarned: number; totalServed: number; totalHarvested: number;
  elapsed: number; soundEnabled: boolean;
}
export interface GameEvent { type: 'harvest' | 'stock' | 'money' | 'upgrade' | 'notice' | 'checkout'; text: string; x: number; y: number }
export interface SaveRepository { read(): string | null; write(value: string): void; clear(): void }
