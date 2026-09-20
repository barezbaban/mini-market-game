import { Group, Mesh, Vector3 } from 'three';
import type { Scene } from 'three';
import { GAME_CONFIG } from '../../data/gameConfig';
import { PRODUCTS, plotCount, plotPosition } from '../../data/products';
import { MACHINES } from '../../data/machines';
import { upgradeCost } from '../../data/upgrades';
import type {
  GameState,
  MachineDefinition,
  MachineId,
  ProductDefinition,
  ProductId,
} from '../../types';
import { createChicken, createProduce } from '../Models';
import { block, disc, label, PALETTE as C, ring, sphere } from './WorldKit';
import type { WorldLabel } from './WorldKit';

const point = (x: number, y: number, height = 0) =>
  new Vector3((x - 640) / 100, height, (y - 390) / 100);
interface PlotVisual {
  group: Group;
  live: Group;
  marker: Group;
  markerLabel: WorldLabel;
  products: Group[];
  ready: WorldLabel;
  progress: Mesh;
  chicken?: Group;
}
interface ProductVisual {
  shelf: Group;
  items: Group[];
  count: WorldLabel;
  farmTitle?: WorldLabel;
  plots: PlotVisual[];
}
interface MachineVisual {
  root: Group;
  body: Group;
  locked: Group;
  status: WorldLabel;
  level: WorldLabel;
  progress: Mesh;
  rotor: Group;
  input: Group[];
  output: Group[];
}

/** Each display corresponds directly to a simulation shelf, plot, or machine. */
export class StoreDisplays {
  private readonly products = new Map<ProductId, ProductVisual>();
  private readonly machines = new Map<MachineId, MachineVisual>();
  private readonly wings: { floor: Group; gate: Group; price: WorldLabel; area: number }[] = [];

  constructor(private readonly scene: Scene) {
    this.createWings();
    PRODUCTS.forEach((product) => this.createProduct(product));
    MACHINES.forEach((machine) => this.createMachine(machine));
  }

  update(state: GameState, time: number): void {
    this.wings.forEach(({ floor, gate, price, area }) => {
      floor.visible = state.upgrades.expansion >= area;
      gate.visible = state.upgrades.expansion === area - 1;
      price.setText(`EXPAND  $${upgradeCost(state, 'expansion')}`, '#1d7255', '#fff9e4');
    });
    PRODUCTS.forEach((product) => {
      const visual = this.products.get(product.id)!;
      const areaOpen = state.upgrades.expansion >= product.area;
      const unlocked = state.unlockedProducts.includes(product.id);
      visual.shelf.visible = areaOpen;
      visual.items.forEach((item, index) => {
        item.visible = unlocked && index < state.shelves[product.id];
      });
      visual.count.setText(
        unlocked ? `${state.shelves[product.id]} / 12` : 'LOCKED',
        unlocked ? '#217653' : '#899981',
      );
      if (visual.farmTitle) visual.farmTitle.object.visible = areaOpen;
      const owned = plotCount(state, product.id);
      visual.plots.forEach((plot, index) => {
        const active = index < owned;
        plot.group.visible = areaOpen;
        plot.live.visible = active;
        plot.marker.visible = !active;
        plot.markerLabel.object.visible = index === owned;
        if (index === owned) {
          const upgrade =
            !unlocked && product.unlockUpgrade ? product.unlockUpgrade : product.plotUpgrade;
          plot.markerLabel.setText(
            upgrade ? `+ $${upgradeCost(state, upgrade)}` : 'LOCKED',
            '#67905d',
            '#edf6db',
          );
        }
        const data = state.farms[product.id].plots[index];
        const ready = data?.ready ?? 0;
        plot.products.forEach((item, itemIndex) => {
          item.visible = itemIndex < ready;
        });
        plot.ready.setText(ready ? String(ready) : '…', ready ? '#18754f' : '#8b967e', '#fffbe9');
        const progress =
          ready >= GAME_CONFIG.farmCapacity ? 1 : (data?.elapsed ?? 0) / product.productionTime;
        plot.progress.scale.x = Math.max(0.003, Math.min(1, progress) * 0.35);
        plot.progress.position.x = -0.175 + Math.min(1, progress) * 0.175;
        if (plot.chicken) plot.chicken.rotation.y = Math.sin(time / 1500 + index * 2) * 0.5;
      });
    });
    MACHINES.forEach((machine) => {
      const visual = this.machines.get(machine.id)!;
      const level = state.upgrades[machine.upgrade];
      const data = state.machines[machine.id];
      visual.root.visible = state.upgrades.expansion >= machine.area;
      visual.body.visible = level > 0;
      visual.locked.visible = level === 0;
      visual.level.setText(
        `LEVEL ${level} · ${level * 2} / BATCH`,
        '#ffffff',
        machine.id === 'paste' ? '#cc765e' : '#8b654b',
      );
      visual.status.setText(
        data.processing
          ? `MAKING ${data.processing}`
          : data.output
            ? `${data.output} READY`
            : 'ADD INGREDIENTS',
        '#1d6e51',
        '#fff9e9',
      );
      visual.progress.visible = data.processing > 0;
      visual.progress.geometry.setDrawRange(
        0,
        Math.floor(Math.min(1, data.elapsed / machine.batchMs) * 64) * 6,
      );
      if (data.processing) visual.rotor.rotation.z = time / 250;
      visual.input.forEach((item, index) => {
        item.visible = index < data.input;
      });
      visual.output.forEach((item, index) => {
        item.visible = index < data.output;
      });
    });
  }

