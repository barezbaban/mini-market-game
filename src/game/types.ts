export type ProductId =
  'tomato' | 'egg' | 'corn' | 'coffee' | 'carrot' | 'tomatoPaste' | 'groundCoffee';
export type MachineId = 'paste' | 'coffee';
export type UpgradeId =
  | 'shelf'
  | 'inventory'
  | 'customers'
  | 'corn'
  | 'cashier'
  | 'expansion'
  | 'tomatoPlots'
  | 'eggPlots'
  | 'cornPlots'
  | 'coffeePlots'
  | 'carrotPlots'
  | 'pasteMachine'
  | 'coffeeMachine'
  | 'helpers'
  | 'helperCapacity'
  | 'helperSpeed'
  | 'accountant';
export interface Vec2 {
  x: number;
  y: number;
}
export type ItemCounts = Record<ProductId, number>;
export interface ProductDefinition {
  id: ProductId;
  name: string;
  plural: string;
  icon: string;
  productionTime: number;
  sellingPrice: number;
  shelfCapacity: number;
  unlockCost: number;
  sprite: string;
  color: number;
  shelf: Vec2;
  farm: Vec2;
  kind: 'farm' | 'processed';
  area: number;
  maxPlots: number;
  yieldPerPlot: number;
  plotUpgrade?: UpgradeId;
  unlockUpgrade?: UpgradeId;
}
export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  type: string;
  maxLevel: number;
  position: Vec2;
  icon: string;
  category: 'farms' | 'machines' | 'staff' | 'store';
  costGrowth: number;
  requires?: Partial<Record<UpgradeId, number>>;
  inWorld?: boolean;
}
export interface FarmPlotState {
  ready: number;
  elapsed: number;
}
export interface FarmState {
  ready: number;
  elapsed: number;
  plots: FarmPlotState[];
}
export interface MachineDefinition {
  id: MachineId;
  name: string;
  input: ProductId;
  output: ProductId;
  position: Vec2;
  upgrade: UpgradeId;
  batchMs: number;
  bufferCapacity: number;
  area: number;
}
export interface MachineState {
  input: number;
  output: number;
  processing: number;
  elapsed: number;
}
export interface WorkerData {
  id: number;
  x: number;
  y: number;
  basket: ItemCounts;
  task: 'idle' | 'harvest' | 'stock' | 'supply' | 'collect';
  product: ProductId | null;
  target: Vec2;
  plotIndex?: number;
  machine?: MachineId;
  path: Vec2[];
  actionElapsed: number;
}
export type CustomerState =
  | 'ENTERING'
  | 'MOVING_TO_SHELF'
  | 'WAITING_FOR_PRODUCT'
  | 'MOVING_TO_CHECKOUT'
  | 'QUEUEING'
  | 'PAYING'
  | 'LEAVING';
export interface CustomerData {
  id: number;
  x: number;
  y: number;
  state: CustomerState;
  targetProduct: ProductId;
  targetQuantity: number;
  queueOrder?: number;
  basket: ItemCounts;
  color: number;
  waitTime: number;
  path: Vec2[];
}
export interface GameState {
  version: 2;
  money: number;
  inventory: ItemCounts;
  inventoryCapacity: number;
  shelves: ItemCounts;
  shelfCapacities: ItemCounts;
  farms: Record<ProductId, FarmState>;
  unlockedProducts: ProductId[];
  upgrades: Record<UpgradeId, number>;
  cashier: boolean;
  player: Vec2;
  customers: CustomerData[];
  checkoutProgress: number;
  upgradeProgress: number;
  activeUpgrade: UpgradeId | null;
  tutorialStep: number;
  totalEarned: number;
  totalServed: number;
  totalHarvested: number;
  elapsed: number;
  soundEnabled: boolean;
  machines: Record<MachineId, MachineState>;
  workers: WorkerData[];
  xp: number;
  accountantElapsed: number;
}
export interface GameEvent {
  type: 'harvest' | 'stock' | 'money' | 'upgrade' | 'notice' | 'checkout' | 'discard';
  text: string;
  x: number;
  y: number;
}
export interface SaveRepository {
  read(): string | null;
  write(value: string): void;
  clear(): void;
}
