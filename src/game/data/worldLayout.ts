import { GAME_CONFIG } from './gameConfig';
import { MACHINES } from './machines';
import { PRODUCTS } from './products';
import type { GameState, Vec2 } from '../types';

export const LAYOUT_VERSION = 2 as const;
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const STORE_WALLS: Rect[] = [
  { left: 90, right: 1410, top: 120, bottom: 140 },
  { left: 90, right: 110, top: 130, bottom: 670 },
  { left: 90, right: 110, top: 790, bottom: 900 },
  { left: 1390, right: 1410, top: 130, bottom: 900 },
  { left: 100, right: 530, top: 890, bottom: 910 },
  { left: 710, right: 1400, top: 890, bottom: 910 },
];
export const rectangle = (point: Vec2, halfWidth: number, halfDepth: number): Rect => ({
  left: point.x - halfWidth,
  right: point.x + halfWidth,
  top: point.y - halfDepth,
  bottom: point.y + halfDepth,
});
export function worldSolids(state: GameState): Rect[] {
  const solids = [...STORE_WALLS];
  for (const product of PRODUCTS)
    if (state.upgrades.expansion >= product.area) solids.push(rectangle(product.shelf, 78, 44));
  for (const machine of MACHINES)
    if (state.upgrades[machine.upgrade]) solids.push(rectangle(machine.position, 118, 36));
  for (const counter of [
    GAME_CONFIG.checkout,
    ...(state.upgrades.secondCashier ? [GAME_CONFIG.secondCheckout] : []),
  ])
    solids.push({
      left: counter.x - 37,
      right: counter.x + 37,
      top: counter.y - 53,
      bottom: counter.y + 35,
    });
  for (const x of [-58, 58])
    solids.push(rectangle({ x: GAME_CONFIG.office.x + x, y: GAME_CONFIG.office.y }, 43, 29));
  if (state.upgrades.driveThrough) solids.push(rectangle(GAME_CONFIG.driveThroughWindow, 36, 45));
  solids.push(rectangle(GAME_CONFIG.trash, 32, 32));
  return solids;
}
export function crossesRect(start: Vec2, end: Vec2, rect: Rect): boolean {
  let enter = 0,
    exit = 1;
  for (const [origin, delta, low, high] of [
    [start.x, end.x - start.x, rect.left + 0.001, rect.right - 0.001],
    [start.y, end.y - start.y, rect.top + 0.001, rect.bottom - 0.001],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < low || origin > high) return false;
    } else {
      const a = (low - origin) / delta,
        b = (high - origin) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter >= exit) return false;
    }
  }
  return enter < exit;
}
