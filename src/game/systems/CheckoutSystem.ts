import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS, emptyItems } from '../data/products';
import type { CustomerData, GameEvent, GameState } from '../types';
import { distance, orderedQueue } from './CustomerSystem';
import { EconomySystem } from './EconomySystem';
import { checkoutDuration } from '../data/upgrades';
import { awardSaleXp } from './ProgressionSystem';
import { itemCount } from './InventorySystem';

export class CheckoutSystem {
  constructor(
    private readonly state: GameState,
    private readonly economy: EconomySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  update(deltaMs: number): void {
    this.serve(orderedQueue(this.state)[0], deltaMs, false);
    if (!this.state.upgrades.secondCashier) return;
    const second = this.state.customers.find((customer) =>
      ['MOVING_TO_SECOND_CHECKOUT', 'SECOND_QUEUEING', 'SECOND_PAYING'].includes(customer.state),
    );
    this.serve(second, deltaMs, true);
    if (second) return;
    const queue = orderedQueue(this.state);
    const primaryCanWork =
      this.state.cashier ||
      distance(this.state.player, GAME_CONFIG.cashierSpot) <= GAME_CONFIG.interactionRadius;
    const candidate = queue[primaryCanWork ? 1 : 0];
    if (!candidate || candidate.state !== 'QUEUEING' || candidate.path.length) return;
    candidate.state = 'MOVING_TO_SECOND_CHECKOUT';
    candidate.path = [
      { x: 890, y: candidate.y },
      { x: 890, y: 490 },
      { x: GAME_CONFIG.secondQueueStart.x, y: 490 },
      { ...GAME_CONFIG.secondQueueStart },
    ];
  }

  private serve(customer: CustomerData | undefined, deltaMs: number, second: boolean): void {
    const point = second ? GAME_CONFIG.secondQueueStart : GAME_CONFIG.queueStart;
    const counter = second ? GAME_CONFIG.secondCheckout : GAME_CONFIG.checkout;
    const id = second ? 'second' : 'store';
    const progress = second ? 'secondCheckoutProgress' : 'checkoutProgress';
    const queueState = second ? 'SECOND_QUEUEING' : 'QUEUEING';
    const payingState = second ? 'SECOND_PAYING' : 'PAYING';
    const ready =
      customer &&
      [queueState, payingState].includes(customer.state) &&
      distance(customer, point) < 3;
    if (
      !ready ||
      (!second &&
        !this.state.cashier &&
        distance(this.state.player, GAME_CONFIG.cashierSpot) > GAME_CONFIG.interactionRadius)
    ) {
      this.state[progress] = 0;
      if (customer?.state === payingState) customer.state = queueState;
      return;
    }
    const amount = PRODUCTS.reduce(
      (sum, product) => sum + customer.basket[product.id] * product.sellingPrice,
      0,
    );
    if (!this.economy.canDeposit(id, amount)) {
      this.state[progress] = 0;
      customer.state = queueState;
      return;
    }
    customer.state = payingState;
    this.state[progress] += deltaMs;
    if (this.state[progress] < checkoutDuration(this.state)) return;
    if (!this.economy.deposit(id, amount)) return;
    this.state.totalServed += 1;
    const earnedXp = awardSaleXp(this.state, itemCount(customer.basket), this.emit);
    this.state.tutorialStep = Math.max(this.state.tutorialStep, 5);
    this.state[progress] = 0;
    customer.state = 'LEAVING';
    customer.basket = emptyItems();
    customer.path = [
      ...(second ? [{ x: 1000, y: 360 }] : [{ x: 885, y: 302 }]),
      { x: 1010, y: 320 },
      { ...GAME_CONFIG.entrance },
      { ...GAME_CONFIG.entranceOutside },
      { ...GAME_CONFIG.cartStation },
      { ...GAME_CONFIG.customerExit },
    ];
    this.emit({ type: 'checkout', text: `$${amount} stacked · +${earnedXp} XP`, ...counter });
    this.emit({ type: 'checkout', text: 'Thank you!', x: customer.x, y: customer.y });
  }
}
