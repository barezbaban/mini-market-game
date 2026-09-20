import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import type { GameEvent, GameState, UpgradeId, Vec2 } from '../types';
import { CheckoutSystem } from './CheckoutSystem';
import { CustomerSystem, distance } from './CustomerSystem';
import { EconomySystem } from './EconomySystem';
import { FarmingSystem } from './FarmingSystem';
import { InventorySystem } from './InventorySystem';
import { createInitialState } from './SaveSystem';
import { UpgradeSystem } from './UpgradeSystem';

/** The renderer owns no game rules. This headless simulation runs in browser and tests. */
export class GameEngine {
  readonly economy: EconomySystem;
  readonly inventory: InventorySystem;
  readonly farming: FarmingSystem;
  readonly customers: CustomerSystem;
  readonly checkout: CheckoutSystem;
  readonly upgrades: UpgradeSystem;
  private events: GameEvent[] = [];
  private harvestElapsed: number = GAME_CONFIG.harvestInterval;
  private stockElapsed: number = GAME_CONFIG.stockInterval;
  private lastUpgradeAttempt: UpgradeId | null = null;
  private lastBlockedZone: string | null = null;
  private nextBlockedNotice = 0;

  constructor(readonly state: GameState = createInitialState()) {
    if (!this.canWalk(state.player)) state.player = { ...GAME_CONFIG.playerStart };
    const emit = (event: GameEvent) => this.events.push(event);
    this.economy = new EconomySystem(state);
    this.inventory = new InventorySystem(state);
    this.farming = new FarmingSystem(state);
    this.customers = new CustomerSystem(state, this.inventory);
    this.checkout = new CheckoutSystem(state, this.economy, emit);
    this.upgrades = new UpgradeSystem(state, this.economy, emit);
  }

  purchaseUpgrade(id: UpgradeId): boolean {
    return this.upgrades.purchase(id);
  }
  snapshot(): GameState {
    return structuredClone(this.state);
  }
  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private canWalk(point: Vec2): boolean {
    for (const product of PRODUCTS) {
      if (
        Math.abs(point.x - product.shelf.x) < 78 &&
        point.y > product.shelf.y - 43 &&
        point.y < product.shelf.y + 44
      )
        return false;
    }
    return !(point.x > 863 && point.x < 937 && point.y > 172 && point.y < 260);
  }

  private movePlayer(deltaMs: number, input: Vec2): void {
    const magnitude = Math.hypot(input.x, input.y);
    if (!Number.isFinite(magnitude) || magnitude === 0) return;
    const scale = (GAME_CONFIG.playerSpeed * deltaMs) / 1000 / Math.max(1, magnitude);
    const bounds = GAME_CONFIG.bounds;
    const x = Math.min(bounds.right, Math.max(bounds.left, this.state.player.x + input.x * scale));
    const y = Math.min(bounds.bottom, Math.max(bounds.top, this.state.player.y + input.y * scale));
    if (this.canWalk({ x, y: this.state.player.y })) this.state.player.x = x;
    if (this.canWalk({ x: this.state.player.x, y })) this.state.player.y = y;
  }

  private interact(deltaMs: number): void {
    let blocked: (GameEvent & { zone: string }) | null = null;
    this.harvestElapsed = Math.min(GAME_CONFIG.harvestInterval, this.harvestElapsed + deltaMs);
    this.stockElapsed = Math.min(GAME_CONFIG.stockInterval, this.stockElapsed + deltaMs);
    for (const product of PRODUCTS) {
      if (!this.state.unlockedProducts.includes(product.id)) continue;
      if (distance(this.state.player, product.farm) <= GAME_CONFIG.interactionRadius) {
        this.state.tutorialStep = Math.max(this.state.tutorialStep, 1);
        if (
          this.harvestElapsed >= GAME_CONFIG.harvestInterval &&
          this.inventory.harvest(product.id)
        ) {
          this.harvestElapsed = 0;
          this.state.tutorialStep = Math.max(this.state.tutorialStep, 2);
          this.events.push({ type: 'harvest', text: `+1 ${product.name}`, ...product.farm });
        }
        if (this.inventory.room === 0 && this.state.farms[product.id].ready > 0) {
          blocked = {
            type: 'notice',
            text: 'Basket full — stock a shelf',
            ...product.farm,
            zone: `farm:${product.id}`,
          };
        }
      }
      if (
        distance(this.state.player, product.shelf) <= GAME_CONFIG.interactionRadius &&
        this.stockElapsed >= GAME_CONFIG.stockInterval &&
        this.inventory.stock(product.id)
      ) {
        this.stockElapsed = 0;
        this.state.tutorialStep = Math.max(this.state.tutorialStep, 3);
        this.events.push({ type: 'stock', text: `+1 ${product.name}`, ...product.shelf });
      }
      if (
        distance(this.state.player, product.shelf) <= GAME_CONFIG.interactionRadius &&
        this.state.inventory[product.id] > 0 &&
        this.state.shelves[product.id] >= this.state.shelfCapacities[product.id]
      ) {
        blocked = {
          type: 'notice',
          text: `${product.name} shelf full`,
          ...product.shelf,
          zone: `shelf:${product.id}`,
        };
      }
    }
    if (
      blocked &&
      (blocked.zone !== this.lastBlockedZone || this.state.elapsed >= this.nextBlockedNotice)
    ) {
      this.events.push({ type: blocked.type, text: blocked.text, x: blocked.x, y: blocked.y });
      this.nextBlockedNotice = this.state.elapsed + 3000;
    }
    this.lastBlockedZone = blocked?.zone ?? null;
    const upgrade = UPGRADES.find(
      (entry) =>
        distance(this.state.player, entry.position) < 40 &&
        this.state.upgrades[entry.id] < entry.maxLevel,
    );
    if (!upgrade) {
      this.state.activeUpgrade = null;
      this.state.upgradeProgress = 0;
      this.lastUpgradeAttempt = null;
      return;
    }
    if (this.state.activeUpgrade !== upgrade.id) {
      this.state.activeUpgrade = upgrade.id;
      this.state.upgradeProgress = 0;
      this.lastUpgradeAttempt = null;
    }
    if (this.lastUpgradeAttempt === upgrade.id && !this.economy.canAfford(upgrade.cost)) return;
    this.state.upgradeProgress += deltaMs;
    if (this.state.upgradeProgress >= GAME_CONFIG.upgradeHoldTime) {
      this.state.upgradeProgress = GAME_CONFIG.upgradeHoldTime;
      this.purchaseUpgrade(upgrade.id);
      this.lastUpgradeAttempt = upgrade.id;
    }
  }

  update(deltaMs: number, input: Vec2 = { x: 0, y: 0 }): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // Bound catch-up after a suspended tab; tiny substeps prevent obstacle tunneling.
    let remaining = Math.min(deltaMs, 1000);
    while (remaining > 0) {
      const step = Math.min(50, remaining);
      this.state.elapsed += step;
      this.movePlayer(step, input);
      this.farming.update(step);
      this.interact(step);
      this.customers.update(step);
      this.checkout.update(step);
      remaining -= step;
    }
  }
}
