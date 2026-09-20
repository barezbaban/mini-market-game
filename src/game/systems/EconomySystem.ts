import type { GameState } from '../types';

/** All currency changes pass through this integer-only ledger. */
export class EconomySystem {
  constructor(private readonly state: GameState) {}

  canAfford(amount: number): boolean {
    return Number.isSafeInteger(amount) && amount >= 0 && this.state.money >= amount;
  }

  spend(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    this.state.money -= amount;
    return true;
  }

  earn(amount: number): boolean {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    if (
      !Number.isSafeInteger(this.state.money + amount) ||
      !Number.isSafeInteger(this.state.totalEarned + amount)
    )
      return false;
    this.state.money += amount;
    this.state.totalEarned += amount;
    return true;
  }
}
