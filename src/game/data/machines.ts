import type { MachineDefinition } from '../types';
export const MACHINES: MachineDefinition[] = [
  {
    id: 'paste',
    name: 'Tomato cannery',
    input: 'tomato',
    output: 'tomatoPaste',
    position: { x: 1320, y: 580 },
    upgrade: 'pasteMachine',
    batchMs: 6000,
    bufferCapacity: 24,
    area: 1,
  },
  {
    id: 'coffee',
    name: 'Coffee grinder',
    input: 'coffee',
    output: 'groundCoffee',
    position: { x: 1740, y: 580 },
    upgrade: 'coffeeMachine',
    batchMs: 8000,
    bufferCapacity: 24,
    area: 2,
  },
];