  private createProduct(product: ProductDefinition): void {
    const shelf = new Group();
    shelf.name = `shelf-${product.id}`;
    shelf.position.copy(point(product.shelf.x, product.shelf.y));
    this.scene.add(shelf);
    block(shelf, 0, 0.14, 0, 1.46, 0.2, 0.72, C.green);
    block(shelf, 0, 0.54, -0.4, 1.44, 0.9, 0.075, C.cream);
    [-0.68, 0.68].forEach((x) => block(shelf, x, 0.49, -0.015, 0.075, 0.84, 0.81, C.cream));
    const items: Group[] = [];
    for (let row = 0; row < 3; row += 1) {
      const y = 0.27 + row * 0.24;
      const z = 0.25 - row * 0.25;
      block(shelf, 0, y, z, 1.44, 0.07, 0.27, C.wood);
      block(shelf, 0, y - 0.023, z + 0.145, 1.44, 0.075, 0.025, product.color);
      for (let column = 0; column < 4; column += 1) {
        const produce = createProduce(product.id);
        produce.position.set(-0.47 + column * 0.315, y + 0.13, z);
        produce.scale.setScalar(1.05);
        shelf.add(produce);
        items.push(produce);
      }
    }
    const name = label(shelf, product.plural.toUpperCase(), 1.34, 0.2, {
      foreground: '#246b50',
      background: '#fff9e7',
    });
    name.object.position.set(0, 1.13, -0.23);
    const count = label(shelf, '0 / 12', 0.64, 0.2, {
      foreground: '#217653',
      background: '#ffffff',
    });
    count.object.position.set(0, 0.15, 0.48);
    let farmTitle: WorldLabel | undefined;
    const plots: PlotVisual[] = [];
    if (product.kind === 'farm') {
      farmTitle = label(
        this.scene,
        product.id === 'egg' ? 'CHICKEN FARM' : `${product.plural.toUpperCase()} FARM`,
        product.id === 'carrot' ? 1.9 : 1.65,
        0.22,
        { foreground: '#438154', background: '#eef6d8' },
      );
      farmTitle.object.position.copy(
        point(product.farm.x + (product.id === 'carrot' ? 30 : 0), product.farm.y - 62, 0.16),
      );
      for (let index = 0; index < product.maxPlots; index += 1)
        plots.push(this.createPlot(product, index));
    }
    this.products.set(product.id, { shelf, items, count, plots, farmTitle });
  }

