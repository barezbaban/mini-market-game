import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, plotCount, plotPosition, productById } from '../data/products';
import { MACHINES } from '../data/machines';
import { UPGRADES, upgradeAvailable } from '../data/upgrades';
import type { GameEvent, GameState, UpgradeId, Vec2 } from '../types';
import { CheckoutSystem } from './CheckoutSystem';
import { CustomerSystem, distance } from './CustomerSystem';
import { EconomySystem } from './EconomySystem';
import { FarmingSystem } from './FarmingSystem';
import { InventorySystem } from './InventorySystem';
import { createInitialState } from './SaveSystem';
import { UpgradeSystem } from './UpgradeSystem';
import { MachineSystem } from './MachineSystem';
import { WorkerSystem } from './WorkerSystem';
import { ProgressionSystem } from './ProgressionSystem';

/** The renderer owns no game rules. This headless simulation runs in browser and tests. */
export class GameEngine {
  readonly economy: EconomySystem;
  readonly inventory: InventorySystem;
  readonly farming: FarmingSystem;
  readonly customers: CustomerSystem;
  readonly checkout: CheckoutSystem;
  readonly upgrades: UpgradeSystem;
  readonly machines: MachineSystem;
  readonly workers: WorkerSystem;
  readonly progression: ProgressionSystem;
  private events: GameEvent[] = [];
  private harvestElapsed: number = GAME_CONFIG.harvestInterval;
  private stockElapsed: number = GAME_CONFIG.stockInterval;
  private machineElapsed: number = GAME_CONFIG.harvestInterval;
  private lastUpgradeAttempt: UpgradeId | null = null;
  private lastBlockedZone: string | null = null;
  private nextBlockedNotice = 0;
  private trashElapsed = 0;
  private trashUsedThisVisit = false;

  constructor(readonly state: GameState = createInitialState()) {
    if (!this.canWalk(state.player)) state.player = { ...GAME_CONFIG.playerStart };
    const emit = (event: GameEvent) => this.events.push(event);
    this.economy = new EconomySystem(state);
    this.inventory = new InventorySystem(state);
    this.farming = new FarmingSystem(state);
    this.customers = new CustomerSystem(state, this.inventory);
    this.checkout = new CheckoutSystem(state, this.economy, emit);
    this.upgrades = new UpgradeSystem(state, this.economy, emit);
    this.machines = new MachineSystem(state, this.inventory, emit);
    this.workers = new WorkerSystem(state, this.inventory, this.machines, emit);
    this.progression = new ProgressionSystem(state, emit);
  }

  purchaseUpgrade(id: UpgradeId): boolean {
    const purchased = this.upgrades.purchase(id);
    // Management can construct a processor where the player is standing.
    // Place them at its loading side instead of trapping them inside new collision geometry.
    if (purchased && !this.canWalk(this.state.player)) {
      const machine = MACHINES.find((entry) => entry.upgrade === id);
      const loadingSide = machine && { x: machine.position.x, y: machine.position.y + 65 };
      this.state.player =
        loadingSide && this.canWalk(loadingSide) ? loadingSide : { ...GAME_CONFIG.playerStart };
    }
    return purchased;
  }
  snapshot(): GameState {
    return structuredClone(this.state);
  }
  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
  get trashProgress(): number {
    return Math.min(1, this.trashElapsed / GAME_CONFIG.trashHoldTime);
  }

  private canWalk(point: Vec2): boolean {
    const bounds = GAME_CONFIG.bounds;
    if (
      point.x < bounds.left ||
      point.x > GAME_CONFIG.areaBounds[this.state.upgrades.expansion] ||
      point.y < bounds.top ||
      point.y > bounds.bottom
    )
      return false;
    for (const product of PRODUCTS) {
      if (
        Math.abs(point.x - product.shelf.x) < 78 &&
        point.y > product.shelf.y - 43 &&
        point.y < product.shelf.y + 44
      )
        return false;
    }
    for (const machine of MACHINES) {
      if (
        this.state.upgrades[machine.upgrade] > 0 &&
        Math.abs(point.x - machine.position.x) < 38 &&
        Math.abs(point.y - machine.position.y) < 35
      )
        return false;
    }
    if (
      Math.abs(point.x - GAME_CONFIG.trash.x) < 32 &&
      Math.abs(point.y - GAME_CONFIG.trash.y) < 32
    )
      return false;
    return !(point.x > 863 && point.x < 937 && point.y > 172 && point.y < 260);
  }

