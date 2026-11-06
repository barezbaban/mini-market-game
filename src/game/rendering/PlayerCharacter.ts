import {
  AnimationMixer,
  Group,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterModel } from './Models';
import { ReachMotion } from './ReachMotion';
import { PRODUCTS } from '../data/products';
import type { ProductId } from '../types';

const CLIPS = ['Idle', 'Walk', 'CarryIdle', 'CarryWalk'] as const;
let library: GLTF | undefined;

/** Independent, bounded download: a missing player asset keeps the original player usable. */
export async function loadPlayerArt(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'models/player.glb', {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Player unavailable');
    const glb = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    validatePlayerArt(glb);
    library = glb;
  } catch {
    library = undefined;
    console.warn('Using the built-in player model.');
  } finally {
    clearTimeout(timeout);
  }
}

export function validatePlayerArt(glb: Pick<GLTF, 'scene' | 'animations'>): void {
  if (!(glb.scene.getObjectByName('PlayerSkin') instanceof SkinnedMesh))
    throw new Error('Player skin missing');
  for (const name of ['PlayerRoot', 'PlayerSpine', 'PlayerHead', 'HandL', 'HandR']) {
    if (!glb.scene.getObjectByName(name)) throw new Error(`Player joint missing: ${name}`);
  }
  for (const name of CLIPS) {
    if (!glb.animations.some((clip) => clip.name === name && clip.duration > 0))
      throw new Error(`Player animation missing: ${name}`);
  }
}

/** Exported for regression tests using the actual Blender asset, without a browser download. */
export function createPlayerCharacter(
  createProduce: (id: ProductId) => Group,
  art: { scene: Group; animations: AnimationClip[] } | undefined = library,
): CharacterModel | undefined {
  if (!art) return;
  const group = new Group();
  group.name = 'player-character';
  const rig = clone(art.scene);
  rig.name = 'blender-player';
  group.add(rig);
  const mixer = new AnimationMixer(rig);
  const actions = CLIPS.map((name) =>
    mixer.clipAction(art.animations.find((c) => c.name === name)!),
  );
  actions.forEach((a) => a.play());
  const leftHand = rig.getObjectByName('HandL')!;
  const rightHand = rig.getObjectByName('HandR')!;
  const reach = new ReachMotion();
  const left = new Vector3();
  const right = new Vector3();
  const previous = new Vector3();
  const cargo = new Group();
  cargo.name = 'carried-produce';
  cargo.visible = false;
  group.add(cargo);
  const wood = new MeshStandardMaterial({ color: 0xe0b77d, roughness: 0.88 });
  const baseGeometry = new RoundedBoxGeometry(0.31, 0.025, 0.19, 2, 0.008);
  const rimGeometry = new RoundedBoxGeometry(0.31, 0.025, 0.012, 2, 0.004);
  const sideGeometry = new RoundedBoxGeometry(0.012, 0.025, 0.19, 2, 0.004);
  cargo.add(new Mesh(baseGeometry, wood));
  for (const s of [-1, 1]) {
    const rim = new Mesh(rimGeometry, wood);
    rim.position.set(0, 0.022, s * 0.089);
    cargo.add(rim);
    const side = new Mesh(sideGeometry, wood);
    side.position.set(s * 0.149, 0.022, 0);
    cargo.add(side);
  }
  const contents = new Group();
  contents.name = 'player-tray-items';
  cargo.add(contents);
  const pool = new Map<ProductId, Group[]>();
  let inventoryKey = '';
  let carrying = false;
  let lastTime: number | undefined;
  let facing = 0;
  let walkWeight = 0;
  let carryWeight = 0;
  let phase = 0;
  let idleTime = 0;

  return {
    group,
    reach(action) {
      reach.request(action);
    },
    // These are NPC customization hooks; the authored player has its own uniform.
    setRegularApron() {},
    setColor() {},
    setFacing(dx, dy) {
      if (Math.hypot(dx, dy) > 0.00001) facing = Math.atan2(dx, dy);
    },
    animate(time, moving) {
      const dt = lastTime === undefined ? 0 : Math.max(0, Math.min(0.1, (time - lastTime) / 1000));
      const distance = lastTime === undefined ? 0 : group.position.distanceTo(previous);
      lastTime = time;
      previous.copy(group.position);
      // Ignore teleport/save restores. Never spin a walk cycle while pushing against a wall.
      const traveled = moving && distance < 0.8 ? distance / group.scale.x : 0;
      phase = (phase + traveled / 0.48) % 1;
      idleTime += dt * 0.48;
      walkWeight += ((traveled > 0.00001 ? 1 : 0) - walkWeight) * (1 - Math.exp(-dt * 14));
      carryWeight += ((carrying ? 1 : 0) - carryWeight) * (1 - Math.exp(-dt * 12));
      const weights = [
        (1 - walkWeight) * (1 - carryWeight),
        walkWeight * (1 - carryWeight),
        (1 - walkWeight) * carryWeight,
        walkWeight * carryWeight,
      ];
      actions.forEach((a, i) => {
        a.time = (i % 2 ? phase : idleTime % 1) * a.getClip().duration;
        a.setEffectiveWeight(weights[i]);
      });
      mixer.update(0);
      const turn = Math.atan2(
        Math.sin(facing - group.rotation.y),
        Math.cos(facing - group.rotation.y),
      );
      group.rotation.y += turn * (1 - Math.exp(-dt * 13));
      // A small weight shift acknowledges real harvesting/stocking without throwing the tray.
      rig.rotation.x = reach.sample(time) * 0.055;
      group.updateWorldMatrix(true, true);
      leftHand.getWorldPosition(left);
      rightHand.getWorldPosition(right);
      group.worldToLocal(left.add(right).multiplyScalar(0.5));
      cargo.position.copy(left);
      cargo.position.y += 0.006;
      cargo.position.z += 0.012;
    },
    setInventory(items) {
      const key = PRODUCTS.map(({ id }) => items[id] ?? 0).join(':');
      if (key === inventoryKey) return;
      inventoryKey = key;
      contents.clear();
      const stocked = PRODUCTS.filter(({ id }) => (items[id] ?? 0) > 0);
      carrying = stocked.length > 0;
      cargo.visible = carrying;
      // Six small samples, with mixed products first; exact quantities remain in the HUD.
      // Inventory upgrades never create a tower over the player's face or more meshes.
      const samples: ProductId[] = stocked.slice(0, 6).map(({ id }) => id);
      for (const { id } of stocked) {
        const remaining = Math.min(6 - samples.length, Math.max(0, (items[id] ?? 0) - 1));
        for (let i = 0; i < remaining; i++) samples.push(id);
      }
      const used = new Map<ProductId, number>();
      samples.forEach((id, i) => {
        const index = used.get(id) ?? 0;
        used.set(id, index + 1);
        const models = pool.get(id) ?? [];
        const item = models[index] ?? createProduce(id);
        models[index] = item;
        pool.set(id, models);
        item.scale.setScalar(0.48);
        item.position.set(((i % 3) - 1) * 0.092, 0.06, (Math.floor(i / 3) - 0.5) * 0.08);
        item.rotation.y = i * 0.7;
        contents.add(item);
      });
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(rig);
      rig.traverse((node) => {
        if (node instanceof SkinnedMesh) node.skeleton.dispose();
      });
    },
  };
}
