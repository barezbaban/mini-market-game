import { GAME_CONFIG } from './gameConfig';
import type { CashPointId, GameState, Vec2 } from '../types';

export const CASH_POINTS: { id: CashPointId; name: string; position: Vec2 }[] = [
  { id: 'store', name: 'Checkout 1', position: GAME_CONFIG.storeCash },
  { id: 'second', name: 'Checkout 2', position: GAME_CONFIG.secondCash },
  { id: 'drive', name: 'Drive-through', position: GAME_CONFIG.driveCash },
];
export const cashPointOpen = (state: GameState, id: CashPointId): boolean =>
  id === 'store' || state.upgrades[id === 'second' ? 'secondCashier' : 'driveThrough'] > 0;
export const cashPosition = (id: CashPointId): Vec2 =>
  CASH_POINTS.find((point) => point.id === id)!.position;
export const uncollectedCash = (state: GameState): number =>
  CASH_POINTS.reduce((sum, { id }) => sum + state.cashStacks[id].amount, 0);
