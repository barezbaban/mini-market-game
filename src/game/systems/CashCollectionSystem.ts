import { CASH_POINTS, cashPointOpen } from '../data/cashPoints';
import { GAME_CONFIG } from '../data/gameConfig';
import type { GameEvent, GameState } from '../types';
import { EconomySystem } from './EconomySystem';

export class CashCollectionSystem {
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    for (const point of CASH_POINTS) {
      if (!cashPointOpen(this.state, point.id)) continue;
      const stack = this.state.cashStacks[point.id];
      if (stack.amount) stack.unattendedMs += deltaMs;
      else stack.unattendedMs = 0;
      const distance = Math.hypot(
        this.state.player.x - point.position.x,
        this.state.player.y - point.position.y,
      );
      if (distance > GAME_CONFIG.cashCollectRadius + 25) stack.collectionArmed = true;
      if (distance > GAME_CONFIG.cashCollectRadius || !stack.collectionArmed) continue;
      stack.collectionArmed = false;
      const amount = this.economy.collect(point.id);
      if (amount) {
        this.state.career.firstActions.cash ??= this.state.elapsed;
        this.state.tutorialStep = Math.max(6, this.state.tutorialStep);
        this.emit({ type: 'money', text: `Collected $${amount}`, ...point.position });
      }
    }
  }
}
