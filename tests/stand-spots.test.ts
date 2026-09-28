import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/game/data/gameConfig';
import { MACHINES } from '../src/game/data/machines';
import { FARM_PRODUCTS, PRODUCTS, plotPosition } from '../src/game/data/products';
import {
  farmStandSpot,
  machineStandSpot,
  shelfStandSpot,
  STAND_SPOT_RADIUS,
} from '../src/game/data/standSpots';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('floor standing targets', () => {
  it('places every harvest target within reach of its owned plot', () => {
    for (const product of FARM_PRODUCTS) {
      for (let index = 0; index < product.maxPlots; index += 1) {
        const spot = farmStandSpot(product.id, index);
        expect(
          distance(spot, plotPosition(product.id, index)) + STAND_SPOT_RADIUS,
        ).toBeLessThanOrEqual(55);
        expect(spot.y).toBeGreaterThanOrEqual(GAME_CONFIG.bounds.top);
        expect(spot.y).toBeLessThanOrEqual(GAME_CONFIG.bounds.bottom);
      }
    }
  });

  it('keeps shelf targets clear of shelves and wholly inside stocking range', () => {
    for (const product of PRODUCTS) {
      const spot = shelfStandSpot(product);
      expect(spot.y).toBeGreaterThan(product.shelf.y + 44);
      expect(distance(spot, product.shelf) + STAND_SPOT_RADIUS).toBeLessThanOrEqual(
        GAME_CONFIG.interactionRadius,
      );
      expect(spot.x).toBeLessThanOrEqual(GAME_CONFIG.areaBounds[product.area]);
    }
  });

  it('keeps processor targets outside machine collision boxes but inside transfer range', () => {
    for (const machine of MACHINES) {
      const spot = machineStandSpot(machine);
      expect(spot.y).toBeGreaterThan(machine.position.y + 35);
      expect(distance(spot, machine.position) + STAND_SPOT_RADIUS).toBeLessThanOrEqual(
        GAME_CONFIG.interactionRadius,
      );
      expect(spot.x).toBeLessThanOrEqual(GAME_CONFIG.areaBounds[machine.area]);
    }
  });
});