  private createPlot(product: ProductDefinition, index: number): PlotVisual {
    const position = plotPosition(product.id, index);
    const group = new Group();
    group.name = `plot-${product.id}-${index}`;
    group.position.copy(point(position.x, position.y));
    this.scene.add(group);
    const live = new Group();
    group.add(live);
    const size = product.id === 'carrot' ? 0.49 : 0.74;
    block(live, 0, 0.075, 0, size, 0.15, 0.71, C.wood);
    block(live, 0, 0.155, 0, size - 0.09, 0.035, 0.61, product.id === 'egg' ? 0xe4bd6c : C.soil);
    const products: Group[] = [];
    let chicken: Group | undefined;
    if (product.id === 'egg') {
      disc(live, 0, 0.19, 0.09, 0.2, 0.035, 0xc49b57);
      disc(live, 0, 0.215, 0.09, 0.15, 0.025, 0xf4d888);
      chicken = createChicken();
      chicken.position.set(0.12, 0.16, -0.11);
      chicken.scale.setScalar(0.85);
      live.add(chicken);
    } else if (product.id === 'tomato' || product.id === 'coffee') {
      disc(live, 0, 0.43, 0, 0.025, 0.57, product.id === 'coffee' ? 0x8c6949 : 0x4d9343);
      [-1, 1].forEach((side) => {
        const branch = block(live, side * 0.1, 0.46, 0, 0.25, 0.028, 0.035, 0x4c903e);
        branch.rotation.z = side * 0.6;
        const leaf = sphere(
          live,
          side * 0.14,
          0.54,
          -0.05,
          0.14,
          product.id === 'coffee' ? 0x387d47 : 0x5f9f47,
        );
        leaf.scale.y *= 0.65;
      });
      sphere(live, 0, 0.69, -0.055, 0.13, 0x70a84d);
    } else if (product.id === 'corn') {
      [-0.13, 0.13].forEach((x) => {
        disc(live, x, 0.46, 0, 0.024, 0.6, 0x72a548);
        const leaf = block(live, x + 0.08, 0.46, 0, 0.25, 0.025, 0.09, 0x62a24a);
        leaf.rotation.z = 0.55;
      });
    } else {
      for (let stem = -1; stem <= 1; stem += 1) {
        const leaf = block(live, stem * 0.034, 0.3, 0, 0.035, 0.25, 0.04, 0x57963f);
        leaf.rotation.z = stem * -0.35;
      }
    }
    for (let item = 0; item < Math.max(3, product.yieldPerPlot); item += 1) {
      const produce = createProduce(product.id);
      produce.position.set(
        ((item % 3) - 1) * 0.14,
        product.id === 'egg'
          ? 0.29
          : product.id === 'carrot'
            ? 0.23
            : 0.48 - Math.floor(item / 3) * 0.16,
        0.1,
      );
      if (product.id === 'coffee') produce.scale.setScalar(0.85);
      live.add(produce);
      products.push(produce);
    }
    const ready = label(live, '…', 0.29, 0.2, { foreground: '#18754f', background: '#fffbe9' });
    ready.object.position.set(0.28, 0.53, 0.25);
    block(live, 0, 0.19, 0.41, 0.37, 0.025, 0.036, C.cream);
    const progress = block(live, -0.175, 0.197, 0.411, 0.003, 0.025, 0.038, C.green);
    const marker = new Group();
    group.add(marker);
    const outline = ring(marker, product.id === 'carrot' ? 0.23 : 0.32, 0xd4edb3, 0.025);
    outline.position.y = 0.047;
    const plus = label(marker, '+', 0.25, 0.25, { foreground: '#95b970', flat: true });
    plus.object.position.y = 0.051;
    const markerLabel = label(marker, '', 0.71, 0.22, {
      foreground: '#67905d',
      background: '#edf6db',
    });
    markerLabel.object.position.set(0, 0.32, 0);
    return { group, live, marker, markerLabel, products, ready, progress, chicken };
  }

