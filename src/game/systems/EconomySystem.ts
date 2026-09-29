import { GAME_CONFIG } from '../data/gameConfig';
import { cashPointOpen } from '../data/cashPoints';
import type { CashPointId, GameState } from '../types';

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

  canDeposit(id: CashPointId, amount: number): boolean {
    return (
      cashPointOpen(this.state, id) &&
      Number.isSafeInteger(amount) &&
      amount > 0 &&
      this.state.cashStacks[id].amount + amount <= GAME_CONFIG.cashStackLimit &&
      Number.isSafeInteger(this.state.totalEarned + amount)
    );
  }

  /** A sale is revenue, but becomes spendable only when the player collects it. */
  deposit(id: CashPointId, amount: number): boolean {
    if (!this.canDeposit(id, amount)) return false;
    const stack = this.state.cashStacks[id];
    if (stack.amount === 0) stack.unattendedMs = 0;
    stack.amount += amount;
    stack.blocked = stack.amount >= GAME_CONFIG.cashStackLimit;
    this.state.totalEarned += amount;
    return true;
  }

  collect(id: CashPointId): number {
    const stack = this.state.cashStacks[id];
    if (!stack.amount || !Number.isSafeInteger(this.state.money + stack.amount)) return 0;
    const amount = stack.amount;
    this.state.money += amount;
    stack.amount = 0;
    stack.unattendedMs = 0;
    stack.blocked = false;
    return amount;
  }

  recover(amount: number): boolean {
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(this.state.money + amount)
    )
      return false;
    this.state.money += amount;
    return true;
  }
}
