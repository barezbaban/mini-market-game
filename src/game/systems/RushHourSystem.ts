import type { GameEvent, GameState } from '../types';

export const RUSH = { duration: 90000, cooldown: 60000, goal: 8, xp: 100 } as const;

/** Optional, active-play challenge. Sales still stay in the manual cash piles. */
export class RushHourSystem {
  constructor(
    private readonly state: GameState,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  start(): boolean {
    if (this.state.rush.remainingMs || this.state.rush.cooldownMs) return false;
    Object.assign(this.state.rush, {
      remainingMs: RUSH.duration,
      servedAtStart: this.state.totalServed,
      completed: 0,
      result: 'none',
    });
    this.emit({
      type: 'notice',
      text: 'Rush hour! Serve 8 orders in 90 seconds.',
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
    rush.completed = Math.min(RUSH.goal, Math.max(0, this.state.totalServed - rush.servedAtStart));
    rush.remainingMs = Math.max(0, rush.remainingMs - deltaMs);
    if (rush.completed < RUSH.goal && rush.remainingMs) return;
    rush.remainingMs = 0;
    rush.cooldownMs = RUSH.cooldown;
    rush.result = rush.completed >= RUSH.goal ? 'won' : 'missed';
    if (rush.result === 'won') this.state.xp += RUSH.xp;
    this.emit({
      type: rush.result === 'won' ? 'upgrade' : 'notice',
      text:
        rush.result === 'won'
          ? 'Rush complete! +100 XP'
          : `Rush finished: ${rush.completed}/8. Try again after a breather.`,
      ...this.state.player,
    });
  }
}
