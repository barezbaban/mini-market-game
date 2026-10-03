import type { CustomerData, GameState } from '../types';
import { remainingCustomerNeed } from './CustomerSystem';

export const CUSTOMER_REACTIONS = { queueDelayMs: 30000, purchaseDurationMs: 2200 } as const;

/** Quiet by default: reactions explain an actual sale or a current service problem. */
export function customerEmoji(state: GameState, customer: CustomerData): string {
  if (customer.state === 'LEAVING')
    return !customer.unhappy && customer.waitTime < CUSTOMER_REACTIONS.purchaseDurationMs
      ? '🙂'
      : '';
  if (
    customer.state === 'WAITING_FOR_PRODUCT' &&
    remainingCustomerNeed(customer) > 0 &&
    state.shelves[customer.targetProduct] === 0
  )
    return '😕';
  if (
    ['MOVING_TO_CHECKOUT', 'QUEUEING', 'MOVING_TO_SECOND_CHECKOUT', 'SECOND_QUEUEING'].includes(
      customer.state,
    ) &&
    (customer.checkoutWaitElapsed ?? 0) >= CUSTOMER_REACTIONS.queueDelayMs
  )
    return '😠';
  return '';
}
