import { GAME_CONFIG } from '../data/gameConfig';
import { MACHINES } from '../data/machines';
import { FARM_PRODUCTS, plotCount, plotPosition, productById } from '../data/products';
import type { GameEvent, GameState, MachineId, ProductId, Vec2, WorkerData } from '../types';
import { InventorySystem, itemCount } from './InventorySystem';
import { MachineSystem } from './MachineSystem';

export const helperCapacity = (state: GameState): number =>
  GAME_CONFIG.helperCapacities[Math.min(4, Math.max(0, state.upgrades.helperCapacity))];
export const helperSpeed = (state: GameState): number =>
  GAME_CONFIG.helperBaseSpeed * 1.1 ** Math.min(9, Math.max(0, state.upgrades.helperSpeed));

interface Job {
  task: Exclude<WorkerData['task'], 'idle'>;
  product: ProductId;
  target: Vec2;
  plotIndex?: number;
  machine?: MachineId;
}

/** Helpers reserve useful work, walk the aisles, and use the player's transfer rules. */
export class WorkerSystem {
  private readonly nextJob = new Map<number, number>();
  private readonly nextPlot = new Map<string, number>();

  constructor(
    private readonly state: GameState,
    private readonly inventory: InventorySystem,
    private readonly machines: MachineSystem,
    private readonly emit: (event: GameEvent) => void = () => {},
  ) {}

  private shelfRoom(id: ProductId, actor: WorkerData): number {
    const reserved = this.state.workers.reduce((total, worker) => {
      if (worker.id === actor.id) return total;
      const inputMachine =
        worker.machine && MACHINES.find((machine) => machine.id === worker.machine);
      const carried = inputMachine?.input === id ? 0 : worker.basket[id];
      const pending =
        worker.product === id &&
        (worker.task === 'collect' || (worker.task === 'harvest' && !worker.machine))
          ? Math.max(0, helperCapacity(this.state) - itemCount(worker.basket))
          : 0;
      return total + carried + pending;
    }, 0);
    return Math.max(0, this.state.shelfCapacities[id] - this.state.shelves[id] - reserved);
  }

  private machineRoom(id: MachineId, actor: WorkerData): number {
    if (!this.machines.isUnlocked(id)) return 0;
    const definition = MACHINES.find((machine) => machine.id === id)!;
    const machine = this.state.machines[id];
    const reserved = this.state.workers.reduce((total, worker) => {
      if (worker.id === actor.id || worker.machine !== id) return total;
      const pending =
        worker.task === 'harvest'
          ? Math.max(0, helperCapacity(this.state) - itemCount(worker.basket))
          : 0;
      return total + worker.basket[definition.input] + pending;
    }, 0);
    // Reserve output space as well as input space so a full production line cannot
    // attract every helper while other products need attention.
    return Math.max(
      0,
      Math.min(
        definition.bufferCapacity - machine.input,
        definition.bufferCapacity - machine.output - machine.processing - machine.input,
      ) - reserved,
    );
  }

  private harvestJob(worker: WorkerData, id: ProductId, machine?: MachineId): Job | null {
    const count = plotCount(this.state, id);
    const needed = machine ? this.machineRoom(machine, worker) : this.shelfRoom(id, worker);
    if (!count || needed <= 0) return null;
    const key = `${worker.id}:${id}`;
    const start = this.nextPlot.get(key) ?? 0;
    for (let offset = 0; offset < count; offset += 1) {
      const index = (start + offset) % count;
      const reserved = this.state.workers.reduce(
        (total, other) =>
          total +
          (other.id !== worker.id &&
          other.task === 'harvest' &&
          other.product === id &&
          other.plotIndex === index
            ? Math.max(0, helperCapacity(this.state) - itemCount(other.basket))
            : 0),
        0,
      );
      if (this.state.farms[id].plots[index].ready <= reserved) continue;
      this.nextPlot.set(key, (index + 1) % count);
      return {
        task: 'harvest',
        product: id,
        plotIndex: index,
        target: plotPosition(id, index),
        machine,
      };
    }
    return null;
  }

  private collectJob(worker: WorkerData, id: MachineId): Job | null {
    if (!this.machines.isUnlocked(id)) return null;
    const definition = MACHINES.find((machine) => machine.id === id)!;
    const reserved = this.state.workers.reduce(
      (total, other) =>
        total +
        (other.id !== worker.id && other.task === 'collect' && other.machine === id
          ? Math.max(0, helperCapacity(this.state) - itemCount(other.basket))
          : 0),
      0,
    );
    if (
      this.state.machines[id].output <= reserved ||
      this.shelfRoom(definition.output, worker) <= 0
    )
      return null;
    return {
      task: 'collect',
      product: definition.output,
      machine: id,
      target: { x: definition.position.x, y: definition.position.y + 65 },
    };
  }

