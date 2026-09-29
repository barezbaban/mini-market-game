import { CASH_POINTS } from '../../src/game/data/cashPoints';
import type { GameEngine } from '../../src/game/systems/GameEngine';

/** Queue/supply-chain fixtures simulate a player making collection rounds.
 * AFK closure, theft, distance, and collection latching have separate coverage. */
export function collectTakings(engine: GameEngine): void {
  const previous = { ...engine.state.player };
  engine.state.player = { x: 485, y: 442 };
  engine.cashCollection.update(0);
  for (const { position } of CASH_POINTS) {
    engine.state.player = { ...position };
    engine.cashCollection.update(0);
  }
  engine.state.player = previous;
  engine.cashCollection.update(0);
}
