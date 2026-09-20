import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import type { GameEvent, GameState } from '../types';
import { distance, orderedQueue } from './CustomerSystem';
import { EconomySystem } from './EconomySystem';
import { checkoutDuration } from '../data/upgrades';
import { awardXp } from './ProgressionSystem';

export class CheckoutSystem {
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  update(deltaMs: number): void {
    const customer = orderedQueue(this.state)[0];
    const ready =
      customer &&
      ['QUEUEING', 'PAYING'].includes(customer.state) &&
      distance(customer, GAME_CONFIG.queueStart) < 3;
    if (
      !ready ||
      (!this.state.cashier &&
        distance(this.state.player, GAME_CONFIG.cashierSpot) > GAME_CONFIG.interactionRadius)
    ) {
      this.state.checkoutProgress = 0;
      if (customer?.state === 'PAYING') customer.state = 'QUEUEING';
      return;
    }
    customer.state = 'PAYING';
    this.state.checkoutProgress += deltaMs;
    if (this.state.checkoutProgress < checkoutDuration(this.state)) return;
    const amount = PRODUCTS.reduce(
      (sum, product) => sum + customer.basket[product.id] * product.sellingPrice,
      0,
    );
    if (!this.economy.earn(amount)) {
      this.state.checkoutProgress = 0;
      return;
    }
    this.state.totalServed += 1;
    awardXp(this.state, 5, this.emit);
    this.state.tutorialStep = Math.max(this.state.tutorialStep, 5);
    this.state.checkoutProgress = 0;
    customer.state = 'LEAVING';
    customer.basket = emptyItems();
    customer.path = [
      { x: 885, y: 302 },
      { x: 1010, y: 320 },
      { ...GAME_CONFIG.entrance },
      { ...GAME_CONFIG.entranceOutside },
      { ...GAME_CONFIG.customerExit },
    ];
    this.emit({ type: 'money', text: `+$${amount}`, ...GAME_CONFIG.checkout });
    this.emit({ type: 'checkout', text: 'Thank you!', x: customer.x, y: customer.y });
  }
}
