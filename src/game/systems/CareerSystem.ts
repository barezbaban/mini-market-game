import { BUSINESS_MILESTONES, SHOP_STYLES } from '../data/career';
import { PRODUCTS, emptyItems } from '../data/products';
import type { BusinessContract, GameEvent, GameState, ShopStyle } from '../types';
import { EconomySystem } from './EconomySystem';
import { awardXp } from './ProgressionSystem';

export function contractProgress(state: GameState): number {
  const contract = state.career.contract;
  if (!contract) return 0;
  if (contract.kind === 'drive')
    return Math.min(1, (state.driveThroughServed - contract.ordersAtStart) / contract.targetOrders);
  const goals = PRODUCTS.filter((p) => contract.goals[p.id] > 0);
  return goals.length
    ? Math.min(
        1,
        ...goals.map(
          (p) => (state.career.sold[p.id] - contract.baseline[p.id]) / contract.goals[p.id],
        ),
      )
    : 0;
}

/** Optional, no-expiry goals. All progress comes from paid sales, never timers. */
export class CareerSystem {
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  claimMilestone(id: string): boolean {
    const milestone = BUSINESS_MILESTONES.find((m) => m.id === id);
    if (!milestone || this.state.career.claimed.includes(id) || milestone.progress(this.state) < 1)
      return false;
    if (!this.economy.earn(milestone.rewardMoney)) return false;
    this.state.career.claimed.push(id);
    awardXp(this.state, milestone.rewardXp, this.emit);
    this.emit({
      type: 'upgrade',
      text: `${milestone.title}: +$${milestone.rewardMoney}, +${milestone.rewardXp} XP`,
      ...this.state.player,
    });
    return true;
  }

  acceptContract(kind: BusinessContract['kind']): boolean {
    if (
      this.state.career.contract ||
      this.state.totalServed < 10 ||
      !['produce', 'variety', 'drive'].includes(kind)
    )
      return false;
    if (kind === 'drive' && !this.state.upgrades.driveThrough) return false;
    const goals = emptyItems();
    const products = PRODUCTS.filter(
      (p) =>
        this.state.unlockedProducts.includes(p.id) && (kind !== 'produce' || p.kind === 'farm'),
    );
    if (!products.length) return false;
    const rotation = this.state.career.contractsCompleted % products.length;
    const count = kind === 'variety' ? Math.min(3, products.length) : 1;
    const quantity = kind === 'produce' ? 24 : 10;
    for (let i = 0; i < count; i++) goals[products[(rotation + i) % products.length].id] = quantity;
    const value = PRODUCTS.reduce((sum, p) => sum + goals[p.id] * p.sellingPrice, 0);
    this.state.career.contract = {
      kind,
      goals,
      baseline: { ...this.state.career.sold },
      ordersAtStart: this.state.driveThroughServed,
      targetOrders: 8,
      rewardMoney: kind === 'drive' ? 90 : Math.ceil(value * 0.3),
      rewardXp: kind === 'variety' ? 120 : 80,
    };
    return true;
  }

  claimContract(): boolean {
    const contract = this.state.career.contract;
    if (!contract || contractProgress(this.state) < 1 || !this.economy.earn(contract.rewardMoney))
      return false;
    awardXp(this.state, contract.rewardXp, this.emit);
    this.state.career.contractsCompleted++;
    this.state.career.contract = null;
    this.emit({
      type: 'upgrade',
      text: 'Contract complete! Choose another whenever you like.',
      ...this.state.player,
    });
    return true;
  }

  cancelContract(): void {
    this.state.career.contract = null;
  }

  setStyle(style: ShopStyle): boolean {
    const choice = SHOP_STYLES.find((s) => s.id === style);
    if (!choice || this.state.career.contractsCompleted < choice.contracts) return false;
    this.state.career.style = style;
    return true;
  }
}
