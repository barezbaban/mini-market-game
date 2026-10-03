import type { GameState, MachineDefinition } from '../types';
export const machineDuration = (state: GameState, machine: MachineDefinition): number =>
  machine.batchMs / 1.2 ** state.upgrades.machineSpeed;
export const MACHINES: MachineDefinition[] = [
  {
    id: 'paste',
    name: 'Tomato cannery',
    input: 'tomato',
    output: 'tomatoPaste',
    position: { x: 200, y: 1000 },
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
    position: { x: 440, y: 1000 },
    upgrade: 'coffeeMachine',
    batchMs: 8000,
    bufferCapacity: 24,
    area: 2,
  },
  {
    id: 'dairy',
    name: 'Dairy kitchen',
    input: 'milk',
    output: 'cheese',
    position: { x: 1280, y: 1000 },
    upgrade: 'dairyMachine',
    batchMs: 7000,
    bufferCapacity: 24,
    area: 4,
  },
  {
    id: 'grill',
    name: 'Corn grill',
    input: 'corn',
    output: 'grilledCorn',
    position: { x: 900, y: 1000 },
    upgrade: 'grillMachine',
    batchMs: 6000,
    bufferCapacity: 24,
    area: 3,
  },
];