  private updateTrash(deltaMs: number): void {
    const nearby = distance(this.state.player, GAME_CONFIG.trash) <= GAME_CONFIG.interactionRadius;
    if (!nearby) {
      this.trashElapsed = 0;
      this.trashUsedThisVisit = false;
      return;
    }
    if (this.trashUsedThisVisit || this.inventory.total === 0) {
      this.trashElapsed = 0;
      return;
    }
    this.trashElapsed = Math.min(GAME_CONFIG.trashHoldTime, this.trashElapsed + deltaMs);
    if (this.trashElapsed < GAME_CONFIG.trashHoldTime) return;
    const discarded = this.inventory.discardAll();
    this.trashElapsed = 0;
    this.trashUsedThisVisit = true;
    this.events.push({
      type: 'discard',
      text: `Discarded ${discarded} item${discarded === 1 ? '' : 's'}`,
      ...GAME_CONFIG.trash,
    });
  }

  private movePlayer(deltaMs: number, input: Vec2): void {
    const magnitude = Math.hypot(input.x, input.y);
    if (!Number.isFinite(magnitude) || magnitude === 0) return;
    const scale = (GAME_CONFIG.playerSpeed * deltaMs) / 1000 / Math.max(1, magnitude);
    const bounds = GAME_CONFIG.bounds;
    const x = Math.min(
      GAME_CONFIG.areaBounds[this.state.upgrades.expansion],
      Math.max(bounds.left, this.state.player.x + input.x * scale),
    );
    const y = Math.min(bounds.bottom, Math.max(bounds.top, this.state.player.y + input.y * scale));
    if (this.canWalk({ x, y: this.state.player.y })) this.state.player.x = x;
    if (this.canWalk({ x: this.state.player.x, y })) this.state.player.y = y;
  }

  private interact(deltaMs: number): void {
    let blocked: (GameEvent & { zone: string }) | null = null;
    this.harvestElapsed = Math.min(GAME_CONFIG.harvestInterval, this.harvestElapsed + deltaMs);
    this.stockElapsed = Math.min(GAME_CONFIG.stockInterval, this.stockElapsed + deltaMs);
    this.machineElapsed = Math.min(GAME_CONFIG.harvestInterval, this.machineElapsed + deltaMs);
    this.updateTrash(deltaMs);
    for (const product of PRODUCTS) {
      if (!this.state.unlockedProducts.includes(product.id)) continue;
      const plotIndex = Array.from(
        { length: plotCount(this.state, product.id) },
        (_, index) => index,
      ).find((index) => distance(this.state.player, plotPosition(product.id, index)) <= 55);
      if (plotIndex !== undefined) {
        const harvestPosition = plotPosition(product.id, plotIndex);
        this.state.tutorialStep = Math.max(this.state.tutorialStep, 1);
        if (
          this.harvestElapsed >= GAME_CONFIG.harvestInterval &&
          this.inventory.harvest(product.id, 1, plotIndex)
        ) {
          this.harvestElapsed = 0;
          this.state.tutorialStep = Math.max(this.state.tutorialStep, 2);
          this.events.push({ type: 'harvest', text: `+1 ${product.name}`, ...harvestPosition });
        }
        if (this.inventory.room === 0 && this.state.farms[product.id].plots[plotIndex].ready > 0) {
          blocked = {
            type: 'notice',
            text: 'Basket full — stock a shelf',
            ...harvestPosition,
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
    if (this.machineElapsed >= GAME_CONFIG.harvestInterval) {
      for (const machine of MACHINES) {
        if (
          !this.machines.isUnlocked(machine.id) ||
          distance(this.state.player, machine.position) > GAME_CONFIG.interactionRadius
        )
          continue;
        const supplied = this.machines.supply(machine.id, this.state.inventory, 1);
        const collected = this.machines.collect(
          machine.id,
          this.state.inventory,
          this.state.inventoryCapacity,
          1,
        );
        if (supplied || collected) {
          this.machineElapsed = 0;
          this.events.push({
            type: 'stock',
            text: collected ? `+${collected} ${productById(machine.output)!.name}` : 'Input loaded',
            ...machine.position,
          });
        }
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
        entry.inWorld &&
        upgradeAvailable(this.state, entry.id) &&
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
    // One purchase per visit: remaining on a pad must not spend several upgrade levels.
    if (this.lastUpgradeAttempt === upgrade.id) return;
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
      this.machines.update(step);
      this.workers.update(step);
      this.progression.update(step);
      remaining -= step;
    }
  }
}
