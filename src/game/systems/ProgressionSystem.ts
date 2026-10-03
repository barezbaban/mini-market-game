import { GAME_CONFIG } from '../data/gameConfig';
import { LEVEL_MILESTONES, playerLevel } from '../data/upgrades';
import { PRODUCTS } from '../data/products';
import { REGULARS } from '../data/career';
import type { GameEvent, GameState, ItemCounts } from '../types';

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
  basket?: ItemCounts,
  regularId?: string,
): number {
  if (!Number.isSafeInteger(itemsSold) || itemsSold < 1) return 0;
  const amount = 5 + itemsSold * 2;
  awardXp(state, amount, emit);
  if (basket)
    for (const { id } of PRODUCTS)
      state.career.sold[id] = Math.min(Number.MAX_SAFE_INTEGER, state.career.sold[id] + basket[id]);
  const regular = REGULARS.find((entry) => entry.id === regularId);
  if (regular && basket?.[regular.product]) {
    state.career.regularVisits[regular.id] = Math.min(
      Number.MAX_SAFE_INTEGER,
      (state.career.regularVisits[regular.id] ?? 0) + 1,
    );
    if (state.career.regularVisits[regular.id] % 5 === 0) {
      awardXp(state, 25, emit);
      emit({
        type: 'notice',
        text: `${regular.name}: Thanks for looking after the neighborhood! +25 XP`,
        ...state.player,
      });
    }
  }
  state.career.firstActions.sale ??= state.elapsed;
  return amount;
}

export class ProgressionSystem {
  constructor(
    private readonly state: GameState,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    if (this.state.upgrades.accountant < 1) {
      this.state.career.accountantCheckpoint = this.state.totalServed;
      return;
    }
    this.state.accountantElapsed += deltaMs;
    if (this.state.accountantElapsed >= GAME_CONFIG.accountantInterval) {
      this.state.accountantElapsed %= GAME_CONFIG.accountantInterval;
      const awards = Math.floor(
        Math.max(0, this.state.totalServed - this.state.career.accountantCheckpoint) / 5,
      );
      this.state.career.accountantCheckpoint += awards * 5;
      awardXp(this.state, awards * this.state.upgrades.accountant * 2, this.emit);
    }
  }
}
