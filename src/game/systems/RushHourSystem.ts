import type { GameEvent, GameState } from '../types';
import { cartCapacity } from '../data/upgrades';
import { awardXp } from './ProgressionSystem';

export const RUSH = { duration: 90000, cooldown: 60000, goal: 8, xp: 100 } as const;
export const RUSH_TIERS = [
  { id: 'gentle', name: 'Neighborhood rush', goal: 6, xp: 75, carts: 3, orders: 10 },
  { id: 'busy', name: 'Busy market', goal: 12, xp: 150, carts: 6, orders: 50 },
  { id: 'festival', name: 'Market festival', goal: 20, xp: 250, carts: 10, orders: 150 },
] as const;
export type RushTier = GameState['rush']['tier'];
export function rushRequirement(state: GameState, id: RushTier): string {
  const tier = RUSH_TIERS.find((t) => t.id === id)!;
  if (state.totalServed < tier.orders) return `Complete ${tier.orders} paid orders first`;
  if (cartCapacity(state) < tier.carts) return `Requires ${tier.carts} carts`;
  if (!Object.values(state.shelves).some((n) => n > 0)) return 'Stock a shelf before starting';
  return '';
}

/** Optional, active-play challenge. Sales still stay in the manual cash piles. */
export class RushHourSystem {
  constructor(
    private readonly state: GameState,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  start(id: RushTier = 'gentle'): boolean {
    const tier = RUSH_TIERS.find((t) => t.id === id);
    if (
      !tier ||
      this.state.rush.remainingMs ||
      this.state.rush.cooldownMs ||
      rushRequirement(this.state, id)
    )
      return false;
    Object.assign(this.state.rush, {
      remainingMs: RUSH.duration,
      servedAtStart: this.state.totalServed,
      completed: 0,
      result: 'none',
      tier: id,
      goal: tier.goal,
      rewardXp: tier.xp,
    });
    this.emit({
      type: 'notice',
      text: `${tier.name}: ${tier.goal} orders in 90 seconds.`,
      ...this.state.player,
    });
    return true;
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const rush = this.state.rush;
    if (!rush.remainingMs) {
      rush.cooldownMs = Math.max(0, rush.cooldownMs - deltaMs);
      return;
    }
    rush.completed = Math.min(rush.goal, Math.max(0, this.state.totalServed - rush.servedAtStart));
    rush.remainingMs = Math.max(0, rush.remainingMs - deltaMs);
    if (rush.completed < rush.goal && rush.remainingMs) return;
    rush.remainingMs = 0;
    rush.cooldownMs = RUSH.cooldown;
    rush.result = rush.completed >= rush.goal ? 'won' : 'missed';
    if (rush.result === 'won') awardXp(this.state, rush.rewardXp, this.emit);
    this.emit({
      type: rush.result === 'won' ? 'upgrade' : 'notice',
      text:
        rush.result === 'won'
          ? `Rush complete! +${rush.rewardXp} XP`
          : `Rush finished: ${rush.completed}/${rush.goal}. No penalty. Restock and try again.`,
      ...this.state.player,
    });
  }
}
