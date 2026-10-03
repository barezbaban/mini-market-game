import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import { GAME_CONFIG } from '../../data/gameConfig';
import { PRODUCTS, plotCount, plotPosition } from '../../data/products';
import { MACHINES, machineDuration } from '../../data/machines';
import { SHELF_COLUMNS, shelfRows } from '../../data/upgrades';
import {
  farmStandSpot,
  machineStandSpot,
  shelfStandSpot,
  STAND_SPOT_RADIUS,
} from '../../data/standSpots';
import type {
  GameState,
  MachineDefinition,
  MachineId,
  ProductDefinition,
  ProductId,
  Vec2,
} from '../../types';
import { createChicken, createCow, createProduce } from '../Models';
import { itemCount } from '../../systems/InventorySystem';
import { block, disc, label, PALETTE as C, ring, sphere } from './WorldKit';
import type { WorldLabel } from './WorldKit';

const point = (x: number, y: number, height = 0) =>
  new Vector3((x - 640) / 100, height, (y - 390) / 100);
const standFillGeometry = new CircleGeometry(0.16, 32);
interface StandVisual {
  group: Group;
  outline: Mesh;
  fill: Mesh;
  position: Vec2;
}
interface PlotVisual {
  group: Group;
  live: Group;
  marker: Group;
  products: Group[];
  ready: WorldLabel;
  progress: Mesh;
  chicken?: Group;
  stand: StandVisual;
}
interface ProductVisual {
  shelf: Group;
  stand: StandVisual;
  items: Group[];
  count: WorldLabel;
  title: WorldLabel;
  rows: Group[];
  back: Mesh;
  header: Mesh;
  sides: Mesh[];
  rowCount: number;
  farmSign?: Group;
  plots: PlotVisual[];
}
interface MachineVisual {
  root: Group;
  stand: StandVisual;
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
  private readonly yards: { floor: Group; area: number }[] = [];
  private compactLabels = false;

  constructor(private readonly scene: Scene) {
    this.createFarmYard();
    PRODUCTS.forEach((product) => this.createProduct(product));
    MACHINES.forEach((machine) => this.createMachine(machine));
  }

  setCompactLabels(compact: boolean): void {
    this.compactLabels = compact;
  }

