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
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import type { GameEvent, GameState, ProductDefinition, ProductId, UpgradeId, Vec2 } from '../types';
import { createCharacter, createChicken, createProduce, createTree } from './Models';
import type { CharacterModel } from './Models';
import { block, crate, disc, label, PALETTE as C, ring, sphere } from './world/WorldKit';
import type { WorldLabel } from './world/WorldKit';

interface ProductVisual {
  shelf: Group;
  shelfItems: Group[];
  count: WorldLabel;
  farm: Group;
  farmItems: Group[];
  crops: Group;
  lock: Group;
  farmCount: WorldLabel;
  growFill: Mesh;
  readyRing: Mesh;
}
interface UpgradeVisual {
  group: Group;
  outline: Mesh;
  progress: Mesh;
  price: WorldLabel;
  title: WorldLabel;
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
  private readonly products = new Map<ProductId, ProductVisual>();
  private readonly upgrades = new Map<UpgradeId, UpgradeVisual>();
  private readonly chickens: Group[] = [];
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Three dimensional mini market game');
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new Color(C.grass);
    this.scene.add(new HemisphereLight(0xffffff, 0x91a377, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.18));
    const sun = new DirectionalLight(0xfff6df, 2.3);
    sun.position.set(-6, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00015;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.drawEnvironment();
    this.drawMarket();
    this.batchStaticWorld();
    PRODUCTS.forEach((product) => this.createProduct(product));
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
    for (let index = 0; index < GAME_CONFIG.customerMax; index += 1) {
      const model = createCharacter('customer');
      model.group.visible = false;
      this.scene.add(model.group);
      const bubble = new Group();
      const background = sphere(bubble, 0, 0, 0, 0.15, C.white);
      background.scale.z *= 0.55;
      const item = {
        tomato: createProduce('tomato'),
        egg: createProduce('egg'),
        corn: createProduce('corn'),
      };
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
    const span = aspect < 0.8 ? 9.9 : aspect < 1.25 ? 9.5 : 8.4;
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
    PRODUCTS.forEach((product) => this.updateProduct(product, state, timeMs));
    UPGRADES.forEach((upgrade) => {
      const visual = this.upgrades.get(upgrade.id)!;
      const complete = state.upgrades[upgrade.id] >= upgrade.maxLevel;
      const affordable = state.money >= upgrade.cost;
      (visual.outline.material as MeshBasicMaterial).color.set(
        complete ? C.green : affordable ? C.gold : C.white,
      );
      visual.price.setText(
        complete ? 'DONE' : `$${upgrade.cost}`,
        complete ? '#128560' : '#17694b',
        complete ? '#def5d9' : '#ffffff',
      );
      visual.title.object.visible = !complete;
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
      Math.floor(Math.min(1, state.checkoutProgress / GAME_CONFIG.checkoutTime) * 64) * 6,
    );
    this.checkoutLabel.setText(
      state.cashier ? 'CASHIER' : queue.length ? 'CHECK OUT' : 'CHECKOUT',
      '#ffffff',
      '#168a65',
    );
    this.chickens.forEach((chicken, index) => {
      chicken.rotation.y = Math.sin(timeMs / 1800 + index * 2.2) * 0.65 + index * 1.7;
      chicken.position.y = Math.max(0, Math.sin(timeMs / 380 + index * 2)) * 0.025 + 0.14;
    });
    this.updateTransfers(deltaMs);
    this.updateObjective(state, timeMs);
    this.updateCamera(deltaMs);
    this.renderer.render(this.scene, this.camera);
  }

  showEvent(event: GameEvent): void {
    if (!this.lastState) return;
    const product = PRODUCTS.find((entry) => event.text.toLowerCase().includes(entry.id));
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
      : new Vector3(player.x * 0.42 - 0.25, 0, player.z * 0.42 - 0.1);
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
        (upgrade) => state.upgrades[upgrade.id] < upgrade.maxLevel && state.money >= upgrade.cost,
      )?.position;
    this.objective.visible = Boolean(destination);
    if (destination) {
      this.objective.position.copy(toWorld(destination, 1.25 + Math.sin(timeMs / 300) * 0.07));
      this.objective.rotation.y = timeMs / 1000;
    }
  }

  private drawEnvironment(): void {
    block(this.scene, 0, -0.14, 0, 80, 0.2, 80, C.grass, false);
    block(this.scene, 7.55, -0.02, 0, 2.5, 0.05, 50, 0xbfc5aa, false);
    block(this.scene, 6.17, -0.005, 0, 0.25, 0.08, 50, C.cream, false);
    for (let z = -18; z < 20; z += 1.3)
      block(this.scene, 7.55, 0.012, z, 0.08, 0.018, 0.65, C.cream);
    block(this.scene, 0, -0.005, 0.46, 12.4, 0.055, 0.66, 0xe7dcc1);
    for (let x = -6; x < 6; x += 0.55)
      block(this.scene, x, 0.026, 0.46, 0.5, 0.016, 0.53, 0xf4eacf);
    block(this.scene, 4.96, -0.008, 0.45, 1.58, 0.065, 6.35, 0xadd789);
    block(this.scene, -1.62, -0.009, 2.08, 7.45, 0.065, 2.25, 0xa1d67d);
    for (let x = -5.6; x < 1.3; x += 0.46)
      block(this.scene, x, 0.3, 3.55, 0.075, 0.63, 0.075, C.cream);
    [0.22, 0.46].forEach((y) => block(this.scene, -2.3, y, 3.55, 6.7, 0.075, 0.07, C.cream));
    [
      [-6.1, -3.6, 1.2],
      [-7, -1, 0.95],
      [-6.5, 2, 0.95],
      [-5.8, 4.2, 1.1],
      [-3, 5, 1.15],
      [0.4, 4.8, 1],
      [3.2, 4.7, 1.15],
      [5.6, -3.7, 1.1],
      [1.8, -4.6, 1.05],
      [-2.2, -4.5, 1.2],
      [10.1, -0.9, 1.5],
      [10.5, 3.4, 1.15],
    ].forEach(([x, z, scale]) => {
      const tree = createTree();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      this.scene.add(tree);
    });
    for (let index = 0; index < 55; index += 1) {
      const x = Math.sin(index * 29.7) * 9.5;
      const z = Math.cos(index * 17.4) * 7;
      if ((x > -5.8 && x < 6.3 && z > -3.1 && z < 3.8) || x > 6.1) continue;
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
      merged.castShadow = batch.castShadow;
      merged.receiveShadow = true;
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
    const brand = label(sign, 'MINI MARKET', 2.75, 0.39, { foreground: '#ffffff', surface: true });
    brand.object.position.set(0, 0.02, 0.1);
    const tag = label(this.scene, 'FRESH FROM YOUR FARM', 2, 0.18, {
      foreground: '#1a835d',
      surface: true,
    });
    tag.object.position.set(-1.6, 0.77, -2.79);
    [-4.65, 2.65].forEach((x) => {
      block(this.scene, x, 0.99, -2.82, 0.6, 0.45, 0.08, C.wood);
      block(this.scene, x, 0.99, -2.76, 0.47, 0.32, 0.03, C.cream);
      const stamp = label(this.scene, x < 0 ? 'LOCAL' : 'OPEN', 0.46, 0.2, {
        foreground: '#248564',
        surface: true,
      });
      stamp.object.position.set(x, 1, -2.7);
    });
    block(this.scene, 3.6, 0.047, 0.06, 0.85, 0.02, 0.5, C.green);
    const welcome = label(this.scene, 'WELCOME', 0.69, 0.15, { flat: true, foreground: '#ffffff' });
    welcome.object.position.set(3.6, 0.061, 0.06);
  }

  private createProduct(product: ProductDefinition): void {
    const shelf = new Group();
    shelf.position.copy(toWorld(product.shelf));
    this.scene.add(shelf);
    const accent = product.id === 'tomato' ? 0xf68b6e : product.id === 'egg' ? 0xefc45e : 0x80b968;
    block(shelf, 0, 0.13, 0, 1.45, 0.22, 0.75, C.green);
    block(shelf, 0, 0.32, 0, 1.46, 0.15, 0.76, C.cream);
    block(shelf, 0, 0.64, -0.26, 1.46, 0.08, 0.3, C.wood);
    [-0.67, 0.67].forEach((x) => block(shelf, x, 0.5, -0.24, 0.07, 0.61, 0.38, C.cream));
    block(shelf, 0, 0.51, -0.4, 1.45, 0.65, 0.055, C.cream);
    block(shelf, 0, 0.33, 0.39, 1.42, 0.18, 0.065, accent);
    const shelfName = label(shelf, product.plural.toUpperCase(), 1.15, 0.18, {
      foreground: '#ffffff',
      surface: true,
    });
    shelfName.object.position.set(0, 0.33, 0.433);
    const count = label(shelf, '0 / 8', 0.69, 0.25, {
      foreground: '#247759',
      background: '#ffffff',
    });
    count.object.position.set(0, 1.05, -0.05);
    const shelfItems: Group[] = [];
    for (let index = 0; index < 12; index += 1) {
      const produce = createProduce(product.id);
      const row = Math.floor(index / 4);
      produce.position.set(
        -0.47 + (index % 4) * 0.31,
        row === 2 ? 0.77 : 0.46,
        row === 2 ? -0.26 : 0.17 - row * 0.22,
      );
      produce.scale.setScalar(0.9);
      shelf.add(produce);
      shelfItems.push(produce);
    }
    const farm = new Group();
    farm.position.copy(toWorld(product.farm));
    this.scene.add(farm);
    block(farm, 0, 0.065, 0, 1.64, 0.14, 1.24, C.wood);
    block(farm, 0, 0.145, 0, 1.5, 0.04, 1.1, product.id === 'egg' ? 0xefcc75 : C.soil);
    [-1, 1].forEach((side) => {
      block(farm, side * 0.8, 0.16, 0, 0.075, 0.23, 1.26, 0xe8b983);
      block(farm, 0, 0.16, side * 0.6, 1.67, 0.23, 0.075, 0xe8b983);
    });
    const crops = new Group();
    farm.add(crops);
    const farmItems: Group[] = [];
    for (let index = 0; index < 8; index += 1) {
      const x = -0.51 + (index % 4) * 0.34;
      const z = -0.25 + Math.floor(index / 4) * 0.49;
      if (product.id !== 'egg') {
        disc(crops, x, 0.3, z, 0.024, product.id === 'corn' ? 0.46 : 0.23, 0x42913c);
        [-1, 1].forEach((side) => {
          const leaf = sphere(
            crops,
            x + side * 0.07,
            0.32,
            z,
            0.09,
            product.id === 'corn' ? 0x74ae43 : 0x399847,
          );
          leaf.scale.set(0.1125, 0.0225, 0.0585);
          leaf.rotation.z = side * 0.48;
        });
      } else {
        disc(crops, x, 0.185, z, 0.13, 0.03, 0xc39851);
        disc(crops, x, 0.204, z, 0.1, 0.02, 0xe2b95d);
      }
      const produce = createProduce(product.id);
      produce.position.set(x, product.id === 'egg' ? 0.25 : product.id === 'corn' ? 0.51 : 0.39, z);
      if (product.id === 'corn') produce.rotation.z = -0.35;
      crops.add(produce);
      farmItems.push(produce);
    }
    if (product.id === 'egg') {
      const coop = new Group();
      coop.position.set(0, 0, 0.92);
      farm.add(coop);
      block(coop, 0, 0.4, 0, 0.66, 0.65, 0.47, C.cream);
      block(coop, 0, 0.26, -0.245, 0.25, 0.33, 0.035, 0x6e704a);
      const roof = block(coop, -0.18, 0.78, 0, 0.48, 0.085, 0.65, C.peach);
      roof.rotation.z = 0.46;
      const roof2 = block(coop, 0.18, 0.78, 0, 0.48, 0.085, 0.65, C.peach);
      roof2.rotation.z = -0.46;
      [-0.53, 0.53].forEach((x, index) => {
        const chicken = createChicken();
        chicken.position.set(x, 0.14, 0.4 + index * -0.7);
        chicken.scale.setScalar(0.85);
        farm.add(chicken);
        this.chickens.push(chicken);
      });
    }
    const lock = new Group();
    farm.add(lock);
    block(lock, 0, 0.29, 0, 0.58, 0.5, 0.075, C.wood);
    const lockLabel = label(lock, 'CORN', 0.53, 0.21, { foreground: '#ffffff', surface: true });
    lockLabel.object.position.set(0, 0.38, 0.075);
    const unlockLabel = label(lock, 'UNLOCK $150', 1.22, 0.25, {
      foreground: '#5d7650',
      background: '#eff7d6',
    });
    unlockLabel.object.position.set(0, 0.8, 0);
    const farmCount = label(farm, '', 0.87, 0.25, { foreground: '#217c52', background: '#ffffff' });
    farmCount.object.position.set(0, 0.93, -0.26);
    const progressGroup = new Group();
    progressGroup.position.set(0, 0.59, -0.68);
    farm.add(progressGroup);
    block(progressGroup, 0, 0, 0, 0.65, 0.043, 0.055, 0xf6f7dc);
    const growFill = block(progressGroup, -0.31, 0.007, 0.001, 0.001, 0.031, 0.058, C.green);
    const readyRing = ring(farm, 0.69, C.white, 0.024);
    readyRing.position.y = 0.023;
    this.products.set(product.id, {
      shelf,
      shelfItems,
      count,
      farm,
      farmItems,
      crops,
      lock,
      farmCount,
      growFill,
      readyRing,
    });
  }

  private updateProduct(product: ProductDefinition, state: GameState, timeMs: number): void {
    const visual = this.products.get(product.id)!;
    const unlocked = state.unlockedProducts.includes(product.id);
    visual.shelfItems.forEach((item, index) => {
      item.visible = unlocked && index < state.shelves[product.id];
    });
    visual.count.setText(
      unlocked ? `${state.shelves[product.id]} / ${state.shelfCapacities[product.id]}` : 'LOCKED',
      unlocked ? '#247759' : '#97a490',
    );
    visual.crops.visible = unlocked;
    visual.lock.visible = !unlocked;
    visual.farmCount.object.visible = unlocked;
    visual.growFill.parent!.visible = unlocked;
    visual.readyRing.visible =
      unlocked &&
      Math.hypot(state.player.x - product.farm.x, state.player.y - product.farm.y) <=
        GAME_CONFIG.interactionRadius;
    const ready = state.farms[product.id].ready;
    visual.farmCount.setText(
      ready > 0 ? `${ready} READY` : 'GROWING',
      ready > 0 ? '#208459' : '#7e8668',
      ready > 0 ? '#ffffff' : '#f0f2dc',
    );
    visual.farmItems.forEach((item, index) => {
      item.visible = index < ready;
      if (product.id !== 'egg') item.rotation.y = Math.sin(timeMs / 1900 + index) * 0.12;
    });
    const progress =
      ready >= GAME_CONFIG.farmCapacity
        ? 1
        : state.farms[product.id].elapsed / product.productionTime;
    visual.growFill.scale.x = Math.max(0.002, 0.61 * progress);
    visual.growFill.position.x = -0.305 + 0.305 * progress;
  }

  private drawUpgrades(): void {
    const names: Record<UpgradeId, string> = {
      inventory: 'CARRY MORE',
      shelf: 'BIGGER SHELF',
      customers: 'MORE SHOPPERS',
      corn: 'GROW CORN',
      cashier: 'HIRE CASHIER',
    };
    UPGRADES.forEach((upgrade) => {
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
      const title = label(group, names[upgrade.id], 1.18, 0.16, {
        flat: true,
        foreground: '#397e4f',
      });
      title.object.position.set(0, 0.063, -0.26);
      const price = label(group, `$${upgrade.cost}`, 0.7, 0.26, {
        foreground: '#17694b',
        background: '#ffffff',
      });
      price.object.position.set(0, 0.22, 0.14);
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
      this.upgrades.set(upgrade.id, { group, outline, progress, price, title });
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
    const checkoutLabel = label(counter, 'CHECKOUT', 1.16, 0.25, {
      foreground: '#ffffff',
      background: '#168a65',
    });
    checkoutLabel.object.position.set(0, 1.27, -0.2);
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