  private createMachine(machine: MachineDefinition): void {
    const root = new Group();
    root.name = `machine-${machine.id}`;
    root.position.copy(point(machine.position.x, machine.position.y));
    this.scene.add(root);
    const body = new Group();
    root.add(body);
    const color = machine.id === 'paste' ? 0xe88b70 : 0xb58964;
    block(body, 0, 0.31, 0, 0.94, 0.6, 0.73, color);
    block(body, 0, 0.055, 0, 1.06, 0.11, 0.82, C.green);
    block(body, 0, 0.66, 0, 1.02, 0.12, 0.81, C.cream);
    disc(body, 0, 0.95, -0.17, 0.26, 0.5, machine.id === 'paste' ? 0xced9c4 : 0xf2d59e);
    disc(body, 0, 1.22, -0.17, 0.31, 0.055, C.green);
    block(body, -0.53, 0.33, 0, 0.21, 0.12, 0.34, C.cream);
    block(body, 0.57, 0.33, 0, 0.3, 0.12, 0.34, C.cream);
    block(body, -0.91, 0.19, 0, 0.57, 0.11, 0.5, C.wood);
    block(body, 0.93, 0.19, 0, 0.54, 0.11, 0.5, C.wood);
    const input: Group[] = [];
    const output: Group[] = [];
    for (let index = 0; index < 8; index += 1) {
      const raw = createProduce(machine.input);
      raw.position.set(-1.07 + (index % 3) * 0.14, 0.31 + Math.floor(index / 3) * 0.14, 0.04);
      body.add(raw);
      input.push(raw);
      const made = createProduce(machine.output);
      made.position.set(0.78 + (index % 3) * 0.15, 0.33 + Math.floor(index / 3) * 0.18, 0.04);
      body.add(made);
      output.push(made);
    }
    const rotor = new Group();
    rotor.position.set(0, 0.48, 0.39);
    body.add(rotor);
    const wheel = disc(rotor, 0, 0, 0, 0.16, 0.035, C.green);
    wheel.rotation.x = Math.PI / 2;
    block(rotor, 0, 0, 0.025, 0.22, 0.04, 0.03, C.cream);
    block(rotor, 0, 0, 0.025, 0.04, 0.22, 0.03, C.cream);
    const title = label(body, machine.name.toUpperCase(), 1.95, 0.25, {
      foreground: '#4b704f',
      background: '#fff9e8',
    });
    title.object.position.set(0, 1.74, -0.1);
    const level = label(body, '', 1.55, 0.21, { foreground: '#ffffff', background: '#cc765e' });
    level.object.position.set(0, 1.46, 0.25);
    const status = label(body, '', 1.3, 0.24, { foreground: '#1d6e51', background: '#fff9e9' });
    status.object.position.set(0, 0.12, 0.6);
    const progress = ring(body, 0.67, C.gold, 0.065);
    progress.position.y = 0.035;
    const locked = new Group();
    root.add(locked);
    block(locked, 0, 0.025, 0, 1.52, 0.05, 1.1, 0xcae2a5);
    const lockedTitle = label(locked, machine.name.toUpperCase(), 1.8, 0.25, {
      foreground: '#4b8057',
    });
    lockedTitle.object.position.set(0, 0.36, -0.15);
    const lockedPrice = label(locked, 'BUILD FROM MANAGE', 1.63, 0.22, {
      foreground: '#68935e',
      background: '#eff6de',
    });
    lockedPrice.object.position.set(0, 0.12, 0.28);
    this.machines.set(machine.id, {
      root,
      body,
      locked,
      status,
      level,
      progress,
      rotor,
      input,
      output,
    });
  }

  private createWings(): void {
    const names = ['PRODUCTION WING', 'COFFEE CORNER', 'CARROT GARDEN'];
    for (let area = 1; area <= 3; area += 1) {
      const left = GAME_CONFIG.areaBounds[area - 1];
      const right = GAME_CONFIG.areaBounds[area];
      const width = (right - left) / 100;
      const floor = new Group();
      floor.name = `expansion-area-${area}`;
      this.scene.add(floor);
      const center = ((left + right) / 2 - 640) / 100;
      block(floor, center, -0.01, -1.12, width, 0.13, 3.82, C.cream);
      for (let x = (left - 640) / 100 + 0.12; x < (right - 640) / 100; x += 0.58)
        block(floor, x, 0.061, -1.12, 0.012, 0.009, 3.75, C.grout, false);
      for (let z = -2.9; z < 0.7; z += 0.58)
        block(floor, center, 0.061, z, width - 0.1, 0.009, 0.012, C.grout, false);
      block(floor, center, 0.32, -3, width, 0.65, 0.14, C.mint);
      block(floor, center, 0.675, -3, width, 0.09, 0.21, C.green);
      block(floor, center, -0.012, 3.1, width - 0.13, 0.045, 4.55, 0x9acd79);
      const title = label(floor, names[area - 1], Math.min(2.5, width - 0.2), 0.24, {
        foreground: '#ffffff',
        background: '#26976d',
      });
      title.object.position.set(center, 0.98, -2.9);
      const gate = new Group();
      gate.name = `expansion-gate-${area}`;
      gate.position.x = (left - 640) / 100 + 0.11;
      this.scene.add(gate);
      for (let z = -2.7; z < 5.4; z += 0.67) {
        block(gate, 0, 0.35, z, 0.09, 0.7, 0.09, C.cream);
      }
      block(gate, 0, 0.35, 1.3, 0.045, 0.065, 8.1, 0xcde39d);
      const gateName = label(gate, names[area - 1], 2.1, 0.25, {
        foreground: '#4d8357',
        background: '#eff6de',
      });
      gateName.object.position.set(0.5, 1.0, 0.4);
      const price = label(gate, '', 1.68, 0.3, { foreground: '#1d7255', background: '#fff9e4' });
      price.object.position.set(0.5, 0.62, 0.5);
      this.wings.push({ floor, gate, price, area });
    }
  }
}
