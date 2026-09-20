import { MACHINES } from '../data/machines';
import type { GameEvent, GameState, ItemCounts, MachineId } from '../types';
import { InventorySystem, itemCount } from './InventorySystem';

const validQuantity = (quantity: number): boolean => Number.isSafeInteger(quantity) && quantity > 0;

export class MachineSystem {
  constructor(
    private readonly state: GameState,
    _inventory?: InventorySystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  isUnlocked(id: MachineId): boolean {
    const definition = MACHINES.find((machine) => machine.id === id);
    return Boolean(
      definition &&
      this.state.upgrades.expansion >= definition.area &&
      this.state.upgrades[definition.upgrade] > 0,
    );
  }

  supply(id: MachineId, actor: ItemCounts, requested = 1): number {
    const definition = MACHINES.find((machine) => machine.id === id);
    if (!definition || !this.isUnlocked(id) || !validQuantity(requested)) return 0;
    const machine = this.state.machines[id];
    const quantity = Math.min(
      requested,
      actor[definition.input],
      Math.max(0, definition.bufferCapacity - machine.input),
    );
    actor[definition.input] -= quantity;
    machine.input += quantity;
    return quantity;
  }

  collect(id: MachineId, actor: ItemCounts, capacity: number, requested = 1): number {
    const definition = MACHINES.find((machine) => machine.id === id);
    if (
      !definition ||
      !this.isUnlocked(id) ||
      !validQuantity(requested) ||
      !validQuantity(capacity)
    )
      return 0;
    const machine = this.state.machines[id];
    const quantity = Math.min(requested, machine.output, Math.max(0, capacity - itemCount(actor)));
    machine.output -= quantity;
    actor[definition.output] += quantity;
    return quantity;
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    for (const definition of MACHINES) {
      if (!this.isUnlocked(definition.id)) continue;
      const machine = this.state.machines[definition.id];
      let remaining = deltaMs;
      while (remaining > 0) {
        if (!machine.processing) {
          const batch = Math.min(
            2 * this.state.upgrades[definition.upgrade],
            machine.input,
            Math.max(0, definition.bufferCapacity - machine.output),
          );
          if (!batch) {
            machine.elapsed = 0;
            break;
          }
          machine.input -= batch;
          machine.processing = batch;
          machine.elapsed = 0;
        }
        const step = Math.min(remaining, definition.batchMs - machine.elapsed);
        machine.elapsed += step;
        remaining -= step;
        if (machine.elapsed < definition.batchMs) break;
        const completed = machine.processing;
        machine.output += completed;
        machine.processing = 0;
        machine.elapsed = 0;
        this.emit({ type: 'stock', text: `+${completed} ready`, ...definition.position });
      }
    }
  }
}
