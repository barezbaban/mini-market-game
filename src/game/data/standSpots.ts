import { plotPosition } from './products';
import type { MachineDefinition, ProductDefinition, ProductId, Vec2 } from '../types';

/** All points sit on walkable ground and inside the corresponding interaction radius. */
export const STAND_SPOT_RADIUS = 20;

export const farmStandSpot = (id: ProductId, index: number): Vec2 => {
  const plot = plotPosition(id, index);
  return { x: plot.x, y: plot.y - 35 };
};

export const shelfStandSpot = (product: ProductDefinition, offset = 50): Vec2 => {
  const { x, y, facing } = product.shelf;
  if (facing === 'east') return { x: x + offset, y };
  if (facing === 'west') return { x: x - offset, y };
  return { x, y: y + offset };
};

export const machineStandSpot = (machine: MachineDefinition): Vec2 => ({
  x: machine.position.x,
  y: machine.position.y + 50,
});
