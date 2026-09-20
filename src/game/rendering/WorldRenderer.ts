import {
  AmbientLight,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES, checkoutDuration, upgradeAvailable, upgradeCost } from '../data/upgrades';
import type { GameEvent, GameState, ProductId, UpgradeId, Vec2 } from '../types';
import { createCharacter, createProduce, createTree } from './Models';
import { StoreDisplays } from './world/StoreDisplays';
import type { CharacterModel } from './Models';
import { block, crate, disc, label, PALETTE as C, ring, sphere } from './world/WorldKit';
import type { WorldLabel } from './world/WorldKit';

interface UpgradeVisual {
  group: Group;
  outline: Mesh;
  progress: Mesh;
  action: WorldLabel;
  name: string;
}
interface CustomerVisual {
  model: CharacterModel;
  id: number;
  previous: Vec2;
  bubble: Group;
  item: Record<ProductId, Group>;
}
interface Transfer {
  group: Group;
  from: Vector3;
  to: Vector3;
  elapsed: number;
  duration: number;
}
const toWorld = (point: Vec2, elevation = 0): Vector3 =>
  new Vector3((point.x - 640) / 100, elevation, (point.y - 390) / 100);
const YAW = (20 * Math.PI) / 180;

/** Render-only presentation: game rules and existing saves stay in GameEngine. */
export class WorldRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera();
  private readonly player: CharacterModel;
  private readonly cashier: CharacterModel;
  private readonly customers: CustomerVisual[] = [];
  private readonly displays: StoreDisplays;
  private readonly upgrades = new Map<UpgradeId, UpgradeVisual>();
  private readonly workers: { model: CharacterModel; previous: Vec2 }[] = [];
  private readonly officeStaff: { model: CharacterModel; upgrade: 'customers' | 'accountant' }[] =
    [];
  private readonly transfers: Transfer[] = [];
  private readonly cameraTarget = new Vector3(-0.85, 0, 0.2);
  private readonly cameraOffset = new Vector3(Math.sin(YAW) * 18, 25.7, Math.cos(YAW) * 18);
  private readonly checkoutRing: Mesh;
  private readonly checkoutProgress: Mesh;
  private readonly checkoutLabel: WorldLabel;
  private readonly objective = new Group();
  private previousPlayer = { ...GAME_CONFIG.playerStart } as Vec2;
  private width = 1;
  private height = 1;
  private initialized = false;
  private lastState: GameState | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.setAttribute('aria-label', 'Three dimensional mini market game');
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new Color(C.grass);
    this.scene.add(new HemisphereLight(0xffffff, 0x91a377, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.18));
    const sun = new DirectionalLight(0xfff6df, 2.3);
    sun.position.set(-6, 14, 7);
    sun.castShadow = false;
    this.scene.add(sun);
    this.drawEnvironment();
    this.drawMarket();
    this.batchStaticWorld();
    this.displays = new StoreDisplays(this.scene);
    this.drawOffice();
    this.drawUpgrades();
    const checkout = this.drawCheckout();
    this.checkoutRing = checkout.ring;
    this.checkoutProgress = checkout.progress;
    this.checkoutLabel = checkout.label;
    const arrow = new Mesh(
      new ConeGeometry(0.12, 0.22, 4),
      new MeshBasicMaterial({ color: C.gold }),
    );
    arrow.rotation.z = Math.PI;
    this.objective.add(arrow);
    block(this.objective, 0, 0.16, 0, 0.075, 0.2, 0.075, C.gold);
    this.scene.add(this.objective);
    this.player = createCharacter('player', C.green);
    this.player.group.scale.setScalar(1.2);
    this.player.group.position.copy(toWorld(GAME_CONFIG.playerStart));
    this.scene.add(this.player.group);
    const playerMarker = ring(this.scene, 0.28, C.white, 0.03);
    playerMarker.name = 'player-marker';
    this.cashier = createCharacter('cashier', C.peach);
    this.cashier.group.position.copy(toWorld(GAME_CONFIG.cashierSpot));
    this.cashier.setFacing(-1, 0);
    this.cashier.group.visible = false;
    this.scene.add(this.cashier.group);
    [0x659ec0, 0xba85b2, 0xe5a44e].forEach((color) => {
      const model = createCharacter('cashier', color);
      model.group.visible = false;
      this.scene.add(model.group);
      this.workers.push({ model, previous: { x: 0, y: 0 } });
    });
    for (let index = 0; index < GAME_CONFIG.customerMax; index += 1) {
      const model = createCharacter('customer');
      model.group.visible = false;
      this.scene.add(model.group);
      const bubble = new Group();
      const background = sphere(bubble, 0, 0, 0, 0.15, C.white);
      background.scale.z *= 0.55;
      const item = Object.fromEntries(PRODUCTS.map(({ id }) => [id, createProduce(id)])) as Record<
        ProductId,
        Group
      >;
      Object.values(item).forEach((produce) => {
        produce.scale.setScalar(0.7);
        produce.position.z = 0.08;
        bubble.add(produce);
      });
      bubble.visible = false;
      this.scene.add(bubble);
      this.customers.push({ model, id: -1, previous: { x: 0, y: 0 }, bubble, item });
    }
    this.resize();
  }

  resize(): void {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    const aspect = this.width / this.height;
    // A close following view keeps the miniature world tactile on phone and desktop.
    const span = aspect < 0.8 ? 9.9 : aspect < 1.25 ? 9.5 : this.height < 460 ? 5 : 8.4;
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.displays.setCompactLabels(this.width < 620 || this.height < 460);
    this.updateCamera(1000);
  }

  screenPosition(x: number, y: number, elevation = 0): { x: number; y: number; visible: boolean } {
    const projected = toWorld({ x, y }, elevation).project(this.camera);
    return {
      x: ((projected.x + 1) / 2) * this.width,
      y: ((1 - projected.y) / 2) * this.height,
      visible: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
    };
  }

  screenToWorldInput(input: Vec2): Vec2 {
    return {
      x: input.x * Math.cos(YAW) + input.y * Math.sin(YAW),
      y: -input.x * Math.sin(YAW) + input.y * Math.cos(YAW),
    };
  }

  update(state: GameState, timeMs: number, deltaMs: number): void {
    this.lastState = state;
    const dx = state.player.x - this.previousPlayer.x;
    const dy = state.player.y - this.previousPlayer.y;
    const moving = Math.hypot(dx, dy) > 0.03;
    this.player.group.position.copy(toWorld(state.player));
    if (moving) this.player.setFacing(dx, dy);
    this.player.setInventory(state.inventory);
    this.player.animate(timeMs, moving);
    this.previousPlayer = { ...state.player };
    const marker = this.scene.getObjectByName('player-marker')!;
    marker.position.set(this.player.group.position.x, 0.079, this.player.group.position.z);
    this.cashier.group.visible = state.cashier;
    this.cashier.animate(timeMs, false);
    this.customers.forEach((visual, index) => {
      const customer = state.customers[index];
      visual.model.group.visible = Boolean(customer);
      visual.bubble.visible = false;
      if (!customer) return;
      if (visual.id !== customer.id) {
        visual.id = customer.id;
        visual.previous = { x: customer.x, y: customer.y };
        visual.model.setColor(customer.color);
      }
      const customerDx = customer.x - visual.previous.x;
      const customerDy = customer.y - visual.previous.y;
      const customerMoving = Math.hypot(customerDx, customerDy) > 0.01;
      visual.model.group.position.copy(toWorld(customer));
      if (customerMoving) visual.model.setFacing(customerDx, customerDy);
      else if (customer.state === 'WAITING_FOR_PRODUCT') visual.model.setFacing(0, -1);
      else if (customer.state === 'PAYING') visual.model.setFacing(1, 0);
      visual.model.setInventory(customer.basket);
      visual.model.animate(timeMs + customer.id * 131, customerMoving);
      visual.previous = { x: customer.x, y: customer.y };
      if (customer.state === 'WAITING_FOR_PRODUCT') {
        visual.bubble.visible = true;
        visual.bubble.position.copy(toWorld(customer, 1.07 + Math.sin(timeMs / 500) * 0.025));
        visual.bubble.quaternion.copy(this.camera.quaternion);
        PRODUCTS.forEach(({ id }) => {
          visual.item[id].visible = id === customer.targetProduct;
        });
      }
    });
    this.displays.update(state, timeMs);
    this.workers.forEach((visual, index) => {
      const worker = state.workers[index];
      visual.model.group.visible = Boolean(worker);
      if (!worker) return;
      const dx = worker.x - visual.previous.x;
      const dy = worker.y - visual.previous.y;
      const moving = Math.hypot(dx, dy) > 0.01;
      visual.model.group.position.copy(toWorld(worker));
      if (moving) visual.model.setFacing(dx, dy);
      visual.model.setInventory(worker.basket);
      visual.model.animate(timeMs + worker.id * 113, moving);
      visual.previous = { x: worker.x, y: worker.y };
    });
    this.officeStaff.forEach(({ model, upgrade }) => {
      model.group.visible = state.upgrades[upgrade] > 0;
      model.animate(timeMs, false);
    });
    UPGRADES.forEach((upgrade) => {
      const visual = this.upgrades.get(upgrade.id);
      if (!visual) return;
      visual.group.visible = upgradeAvailable(state, upgrade.id);
      const complete = state.upgrades[upgrade.id] >= upgrade.maxLevel;
      const cost = upgradeCost(state, upgrade.id);
      const affordable = state.money >= cost;
      const actionName =
        upgrade.id === 'expansion'
          ? complete
            ? 'EXPANSION'
            : ['PRODUCTION', 'COFFEE', 'CARROTS'][state.upgrades.expansion]
          : visual.name;
      (visual.outline.material as MeshBasicMaterial).color.set(
        complete ? C.green : affordable ? C.gold : C.white,
      );
      visual.action.setText(
        `${actionName} ${complete ? 'MAX' : `$${cost}`}`,
        complete ? '#128560' : '#17694b',
        complete ? '#def5d9' : '#ffffff',
      );
      const active = state.activeUpgrade === upgrade.id && !complete;
      visual.progress.visible = active;
      if (active)
        visual.progress.geometry.setDrawRange(
          0,
          Math.max(
            0,
            Math.floor(Math.min(1, state.upgradeProgress / GAME_CONFIG.upgradeHoldTime) * 64) * 6,
          ),
        );
    });
    const queue = state.customers.filter(
      (customer) => customer.state === 'QUEUEING' || customer.state === 'PAYING',
    );
    const paying = state.customers.some((customer) => customer.state === 'PAYING');
    this.checkoutRing.visible = queue.length > 0 && !state.cashier;
    this.checkoutRing.scale.setScalar(1 + Math.sin(timeMs / 250) * 0.04);
    this.checkoutProgress.visible = paying;
    this.checkoutProgress.geometry.setDrawRange(
      0,
      Math.floor(Math.min(1, state.checkoutProgress / checkoutDuration(state)) * 64) * 6,
    );
    this.checkoutLabel.setText('CHECKOUT', '#ffffff', '#168a65');
    this.updateTransfers(deltaMs);
    this.updateObjective(state, timeMs);
    this.updateCamera(deltaMs);
    this.renderer.render(this.scene, this.camera);
  }

  showEvent(event: GameEvent): void {
    if (!this.lastState) return;
    const product = [...PRODUCTS]
      .sort((a, b) => b.name.length - a.name.length)
      .find((entry) => event.text.toLowerCase().includes(entry.name.toLowerCase()));
    if ((event.type === 'harvest' || event.type === 'stock') && product) {
      const group = createProduce(product.id);
      group.scale.setScalar(1.3);
      const from =
        event.type === 'harvest' ? toWorld(event, 0.4) : toWorld(this.lastState.player, 1.15);
      const to =
        event.type === 'harvest' ? toWorld(this.lastState.player, 1.2) : toWorld(event, 0.72);
      group.position.copy(from);
      this.scene.add(group);
      this.transfers.push({ group, from, to, elapsed: 0, duration: 350 });
    } else if (event.type === 'money' || event.type === 'upgrade') {
      for (let index = 0; index < 8; index += 1) {
        const group = new Group();
        const coin = disc(group, 0, 0, 0, 0.055, 0.035, event.type === 'money' ? C.gold : C.peach);
        coin.rotation.x = Math.PI / 2;
        const from = toWorld(event, 0.5);
        const angle = (index * Math.PI * 2) / 8;
        const to = from
          .clone()
          .add(new Vector3(Math.cos(angle) * 0.65, -0.4, Math.sin(angle) * 0.65));
        group.position.copy(from);
        this.scene.add(group);
        this.transfers.push({ group, from, to, elapsed: 0, duration: 600 });
      }
    }
  }

  dispose(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.scene.traverse((object) => {
      if (!('material' in object)) return;
      const mesh = object as Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      meshMaterials.forEach((entry) => {
        materials.add(entry);
        if ('map' in entry && entry.map) textures.add(entry.map as Texture);
      });
    });
    geometries.forEach((entry) => entry.dispose());
    materials.forEach((entry) => entry.dispose());
    textures.forEach((entry) => entry.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private updateCamera(deltaMs: number): void {
    const player = this.lastState
      ? toWorld(this.lastState.player)
      : toWorld(GAME_CONFIG.playerStart);
    const portrait = this.width / this.height < 1.15;
    const target = portrait
      ? new Vector3(player.x, 0, player.z - 0.3)
      : new Vector3(
          player.x + Math.max(-1.8, Math.min(1.8, -player.x * 0.58 - 0.25)),
          0,
          player.z * 0.75 - 0.1,
        );
    if (!this.initialized) {
      this.cameraTarget.copy(target);
      this.initialized = true;
    } else this.cameraTarget.lerp(target, 1 - Math.exp(-Math.min(100, deltaMs) / 260));
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
  }

  private updateTransfers(deltaMs: number): void {
    for (let index = this.transfers.length - 1; index >= 0; index -= 1) {
      const transfer = this.transfers[index];
      transfer.elapsed += deltaMs;
      const progress = Math.min(1, transfer.elapsed / transfer.duration);
      transfer.group.position.lerpVectors(transfer.from, transfer.to, progress);
      transfer.group.position.y += Math.sin(progress * Math.PI) * 0.7;
      transfer.group.rotation.y += deltaMs / 150;
      if (progress === 1) {
        this.scene.remove(transfer.group);
        this.transfers.splice(index, 1);
      }
    }
  }

  private updateObjective(state: GameState, timeMs: number): void {
    let destination: Vec2 | undefined;
    if (state.tutorialStep <= 1) destination = PRODUCTS[0].farm;
    else if (state.tutorialStep === 2)
      destination = { x: PRODUCTS[0].shelf.x, y: PRODUCTS[0].shelf.y + 61 };
    else if (state.tutorialStep <= 4) destination = GAME_CONFIG.cashierSpot;
    else if (state.tutorialStep === 5)
      destination = UPGRADES.find(
        (upgrade) =>
          upgrade.inWorld &&
          upgradeAvailable(state, upgrade.id) &&
          state.upgrades[upgrade.id] < upgrade.maxLevel &&
          state.money >= upgradeCost(state, upgrade.id),
      )?.position;
    this.objective.visible = Boolean(destination);
    if (destination) {
      this.objective.position.copy(toWorld(destination, 1.25 + Math.sin(timeMs / 300) * 0.07));
      this.objective.rotation.y = timeMs / 1000;
    }
  }

  private drawEnvironment(): void {
    block(this.scene, 0, -0.14, 0, 80, 0.2, 80, C.grass, false);
    block(this.scene, 18.55, -0.02, 0, 2.5, 0.05, 50, 0xbfc5aa, false);
    block(this.scene, 17.17, -0.005, 0, 0.25, 0.08, 50, C.cream, false);
    for (let z = -18; z < 20; z += 1.3)
      block(this.scene, 18.55, 0.012, z, 0.08, 0.018, 0.65, C.cream);
    block(this.scene, 5.2, -0.005, 0.46, 22.8, 0.055, 0.66, 0xe7dcc1);
    for (let x = -6; x < 16.4; x += 0.55)
      block(this.scene, x, 0.026, 0.46, 0.5, 0.016, 0.53, 0xf4eacf);
    block(this.scene, 4.96, -0.008, 0.45, 1.58, 0.065, 6.35, 0xadd789);
    block(this.scene, -1.62, -0.009, 3.13, 7.45, 0.065, 4.6, 0xa1d67d);
    for (let x = -5.6; x < 1.3; x += 0.46)
      block(this.scene, x, 0.3, 6, 0.075, 0.63, 0.075, C.cream);
    [0.22, 0.46].forEach((y) => block(this.scene, -2.3, y, 6, 6.7, 0.075, 0.07, C.cream));
    [
      [-6.1, -3.6, 1.2],
      [-7, -1, 0.95],
      [-6.5, 2, 0.95],
      [-5.8, 6.6, 1.1],
      [-3, 6.5, 1.15],
      [0.4, 6.6, 1],
      [3.2, 6.7, 1.15],
      [5.6, -3.7, 1.1],
      [1.8, -4.6, 1.05],
      [-2.2, -4.5, 1.2],
      [17.5, -3.9, 1.5],
      [17.5, 6.4, 1.15],
    ].forEach(([x, z, scale]) => {
      const tree = createTree();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      this.scene.add(tree);
    });
    for (let index = 0; index < 55; index += 1) {
      const x = Math.sin(index * 29.7) * 9.5;
      const z = Math.cos(index * 17.4) * 7;
      if ((x > -5.8 && x < 16.3 && z > -3.1 && z < 6.1) || x > 6.1) continue;
      const grass = block(this.scene, x, 0.05, z, 0.07, 0.15, 0.035, C.darkGrass);
      grass.rotation.z = index % 2 ? -0.3 : 0.3;
      if (index % 3 === 0)
        sphere(this.scene, x + 0.04, 0.13, z, 0.055, index % 2 ? C.white : C.gold);
    }
    crate(this.scene, 3.45, 0, 2.7, 0.9);
    crate(this.scene, 3.95, 0, 2.93, 0.75);
    crate(this.scene, 3.45, 0.27, 2.7, 0.82);
    disc(this.scene, 2.84, 0.2, 3.1, 0.21, 0.4, 0xf1dfad);
    disc(this.scene, 2.52, 0.16, 3.12, 0.18, 0.32, 0xf6e7c7);
  }

  /** Static scenery shares one draw call per material, instead of one per fence, tile, or leaf. */
  private batchStaticWorld(): void {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<
      string,
      { geometry: BufferGeometry[]; material: Material; castShadow: boolean }
    >();
    const original: Mesh[] = [];
    this.scene.traverse((object) => {
      if (
        !(object instanceof Mesh) ||
        Array.isArray(object.material) ||
        object.material.transparent
      )
        return;
      const key = `${object.material.uuid}:${object.castShadow}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { geometry: [], material: object.material, castShadow: object.castShadow };
        batches.set(key, batch);
      }
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      batch.geometry.push(geometry);
      original.push(object);
    });
    original.forEach((mesh) => mesh.removeFromParent());
    batches.forEach((batch) => {
      const geometry = mergeGeometries(batch.geometry, false);
      batch.geometry.forEach((part) => part.dispose());
      if (!geometry) return;
      const merged = new Mesh(geometry, batch.material);
      merged.name = 'static-scenery';
      merged.castShadow = false;
      merged.receiveShadow = false;
      this.scene.add(merged);
    });
  }

  private drawMarket(): void {
    block(this.scene, -0.7, -0.01, -1.3, 9.7, 0.13, 3.45, C.cream);
    block(this.scene, -0.7, 0.056, -1.3, 9.47, 0.012, 3.22, C.tile);
    for (let x = -5.3; x < 4; x += 0.58)
      block(this.scene, x, 0.065, -1.3, 0.012, 0.009, 3.2, C.grout, false);
    for (let z = -2.8; z < 0.31; z += 0.58)
      block(this.scene, -0.7, 0.065, z, 9.43, 0.009, 0.012, C.grout, false);
    block(this.scene, -0.7, 0.42, -3, 9.7, 0.86, 0.2, C.cream);
    block(this.scene, -0.7, 0.32, -2.888, 9.42, 0.5, 0.055, C.mint);
    block(this.scene, -0.7, 0.875, -3, 9.86, 0.1, 0.26, C.green);
    block(this.scene, -5.45, 0.23, -1.39, 0.18, 0.43, 3.15, C.cream);
    block(this.scene, -5.45, 0.47, -1.39, 0.22, 0.075, 3.18, C.peach);
    block(this.scene, 4.02, 0.21, -2.15, 0.16, 0.4, 1.54, C.cream);
    block(this.scene, 4.02, 0.44, -2.15, 0.2, 0.075, 1.6, C.peach);
    [-5.38, 3.98].forEach((x) => {
      block(this.scene, x, 0.71, -2.92, 0.23, 1.4, 0.24, C.cream);
      block(this.scene, x, 1.41, -2.92, 0.3, 0.11, 0.3, C.peach);
    });
    const sign = new Group();
    sign.position.set(-1.6, 1.28, -2.96);
    this.scene.add(sign);
    block(sign, 0, 0, 0, 3.1, 0.56, 0.16, C.green);
    const brand = label(sign, 'MINI MARKET', 2.75, 0.39, {
      id: 'store:brand',
      kind: 'brand',
      foreground: '#ffffff',
      mount: 'surface',
    });
    brand.object.position.set(0, 0.02, 0.1);
    const tag = label(this.scene, 'FRESH FROM YOUR FARM', 2, 0.18, {
      id: 'store:tagline',
      kind: 'brand',
      foreground: '#1a835d',
      mount: 'surface',
    });
    tag.object.position.set(-1.6, 0.77, -2.79);
    [-4.65, 2.65].forEach((x) => {
      block(this.scene, x, 0.99, -2.82, 0.6, 0.45, 0.08, C.wood);
      block(this.scene, x, 0.99, -2.76, 0.47, 0.32, 0.03, C.cream);
      const stamp = label(this.scene, x < 0 ? 'LOCAL' : 'OPEN', 0.46, 0.2, {
        id: `store:${x < 0 ? 'local' : 'open'}`,
        kind: 'brand',
        foreground: '#248564',
        mount: 'surface',
      });
      stamp.object.position.set(x, 1, -2.7);
    });
    block(this.scene, 3.6, 0.047, 0.06, 0.85, 0.02, 0.5, C.green);
  }

  private drawUpgrades(): void {
    const names: Partial<Record<UpgradeId, string>> = {
      inventory: 'BASKET',
      shelf: 'BIGGER SHELF',
      customers: 'PROMOTE',
      corn: 'CORN',
      cashier: 'CASHIER',
      expansion: 'EXPAND',
      tomatoPlots: 'TOMATO',
      eggPlots: 'CHICKEN',
      cornPlots: 'CORN PLOT',
      carrotPlots: 'CARROTS',
      pasteMachine: 'CANNERY',
      coffeeMachine: 'GRINDER',
    };
    UPGRADES.filter((upgrade) => upgrade.inWorld).forEach((upgrade) => {
      const group = new Group();
      group.position.copy(toWorld(upgrade.position));
      this.scene.add(group);
      block(group, 0, 0.013, 0, 1.17, 0.038, 0.85, 0xa6d388);
      [-1, 1].forEach((side) => {
        block(group, side * 0.56, 0.043, 0, 0.034, 0.013, 0.78, C.white);
        block(group, 0, 0.043, side * 0.385, 1.11, 0.013, 0.034, C.white);
      });
      const outline = ring(group, 0.31, C.white, 0.028);
      outline.position.y = 0.052;
      const progress = ring(group, 0.37, C.gold, 0.063);
      progress.position.y = 0.055;
      progress.visible = false;
      // One concise physical placard prevents a title and price from drifting
      // apart or covering the pad icon at narrow aspect ratios.
      const actionWidth = upgrade.id === 'expansion' ? 1.72 : 1.5;
      block(group, 0, 0.58, -0.38, actionWidth + 0.08, 0.35, 0.055, C.green);
      block(group, 0, 0.3, -0.38, 0.045, 0.42, 0.045, C.green);
      const name = names[upgrade.id] ?? upgrade.name.toUpperCase();
      const action = label(group, `${name} $${upgrade.cost}`, actionWidth, 0.3, {
        id: `upgrade:${upgrade.id}:action`,
        kind: 'action',
        mount: 'surface',
        foreground: '#17694b',
        background: '#ffffff',
        border: false,
      });
      action.object.position.set(0, 0.58, -0.348);
      const icon = new Group();
      icon.position.set(0, 0.4, -0.14);
      icon.scale.setScalar(0.55);
      group.add(icon);
      if (upgrade.id === 'corn') {
        const corn = createProduce('corn');
        corn.scale.setScalar(1.5);
        icon.add(corn);
      } else if (upgrade.id === 'inventory') {
        crate(icon, 0, -0.12, 0, 0.66);
        block(icon, 0, 0.15, 0, 0.3, 0.045, 0.05, C.cream);
      } else if (upgrade.id === 'shelf') {
        block(icon, 0, 0.07, 0, 0.5, 0.045, 0.21, C.cream);
        block(icon, 0, -0.1, 0, 0.5, 0.045, 0.21, C.cream);
        [-0.21, 0.21].forEach((x) => block(icon, x, -0.02, 0, 0.045, 0.3, 0.21, C.green));
      } else {
        disc(icon, 0, -0.06, 0, 0.12, 0.22, upgrade.id === 'cashier' ? C.peach : C.green);
        sphere(icon, 0, 0.15, 0, 0.11, C.cream);
        if (upgrade.id === 'customers') {
          sphere(icon, -0.2, 0.07, 0.05, 0.075, C.cream);
          sphere(icon, 0.2, 0.07, 0.05, 0.075, C.cream);
        }
      }
      this.upgrades.set(upgrade.id, { group, outline, progress, action, name });
    });
  }

  private drawOffice(): void {
    const office = new Group();
    office.position.copy(toWorld({ x: 990, y: 780 }));
    this.scene.add(office);
    block(office, 0, 0.015, 0, 2.35, 0.06, 1.5, C.cream);
    block(office, 0, 1.08, -0.59, 1.66, 0.32, 0.06, C.green);
    block(office, 0, 0.72, -0.59, 0.055, 0.58, 0.055, C.green);
    const sign = label(office, 'TEAM OFFICE', 1.48, 0.28, {
      id: 'office:team:title',
      kind: 'area',
      foreground: '#ffffff',
      mount: 'surface',
      border: false,
    });
    sign.object.position.set(0, 1.08, -0.555);
    const roles = [
      { upgrade: 'customers' as const, title: 'MARKETING', color: 0xa788be },
      { upgrade: 'accountant' as const, title: 'ACCOUNTANT', color: 0x6a9db4 },
    ];
    roles.forEach((role, index) => {
      const x = index ? 0.58 : -0.58;
      block(office, x, 0.4, 0, 0.83, 0.09, 0.55, C.wood);
      [-0.31, 0.31].forEach((side) => block(office, x + side, 0.2, 0, 0.07, 0.38, 0.4, C.cream));
      block(office, x, 0.6, -0.11, 0.33, 0.29, 0.045, role.color);
      block(office, x, 0.6, -0.082, 0.25, 0.19, 0.015, 0xdbefd4);
      const title = label(office, role.title, role.upgrade === 'accountant' ? 1.24 : 1.14, 0.26, {
        id: `office:${role.upgrade}:title`,
        kind: 'object',
        mount: 'surface',
        foreground: '#ffffff',
        background: role.upgrade === 'customers' ? '#80639a' : '#477f94',
        border: false,
      });
      title.object.position.set(index ? 0.61 : -0.61, 0.82, -0.2);
      const worker = createCharacter('cashier', role.color);
      worker.group.position.copy(toWorld({ x: 990 + x * 100, y: 817 }));
      worker.setFacing(0, -1);
      this.scene.add(worker.group);
      this.officeStaff.push({ model: worker, upgrade: role.upgrade });
    });
  }

  private drawCheckout(): { ring: Mesh; progress: Mesh; label: WorldLabel } {
    const counter = new Group();
    counter.position.copy(toWorld(GAME_CONFIG.checkout));
    this.scene.add(counter);
    block(counter, 0, 0.35, -0.08, 0.68, 0.69, 0.84, C.green);
    block(counter, 0, 0.74, -0.08, 0.81, 0.12, 0.95, C.cream);
    block(counter, 0, 0.812, 0.11, 0.56, 0.035, 0.43, 0x656e61);
    block(counter, 0.1, 0.84, -0.29, 0.37, 0.09, 0.27, C.peach);
    const screen = block(counter, 0.13, 0.985, -0.33, 0.09, 0.25, 0.27, 0x286856);
    screen.rotation.z = -0.2;
    block(counter, 0.185, 0.99, -0.33, 0.015, 0.16, 0.2, 0xb0f0bd);
    block(counter, 0, 1.22, -0.2, 1.14, 0.32, 0.07, C.green);
    const checkoutLabel = label(counter, 'CHECKOUT', 1, 0.27, {
      id: 'checkout:title',
      kind: 'object',
      foreground: '#ffffff',
      background: '#168a65',
      mount: 'surface',
      border: false,
    });
    checkoutLabel.object.position.set(0, 1.22, -0.16);
    const spot = new Group();
    spot.position.copy(toWorld(GAME_CONFIG.cashierSpot));
    this.scene.add(spot);
    const highlight = ring(spot, 0.34, C.gold, 0.045);
    const progress = ring(spot, 0.4, C.green, 0.064);
    for (let index = 0; index < 5; index += 1) {
      const point = toWorld({
        x: GAME_CONFIG.queueStart.x,
        y: GAME_CONFIG.queueStart.y + index * GAME_CONFIG.queueSpacing,
      });
      block(this.scene, point.x, 0.077, point.z, 0.27, 0.012, 0.055, 0xd1c8ad);
    }
    return { ring: highlight, progress, label: checkoutLabel };
  }
}
