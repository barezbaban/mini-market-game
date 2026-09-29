import { GAME_CONFIG } from '../data/gameConfig';
import { LEVEL_MILESTONES, playerLevel } from '../data/upgrades';
import type { GameEvent, GameState } from '../types';

export function awardXp(
  state: GameState,
  amount: number,
  emit: (event: GameEvent) => void = () => {},
): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  const before = playerLevel(state.xp);
  state.xp = Math.min(Number.MAX_SAFE_INTEGER, state.xp + amount);
  const after = playerLevel(state.xp);
  if (after > before) {
    const unlocked = LEVEL_MILESTONES.some(({ level }) => level > before && level <= after);
    emit({
      type: 'upgrade',
      text: `Market level ${after}!${unlocked ? ' New upgrades in Manage' : ''}`,
      ...state.player,
    });
  }
}

/** Only call after a successful payment, before clearing the paid basket. */
export function awardSaleXp(
  state: GameState,
  itemsSold: number,
  emit: (event: GameEvent) => void = () => {},
): number {
  if (!Number.isSafeInteger(itemsSold) || itemsSold < 1) return 0;
  const amount = 5 + itemsSold * 2;
  awardXp(state, amount, emit);
  return amount;
}

export class ProgressionSystem {
  constructor(
    private readonly state: GameState,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.state.upgrades.accountant < 1) return;
    this.state.accountantElapsed += deltaMs;
    const awards = Math.floor(this.state.accountantElapsed / GAME_CONFIG.accountantInterval);
    if (awards) {
      this.state.accountantElapsed %= GAME_CONFIG.accountantInterval;
      awardXp(
        this.state,
        awards * this.state.upgrades.accountant * GAME_CONFIG.accountantXpPerLevel,
        this.emit,
      );
    }
  }
}