  update(state: GameState, time: number): void {
    const playerHasRoom = itemCount(state.inventory) < state.inventoryCapacity;
    this.yards.forEach(({ floor, area }) => {
      floor.visible = state.upgrades.expansion >= area;
    });
    PRODUCTS.forEach((product) => {
      const visual = this.products.get(product.id)!;
      const areaOpen = state.upgrades.expansion >= product.area;
      const unlocked = state.unlockedProducts.includes(product.id);
      visual.shelf.visible = areaOpen;
      if (areaOpen) this.resizeShelf(visual, product, shelfRows(state.upgrades.shelf));
      this.updateStand(
        visual.stand,
        areaOpen &&
          unlocked &&
          state.inventory[product.id] > 0 &&
          state.shelves[product.id] < state.shelfCapacities[product.id],
        state.player,
        product.shelf,
        GAME_CONFIG.interactionRadius,
      );
      visual.items.forEach((item, index) => {
        item.visible = unlocked && index < state.shelves[product.id];
      });
      visual.count.setText(
        unlocked ? `${state.shelves[product.id]}/${state.shelfCapacities[product.id]}` : 'LOCKED',
        unlocked ? '#ffffff' : '#59675e',
        unlocked ? '#168a65' : '#f0f2e6',
      );
      if (visual.farmSign) visual.farmSign.visible = areaOpen && !this.compactLabels;
      const owned = plotCount(state, product.id);
      visual.plots.forEach((plot, index) => {
        const active = index < owned;
        plot.group.visible = areaOpen;
        plot.live.visible = active;
        plot.marker.visible = !active;
        const data = state.farms[product.id].plots[index];
        const ready = data?.ready ?? 0;
        this.updateStand(
          plot.stand,
          active && ready > 0 && playerHasRoom,
          state.player,
          plotPosition(product.id, index),
          55,
        );
        plot.products.forEach((item, itemIndex) => {
          item.visible = itemIndex < ready;
        });
        plot.ready.object.visible = active && ready > 0;
        if (ready) plot.ready.setText(String(ready), '#18754f', '#fffbe9');
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
      this.updateStand(
        visual.stand,
        state.upgrades.expansion >= machine.area &&
          level > 0 &&
          ((state.inventory[machine.input] > 0 && data.input < machine.bufferCapacity) ||
            (data.output > 0 && playerHasRoom)),
        state.player,
        machine.position,
        GAME_CONFIG.interactionRadius,
      );
      visual.body.visible = level > 0;
      visual.locked.visible = level === 0;
      visual.level.setText(
        `LV${level} · ${level * 2}/BATCH`,
        '#ffffff',
        machine.id === 'paste' ? '#cc765e' : machine.id === 'coffee' ? '#8b654b' : '#6daeb9',
      );
      visual.status.setText(
        data.processing
          ? `MAKING ${data.processing}`
          : data.output
            ? `${data.output} READY`
            : `ADD ${machine.input.toUpperCase()}`,
        '#1d6e51',
        '#fff9e9',
      );
      visual.progress.visible = data.processing > 0;
      visual.progress.geometry.setDrawRange(
        0,
        Math.floor(Math.min(1, data.elapsed / machineDuration(state, machine)) * 64) * 6,
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

  private createStand(id: string, position: Vec2): StandVisual {
    const group = new Group();
    group.name = `stand-spot-${id}`;
    group.position.copy(point(position.x, position.y));
    group.visible = false;
    this.scene.add(group);
    const fill = new Mesh(
      standFillGeometry,
      new MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.086;
    fill.renderOrder = 1;
    group.add(fill);
    const outline = ring(group, STAND_SPOT_RADIUS / 100, C.gold, 0.043);
    outline.name = `${group.name}:outline`;
    outline.position.y = 0.095;
    block(group, -0.037, 0.091, -0.024, 0.035, 0.008, 0.075, C.white).rotation.y = -0.2;
    block(group, 0.037, 0.091, 0.024, 0.035, 0.008, 0.075, C.white).rotation.y = 0.2;
    return { group, outline, fill, position };
  }

  private updateStand(
    stand: StandVisual,
    usable: boolean,
    player: Vec2,
    target: Vec2,
    reach: number,
  ): void {
    stand.group.visible =
      usable && Math.hypot(player.x - stand.position.x, player.y - stand.position.y) < 400;
    if (!stand.group.visible) return;
    const inRange = Math.hypot(player.x - target.x, player.y - target.y) <= reach;
    const color = inRange ? C.green : C.gold;
    (stand.outline.material as MeshBasicMaterial).color.setHex(color);
    (stand.fill.material as MeshBasicMaterial).color.setHex(color);
  }

  private createProduct(product: ProductDefinition): void {
    const shelf = new Group();
    shelf.name = `shelf-${product.id}`;
    shelf.position.copy(point(product.shelf.x, product.shelf.y));
    this.scene.add(shelf);
    const stand = this.createStand(`shelf-${product.id}`, shelfStandSpot(product));
    block(shelf, 0, 0.14, 0, 1.46, 0.2, 0.72, C.green);
    const back = block(shelf, 0, 0.54, -0.4, 1.44, 0.9, 0.075, C.cream);
    const header = block(shelf, 0, 1.14, -0.4, 1.44, 0.28, 0.075, C.cream);
    const sides = [-0.68, 0.68].map((x) =>
      block(shelf, x, 0.49, -0.015, 0.075, 0.84, 0.81, C.cream),
    );
    const items: Group[] = [];
    const name = label(shelf, product.plural.toUpperCase(), 1.4, 0.27, {
      id: `shelf:${product.id}:title`,
      kind: 'object',
      mount: 'surface',
      foreground: '#246b50',
      background: '#fff9e7',
    });
    name.object.position.set(0, 1.14, -0.355);
    // A forward, angled stock plate stays readable from the overhead camera.
    const stockPlate = new Group();
    stockPlate.position.set(0, 0.19, 0.53);
    stockPlate.rotation.x = -0.55;
    shelf.add(stockPlate);
    block(stockPlate, 0, 0, 0, 0.85, 0.28, 0.025, C.green);
    const count = label(stockPlate, '0/12', 0.76, 0.25, {
      id: `shelf:${product.id}:count`,
      kind: 'status',
      mount: 'surface',
      foreground: '#ffffff',
      background: '#168a65',
      border: false,
    });
    count.object.position.set(0, 0, 0.016);
    let farmSign: Group | undefined;
    const plots: PlotVisual[] = [];
    if (product.kind === 'farm') {
      const farmNames: Record<ProductId, string> = {
        tomato: 'TOMATO FARM',
        egg: 'CHICKEN COOP',
        corn: 'CORN FIELD',
        coffee: 'COFFEE GROVE',
        carrot: 'CARROT PATCH',
        milk: 'DAIRY COWS',
        tomatoPaste: '',
        groundCoffee: '',
        cheese: '',
        grilledCorn: '',
      };
      farmSign = new Group();
      farmSign.name = `farm-sign-${product.id}`;
      farmSign.position.copy(
        point(product.farm.x + (product.id === 'carrot' ? 30 : 0), product.farm.y - 68),
      );
      this.scene.add(farmSign);
      const signWidth = product.id === 'carrot' ? 1.45 : 1.25;
      block(farmSign, 0, 0.51, 0, signWidth, 0.24, 0.055, C.green);
      block(farmSign, 0, 0.25, 0, 0.045, 0.42, 0.045, C.green);
      const farmTitle = label(farmSign, farmNames[product.id], signWidth - 0.12, 0.16, {
        id: `farm:${product.id}:title`,
        kind: 'area',
        mount: 'surface',
        foreground: '#ffffff',
        border: false,
      });
      farmTitle.object.position.set(0, 0.51, 0.031);
      for (let index = 0; index < product.maxPlots; index += 1)
        plots.push(this.createPlot(product, index));
    }
    const visual: ProductVisual = {
      shelf,
      stand,
      items,
      count,
      plots,
      farmSign,
      title: name,
      back,
      header,
      sides,
      rows: [],
      rowCount: 0,
    };
    this.resizeShelf(visual, product, 3);
    this.products.set(product.id, visual);
  }

  /** Add rows only when purchased, reusing the same footprint, models, and labels. */
  private resizeShelf(visual: ProductVisual, product: ProductDefinition, count: number): void {
    if (visual.rowCount === count) return;
    while (visual.rows.length < count) {
      const row = new Group();
      row.name = `shelf-${product.id}:row-${visual.rows.length + 1}`;
      block(row, 0, 0, 0, 1.44, 0.07, 0.27, C.wood);
      block(row, 0, -0.023, 0.145, 1.44, 0.075, 0.025, product.color);
      for (let column = 0; column < SHELF_COLUMNS; column++) {
        const produce = createProduce(product.id);
        produce.position.set(-0.47 + column * 0.315, 0.13, 0);
        produce.scale.setScalar(1.05);
        row.add(produce);
        visual.items.push(produce);
      }
      visual.rows.push(row);
      visual.shelf.add(row);
    }
    visual.rows.forEach((row, index) => {
      row.visible = index < count;
      row.position.set(0, 0.27 + index * 0.24, 0.25 - index * (0.5 / (count - 1)));
    });
    const extraHeight = (count - 3) * 0.24;
    visual.back.scale.y = 1.03 + extraHeight;
    visual.back.position.y = 0.605 + extraHeight / 2;
    visual.sides.forEach((side) => {
      side.scale.y = 0.84 + extraHeight;
      side.position.y = 0.49 + extraHeight / 2;
    });
    visual.title.object.position.y = 1.14 + extraHeight;
    visual.header.position.y = 1.14 + extraHeight;
    visual.rowCount = count;
  }

  private createPlot(product: ProductDefinition, index: number): PlotVisual {
    const position = plotPosition(product.id, index);
    const group = new Group();
    group.name = `plot-${product.id}-${index}`;
    group.position.copy(point(position.x, position.y));
    this.scene.add(group);
    const stand = this.createStand(`farm-${product.id}-${index}`, farmStandSpot(product.id, index));
    const live = new Group();
    group.add(live);
    const size = product.id === 'carrot' ? 0.49 : product.id === 'milk' ? 0.88 : 0.74;
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
    } else if (product.id === 'milk') {
      block(live, 0, 0.2, -0.04, 0.78, 0.025, 0.59, 0xa8cc8d);
      chicken = createCow();
      chicken.position.set(0, 0.17, -0.08);
      chicken.scale.setScalar(0.72);
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
          : product.id === 'milk'
            ? 0.35
            : product.id === 'carrot'
              ? 0.23
              : 0.48 - Math.floor(item / 3) * 0.16,
        0.1,
      );
      if (product.id === 'coffee') produce.scale.setScalar(0.85);
      if (product.id === 'milk') produce.scale.setScalar(0.75);
      live.add(produce);
      products.push(produce);
    }
    const ready = label(live, '0', 0.29, 0.2, {
      id: `plot:${product.id}:${index}:ready`,
      kind: 'status',
      mount: 'billboard',
      foreground: '#18754f',
      background: '#fffbe9',
    });
    ready.object.position.set(0.28, 0.53, 0.25);
    block(live, 0, 0.19, 0.41, 0.37, 0.025, 0.036, C.cream);
    const progress = block(live, -0.175, 0.197, 0.411, 0.003, 0.025, 0.038, C.green);
    const marker = new Group();
    group.add(marker);
    const outline = ring(marker, product.id === 'carrot' ? 0.23 : 0.32, 0xd4edb3, 0.025);
    outline.position.y = 0.047;
    block(marker, 0, 0.052, 0, 0.2, 0.018, 0.045, 0x95b970, false);
    block(marker, 0, 0.052, 0, 0.045, 0.018, 0.2, 0x95b970, false);
    return { group, live, marker, products, ready, progress, chicken, stand };
  }

  private createMachine(machine: MachineDefinition): void {
    const root = new Group();
    root.name = `machine-${machine.id}`;
    root.position.copy(point(machine.position.x, machine.position.y));
    this.scene.add(root);
    const stand = this.createStand(`machine-${machine.id}`, machineStandSpot(machine));
    const body = new Group();
    root.add(body);
    const color =
      machine.id === 'grill'
        ? 0x5a655b
        : machine.id === 'paste'
          ? 0xe88b70
          : machine.id === 'coffee'
            ? 0xb58964
            : 0x8ac1cf;
    block(body, 0, 0.31, 0, 0.94, 0.6, 0.73, color);
    block(body, 0, 0.055, 0, 1.06, 0.11, 0.82, C.green);
    block(body, 0, 0.66, 0, 1.02, 0.12, 0.81, C.cream);
    if (machine.id === 'grill') {
      block(body, 0, 0.76, -0.12, 0.78, 0.08, 0.46, 0xb76b33);
      for (let bar = -3; bar <= 3; bar++)
        block(body, bar * 0.1, 0.82, -0.12, 0.035, 0.04, 0.46, 0x37423a);
      for (const x of [-0.23, 0.23]) {
        const cob = createProduce('grilledCorn');
        cob.position.set(x, 0.91, -0.1);
        body.add(cob);
      }
    } else {
      disc(body, 0, 0.95, -0.17, 0.26, 0.5, machine.id === 'paste' ? 0xced9c4 : 0xf2d59e);
      disc(body, 0, 1.22, -0.17, 0.31, 0.055, C.green);
    }
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
    block(body, 0, 1.36, -0.18, 1.18, 0.31, 0.065, C.cream);
    const machineTitle =
      machine.id === 'grill'
        ? 'CORN GRILL'
        : machine.id === 'paste'
          ? 'CANNERY'
          : machine.id === 'coffee'
            ? 'GRINDER'
            : 'DAIRY';
    const title = label(body, machineTitle, 1.04, 0.27, {
      id: `machine:${machine.id}:title`,
      kind: 'object',
      mount: 'surface',
      foreground: '#4b704f',
      background: '#fff9e8',
    });
    title.object.position.set(0, 1.36, -0.143);
    const level = label(body, '', 1.16, 0.26, {
      id: `machine:${machine.id}:level`,
      kind: 'status',
      mount: 'surface',
      foreground: '#ffffff',
      background: '#cc765e',
      border: false,
    });
    level.object.position.set(0, 1.1, 0.22);
    const status = label(body, '', 1.35, 0.28, {
      id: `machine:${machine.id}:status`,
      kind: 'status',
      mount: 'surface',
      foreground: '#1d6e51',
      background: '#fff9e9',
    });
    status.object.position.set(0, 0.77, 0.405);
    const progress = ring(body, 0.67, C.gold, 0.065);
    progress.position.y = 0.035;
    const locked = new Group();
    root.add(locked);
    block(locked, 0, 0.025, 0, 1.52, 0.05, 1.1, 0xcae2a5);
    const lockedTitle = label(locked, machineTitle, 1.42, 0.26, {
      id: `machine:${machine.id}:locked`,
      kind: 'action',
      mount: 'surface',
      foreground: '#4b8057',
      background: '#eff6de',
    });
    lockedTitle.object.position.set(0, 0.3, 0.18);
    this.machines.set(machine.id, {
      root,
      stand,
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

  private createFarmYard(): void {
    for (const product of PRODUCTS.filter((entry) => entry.kind === 'farm')) {
      const floor = new Group();
      floor.name = 'farm-yard-' + product.id;
      floor.position.copy(point(product.farm.x, product.farm.y + 45));
      this.scene.add(floor);
      block(floor, 0, -0.014, 0, 3.5, 0.045, 2.22, 0xa8d887);
      this.yards.push({ floor, area: product.area });
    }
  }
}