  private deliverCarried(worker: WorkerData): Job | null {
    const canSupply = (id: MachineId): boolean => {
      const definition = MACHINES.find((machine) => machine.id === id)!;
      return (
        this.machines.isUnlocked(id) && this.state.machines[id].input < definition.bufferCapacity
      );
    };
    // A farm job can explicitly reserve its harvest for a processor.
    const preferred = worker.machine && MACHINES.find((machine) => machine.id === worker.machine);
    if (preferred && worker.basket[preferred.input] > 0 && canSupply(preferred.id))
      return {
        task: 'supply',
        product: preferred.input,
        machine: preferred.id,
        target: { x: preferred.position.x, y: preferred.position.y + 65 },
      };
    for (const id of this.state.unlockedProducts) {
      if (!worker.basket[id]) continue;
      const product = productById(id)!;
      if (this.state.shelves[id] < this.state.shelfCapacities[id])
        return {
          task: 'stock',
          product: id,
          target: { x: product.shelf.x, y: product.shelf.y + 65 },
        };
      const machine = MACHINES.find((entry) => entry.input === id && canSupply(entry.id));
      if (machine)
        return {
          task: 'supply',
          product: id,
          machine: machine.id,
          target: { x: machine.position.x, y: machine.position.y + 65 },
        };
    }
    return null;
  }

  private chooseJob(worker: WorkerData): Job | null {
    const delivery = this.deliverCarried(worker);
    if (delivery) return delivery;
    if (itemCount(worker.basket) >= helperCapacity(this.state)) return null;
    // A stable round-robin list means adding a crop or filling one shelf cannot
    // continually push another crop or a processor behind the same first job.
    const jobs: Array<() => Job | null> = [
      ...FARM_PRODUCTS.map((product) => () => this.harvestJob(worker, product.id)),
      ...MACHINES.map((machine) => () => this.harvestJob(worker, machine.input, machine.id)),
      ...MACHINES.map((machine) => () => this.collectJob(worker, machine.id)),
    ];
    const start = this.nextJob.get(worker.id) ?? worker.id - 1;
    for (let offset = 0; offset < jobs.length; offset += 1) {
      const index = (start + offset) % jobs.length;
      const job = jobs[index]();
      if (!job) continue;
      this.nextJob.set(worker.id, (index + 1) % jobs.length);
      return job;
    }
    return null;
  }

  private assign(worker: WorkerData, job: Job): void {
    worker.task = job.task;
    worker.product = job.product;
    worker.plotIndex = job.plotIndex;
    worker.machine = job.machine;
    worker.target = { ...job.target };
    worker.actionElapsed = 0;
    const aisle = worker.id % 2 ? 450 : 480;
    const route = [{ x: worker.x, y: aisle }, { x: job.target.x, y: aisle }, { ...job.target }];
    worker.path = Math.hypot(worker.x - job.target.x, worker.y - job.target.y) < 2 ? [] : route;
  }

  private move(worker: WorkerData, deltaMs: number): void {
    let remaining = (helperSpeed(this.state) * deltaMs) / 1000;
    while (worker.path.length && remaining > 0) {
      const point = worker.path[0];
      const distance = Math.hypot(point.x - worker.x, point.y - worker.y);
      if (distance <= remaining) {
        worker.x = point.x;
        worker.y = point.y;
        worker.path.shift();
        remaining -= distance;
      } else {
        worker.x += ((point.x - worker.x) / distance) * remaining;
        worker.y += ((point.y - worker.y) / distance) * remaining;
        remaining = 0;
      }
    }
  }

  private act(worker: WorkerData): void {
    const product = worker.product;
    if (!product) {
      worker.task = 'idle';
      return;
    }
    const capacity = helperCapacity(this.state);
    let moved = 0;
    const task = worker.task;
    if (task === 'harvest') {
      const needed = worker.machine
        ? this.machineRoom(worker.machine, worker)
        : this.shelfRoom(product, worker);
      moved = this.inventory.harvestInto(
        product,
        worker.basket,
        capacity,
        Math.min(capacity, needed),
        worker.plotIndex,
      );
    } else if (task === 'stock') moved = this.inventory.stockFrom(product, worker.basket, capacity);
    else if (task === 'supply' && worker.machine)
      moved = this.machines.supply(worker.machine, worker.basket, capacity);
    else if (task === 'collect' && worker.machine)
      moved = this.machines.collect(
        worker.machine,
        worker.basket,
        capacity,
        Math.min(capacity, this.shelfRoom(product, worker)),
      );
    if (moved)
      this.emit({
        type: task === 'harvest' ? 'harvest' : 'stock',
        text: `${task === 'harvest' || task === 'collect' ? '+' : '−'}${moved}`,
        x: worker.x,
        y: worker.y,
      });
    worker.task = 'idle';
    worker.path = [];
    worker.actionElapsed = 0;
    if (!itemCount(worker.basket)) worker.machine = undefined;
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remaining = deltaMs;
    while (remaining > 0) {
      const step = Math.min(50, remaining);
      remaining -= step;
      for (const worker of this.state.workers) {
        if (worker.task === 'idle') {
          const job = this.chooseJob(worker);
          if (!job) continue;
          this.assign(worker, job);
        }
        this.move(worker, step);
        if (worker.path.length) continue;
        worker.actionElapsed += step;
        if (worker.actionElapsed >= GAME_CONFIG.harvestInterval) this.act(worker);
      }
    }
  }
}
