import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { emptyItems } from '../src/game/data/products';
import { customerEmoji, CUSTOMER_REACTIONS } from '../src/game/systems/CustomerReactions';
import { GameEngine } from '../src/game/systems/GameEngine';
import { validateSave } from '../src/game/systems/SaveSystem';
import type { CustomerData } from '../src/game/types';

function shopper(overrides: Partial<CustomerData> = {}): CustomerData {
  return {
    id: 1,
    ...GAME_CONFIG.queueStart,
    state: 'QUEUEING',
    targetProduct: 'tomato',
    targetQuantity: 1,
    basket: { ...emptyItems(), tomato: 1 },
    color: 0xffffff,
    waitTime: 0,
    path: [],
    queueOrder: 1,
    ...overrides,
  };
}

describe('small, event-only customer reactions', () => {
  it.each([
    'ENTERING',
    'MOVING_TO_SHELF',
    'MOVING_TO_CHECKOUT',
    'QUEUEING',
    'MOVING_TO_SECOND_CHECKOUT',
    'SECOND_QUEUEING',
    'PAYING',
    'SECOND_PAYING',
  ] as const)('shows no emoji during normal %s', (state) => {
    const engine = new GameEngine();
    expect(customerEmoji(engine.state, shopper({ state, patienceElapsed: 100000 }))).toBe('');
  });

  it('shows a missing-stock reaction only for an unfulfilled item at an empty shelf', () => {
    const engine = new GameEngine();
    const customer = shopper({ state: 'WAITING_FOR_PRODUCT', basket: emptyItems() });
    expect(customerEmoji(engine.state, customer)).toBe('😕');
    engine.state.shelves.tomato = 1;
    expect(customerEmoji(engine.state, customer)).toBe('');
    engine.state.shelves.tomato = 0;
    customer.basket.tomato = 1;
    expect(customerEmoji(engine.state, customer)).toBe('');
  });

  it.each(['QUEUEING', 'SECOND_QUEUEING'] as const)(
    'waits 30 queued seconds in %s, ignoring shelf and walking time',
    (state) => {
      const engine = new GameEngine();
      const customer = shopper({ state: 'WAITING_FOR_PRODUCT', patienceElapsed: 20000 });
      engine.state.customers = [customer];
      engine.patience.update(20000);
      customer.state = 'MOVING_TO_CHECKOUT';
      engine.patience.update(10000);
      expect(customer.checkoutWaitElapsed ?? 0).toBe(0);
      customer.state = state;
      engine.patience.update(CUSTOMER_REACTIONS.queueDelayMs - 1);
      expect(customerEmoji(engine.state, customer)).toBe('');
      engine.patience.update(1);
      expect(customerEmoji(engine.state, customer)).toBe('😠');
      customer.state = state === 'QUEUEING' ? 'PAYING' : 'SECOND_PAYING';
      expect(customerEmoji(engine.state, customer)).toBe('');
    },
  );

  it.each([false, true])(
    'shows a brief smile only after a completed sale (second register: %s)',
    (second) => {
      const engine = new GameEngine();
      engine.state.cashier = true;
      engine.state.upgrades.secondCashier = Number(second);
      const customer = shopper({
        ...(second ? GAME_CONFIG.secondQueueStart : GAME_CONFIG.queueStart),
        state: second ? 'SECOND_QUEUEING' : 'QUEUEING',
        waitTime: 60000,
      });
      engine.state.customers = [customer];
      engine.checkout.update(1000);
      expect(engine.state.totalServed).toBe(1);
      expect(customer.state).toBe('LEAVING');
      expect(customer.waitTime).toBe(0);
      expect(customerEmoji(engine.state, customer)).toBe('🙂');
      customer.waitTime = CUSTOMER_REACTIONS.purchaseDurationMs - 1;
      expect(customerEmoji(engine.state, customer)).toBe('🙂');
      customer.waitTime++;
      expect(customerEmoji(engine.state, customer)).toBe('');
      customer.waitTime = 0;
      customer.unhappy = true;
      expect(customerEmoji(engine.state, customer)).toBe('');
    },
  );

  it('preserves queue reaction timing across saves and defaults safely for older saves', () => {
    const engine = new GameEngine();
    engine.state.customers = [shopper({ checkoutWaitElapsed: 29999 })];
    const restored = new GameEngine(validateSave(engine.snapshot())!);
    expect(customerEmoji(restored.state, restored.state.customers[0])).toBe('');
    restored.patience.update(1);
    expect(customerEmoji(restored.state, restored.state.customers[0])).toBe('😠');
    delete engine.state.customers[0].checkoutWaitElapsed;
    const legacy = validateSave(engine.snapshot())!;
    expect(customerEmoji(legacy, legacy.customers[0])).toBe('');
  });
});
