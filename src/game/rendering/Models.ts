import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ItemCounts, ProductId } from '../types';

// The whole market shares these resources, including temporary carried products.
// Removing a model from the scene must not dispose its geometry or material.
const materials = new Map<number, MeshStandardMaterial>();
const geometries = new Map<string, BufferGeometry>();
const cube = new BoxGeometry(1, 1, 1);
const sphere = new SphereGeometry(1, 10, 8);
const cylinder = new CylinderGeometry(1, 1, 1, 10);
const cone = new ConeGeometry(1, 1, 6);

export const PALETTE = {
  teal: 0x178f85,
  mint: 0x81b7a0,
  cream: 0xfff3da,
  skin: 0xf3bf91,
  ink: 0x304341,
  orange: 0xf2a047,
  leaf: 0x438c57,
  tomato: 0xe96249,
  corn: 0xf4c54c,
} as const;

export function mat(color: number): MeshStandardMaterial {
  let material = materials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
    materials.set(color, material);
  }
  return material;
}

function mesh(geometry: BufferGeometry, color: number): Mesh {
  const result = new Mesh(geometry, mat(color));
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export function box(width: number, height: number, depth: number, color: number): Mesh {
  const result = mesh(cube, color);
  result.scale.set(width, height, depth);
  return result;
}

export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  color: number,
): Mesh {
  const key = `rounded:${width}:${height}:${depth}:${radius}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(width, height, depth, 2, radius);
    geometries.set(key, geometry);
  }
  return mesh(geometry, color);
}

function ball(x: number, y: number, z: number, color: number): Mesh {
  const result = mesh(sphere, color);
  result.scale.set(x, y, z);
  return result;
}

function pill(radius: number, length: number, color: number): Mesh {
  const key = `pill:${radius}:${length}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = new CapsuleGeometry(radius, length, 3, 8);
    geometries.set(key, geometry);
  }
  return mesh(geometry, color);
}

function tube(radius: number, height: number, color: number): Mesh {
  const result = mesh(cylinder, color);
  result.scale.set(radius, height, radius);
  return result;
}

function leaf(width: number, height: number, color: number = PALETTE.leaf): Mesh {
  const result = mesh(cone, color);
  result.scale.set(width, height, width * 0.32);
  return result;
}

function at<T extends Mesh | Group>(parent: Group, child: T, x: number, y: number, z: number): T {
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

/** Produce origins are their centers, so they can be stacked or set on shelves. */
export function createProduce(id: ProductId): Group {
  const produce = new Group();
  produce.name = `produce-${id}`;

  if (id === 'tomato') {
    at(produce, ball(0.091, 0.073, 0.087, PALETTE.tomato), 0, 0, 0);
    at(produce, tube(0.009, 0.035, 0x477543), 0, 0.083, 0).rotation.z = -0.2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const sprig = at(
        produce,
        leaf(0.024, 0.065),
        Math.sin(angle) * 0.022,
        0.068,
        Math.cos(angle) * 0.022,
      );
      sprig.rotation.set(Math.cos(angle) * 1.25, angle, -Math.sin(angle) * 1.25);
    }
  } else if (id === 'egg') {
    let geometry = geometries.get('egg');
    if (!geometry) {
      geometry = new SphereGeometry(1, 12, 10);
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        // Narrow toward the top, with a wider rounded base.
        const taper = 1 - positions.getY(i) * 0.16;
        positions.setX(i, positions.getX(i) * taper);
        positions.setZ(i, positions.getZ(i) * taper);
      }
      geometry.computeVertexNormals();
      geometries.set('egg', geometry);
    }
    const egg = mesh(geometry, 0xffe5b5);
    egg.scale.set(0.066, 0.09, 0.066);
    produce.add(egg);
  } else {
    at(produce, pill(0.047, 0.11, PALETTE.corn), 0, 0.015, 0);
    // A few raised kernels make the silhouette readable without a dense mesh.
    for (let row = 0; row < 3; row++) {
      for (let side = -1; side <= 1; side += 2) {
        at(produce, ball(0.018, 0.017, 0.012, 0xffda60), side * 0.021, row * 0.044 - 0.025, 0.043);
      }
    }
    at(produce, leaf(0.033, 0.15, 0x64a052), -0.035, -0.015, 0.007).rotation.z = 0.45;
    at(produce, leaf(0.032, 0.16, 0x438b4e), 0.035, -0.025, -0.011).rotation.z = -0.4;
  }
  return produce;
}

/** A low, cloud-shaped orchard tree; origin is at the trunk's feet. */
export function createTree(): Group {
  const tree = new Group();
  tree.name = 'orchard-tree';
  at(tree, tube(0.07, 0.64, 0xb78761), 0, 0.32, 0);
  at(tree, tube(0.033, 0.34, 0xb78761), 0.09, 0.57, 0).rotation.z = -0.65;
  at(tree, ball(0.42, 0.4, 0.36, 0x79a97a), 0, 0.92, 0);
  at(tree, ball(0.28, 0.28, 0.29, 0x87b384), -0.25, 0.8, 0.035);
  at(tree, ball(0.25, 0.29, 0.28, 0x68a06b), 0.26, 0.84, 0.02);
  return tree;
}

/** An original stylized hen. Named wings let a renderer add optional movement. */
export function createChicken(): Group {
  const chicken = new Group();
  chicken.name = 'hen';
  at(chicken, ball(0.13, 0.115, 0.165, 0xfff5db), 0, 0.16, 0);
  at(chicken, ball(0.075, 0.084, 0.073, 0xfff7e5), 0, 0.265, 0.1);
  const beak = at(chicken, mesh(cone, 0xe9a344), 0, 0.253, 0.19);
  beak.scale.set(0.03, 0.058, 0.03);
  beak.rotation.x = Math.PI / 2;
  at(chicken, ball(0.015, 0.032, 0.023, 0xd96a55), 0, 0.341, 0.09);
  at(chicken, ball(0.013, 0.027, 0.019, 0xd96a55), 0, 0.334, 0.054);
  for (const side of [-1, 1]) {
    at(chicken, ball(0.009, 0.009, 0.007, PALETTE.ink), side * 0.061, 0.281, 0.14);
    const wing = at(chicken, ball(0.035, 0.064, 0.105, 0xf2e1bf), side * 0.118, 0.17, -0.015);
    wing.name = side < 0 ? 'left-wing' : 'right-wing';
    wing.rotation.z = side * 0.22;
    at(chicken, tube(0.013, 0.072, 0xd79d43), side * 0.05, 0.041, 0.01);
    at(chicken, box(0.031, 0.018, 0.067, 0xd79d43), side * 0.05, 0.012, 0.03);
  }
  const tail = at(chicken, leaf(0.056, 0.135, 0xf2e1bf), 0, 0.218, -0.151);
  tail.rotation.x = -0.7;
  return chicken;
}

export interface CharacterModel {
  group: Group;
  animate(time: number, moving: boolean): void;
  setInventory(items: Partial<ItemCounts>): void;
  setColor(color: number): void;
  setFacing(dx: number, dy: number): void;
}

/** Rounded, modestly proportioned people. Their forward direction is +Z. */
export function createCharacter(
  kind: 'player' | 'customer' | 'cashier',
  color = kind === 'customer' ? 0xe9a458 : PALETTE.teal,
): CharacterModel {
  const group = new Group();
  group.name = `${kind}-character`;
  const body = new Group();
  group.add(body);

  const torso = at(body, pill(0.09, 0.12, color), 0, 0.34, 0);
  torso.scale.z = 0.72;
  at(body, roundedBox(0.15, 0.081, 0.118, 0.024, PALETTE.ink), 0, 0.233, -0.004);

  const limbs: Group[] = [];
  for (const side of [-1, 1]) {
    const leg = at(body, new Group(), side * 0.047, 0.227, 0);
    at(leg, pill(0.032, 0.1, 0x415854), 0, -0.077, 0);
    at(leg, roundedBox(0.07, 0.042, 0.11, 0.016, PALETTE.cream), 0, -0.203, 0.019);
    // A short ankle connects the trouser to the shoe without stretching gait.
    at(leg, pill(0.024, 0.036, PALETTE.skin), 0, -0.157, 0);
    limbs.push(leg);
  }

  const arms: Group[] = [];
  const sleeves: Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = at(body, new Group(), side * 0.11, 0.405, 0);
    sleeves.push(at(arm, pill(0.036, 0.038, color), 0, -0.031, 0));
    at(arm, pill(0.027, 0.072, PALETTE.skin), 0, -0.095, 0);
    at(arm, ball(0.03, 0.034, 0.03, PALETTE.skin), 0, -0.151, 0);
    arm.rotation.z = side * 0.14;
    arms.push(arm);
  }

  at(body, tube(0.028, 0.051, PALETTE.skin), 0, 0.471, 0);
  const head = at(body, ball(0.079, 0.091, 0.072, PALETTE.skin), 0, 0.538, 0);
  // Small features read as a person without dominating the game's silhouette.
  for (const side of [-1, 1]) {
    at(body, ball(0.008, 0.009, 0.005, PALETTE.ink), side * 0.026, 0.546, 0.067);
    at(body, ball(0.013, 0.022, 0.014, PALETTE.skin), side * 0.076, 0.532, 0);
  }
  at(body, ball(0.012, 0.01, 0.012, 0xe9ae7c), 0, 0.527, 0.073);

  let cap: Mesh | undefined;
  if (kind === 'player' || kind === 'cashier') {
    // A soft work cap and a separate cream shirt make the apron distinct.
    cap = at(body, ball(0.082, 0.04, 0.076, color), 0, 0.613, -0.004);
    const brim = at(body, roundedBox(0.13, 0.016, 0.083, 0.008, color), 0, 0.603, 0.058);
    sleeves.push(brim);
    const apron = at(body, roundedBox(0.116, 0.172, 0.023, 0.012, color), 0, 0.34, 0.067);
    sleeves.push(apron);
    const pocket = at(body, roundedBox(0.062, 0.045, 0.013, 0.005, PALETTE.cream), 0, 0.32, 0.084);
    pocket.rotation.z = -0.045;
    torso.material = mat(PALETTE.cream);
    sleeves[0].material = mat(PALETTE.cream);
    sleeves[1].material = mat(PALETTE.cream);
    // Straps and a small work pack clearly mark the player's back.
    for (const side of [-1, 1]) {
      at(body, box(0.021, 0.15, 0.02, color), side * 0.047, 0.392, 0.06);
    }
    at(body, roundedBox(0.12, 0.12, 0.058, 0.02, 0xcfa672), 0, 0.342, -0.086);
  } else {
    // A restrained sculpted hair shape leaves the face visible from above.
    at(body, ball(0.081, 0.048, 0.072, 0x75533d), 0, 0.6, -0.012);
    at(body, ball(0.069, 0.066, 0.027, 0x75533d), 0, 0.562, -0.058);
    head.scale.y = 0.088;
  }

  const cargo = at(body, new Group(), 0, 0.31, -0.17);
  cargo.name = 'carried-produce';
  cargo.visible = false;
  const tray = at(cargo, roundedBox(0.31, 0.035, 0.19, 0.012, 0xe7bb7c), 0, 0, 0);
  const cargoItems = new Group();
  cargo.add(cargoItems);
  const productPool = new Map<ProductId, Group[]>();
  let inventoryKey = '';
  let carrying = false;
  let facing = 0;
  let lastTime = 0;

  return {
    group,
    animate(time, moving) {
      const delta = lastTime === 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const turn = Math.atan2(
        Math.sin(facing - group.rotation.y),
        Math.cos(facing - group.rotation.y),
      );
      group.rotation.y += turn * (1 - Math.exp(-delta * 18));
      const stride = moving ? Math.sin(time * 0.012) : 0;
      const bob = moving
        ? Math.abs(Math.sin(time * 0.012)) * 0.017
        : Math.sin(time * 0.002) * 0.003;
      body.position.y = bob;
      limbs[0].rotation.x = stride * 0.48;
      limbs[1].rotation.x = -stride * 0.48;
      arms[0].rotation.x = carrying ? -0.45 - stride * 0.08 : -stride * 0.36;
      arms[1].rotation.x = carrying ? -0.45 + stride * 0.08 : stride * 0.36;
      cargo.rotation.x = moving ? stride * 0.035 : 0;
      cargo.rotation.z = moving ? stride * 0.04 : 0;
    },
    setInventory(items) {
      const counts = { tomato: items.tomato ?? 0, egg: items.egg ?? 0, corn: items.corn ?? 0 };
      const key = `${counts.tomato}:${counts.egg}:${counts.corn}`;
      if (key === inventoryKey) return;
      inventoryKey = key;
      cargoItems.clear();
      const products: ProductId[] = [];
      for (const id of ['tomato', 'egg', 'corn'] as const) {
        const count = Math.min(12 - products.length, Math.max(0, Math.floor(counts[id])));
        for (let index = 0; index < count; index++) products.push(id);
      }
      carrying = products.length > 0;
      cargo.visible = carrying;
      tray.visible = carrying;
      const used: ItemCounts = { tomato: 0, egg: 0, corn: 0 };
      products.forEach((id, index) => {
        let pool = productPool.get(id);
        if (!pool) {
          pool = [];
          productPool.set(id, pool);
        }
        const poolIndex = used[id]++;
        const product = pool[poolIndex] ?? createProduce(id);
        pool[poolIndex] = product;
        product.position.set(
          index % 2 === 0 ? -0.074 : 0.074,
          0.104 + Math.floor(index / 2) * 0.153,
          0,
        );
        product.rotation.y = index * 1.6;
        cargoItems.add(product);
      });
    },
    setColor(nextColor) {
      if (kind === 'customer') {
        torso.material = mat(nextColor);
        sleeves.forEach((sleeve) => {
          sleeve.material = mat(nextColor);
        });
      } else {
        if (cap) cap.material = mat(nextColor);
        sleeves.slice(2).forEach((sleeve) => {
          sleeve.material = mat(nextColor);
        });
      }
    },
    setFacing(dx, dy) {
      if (Math.hypot(dx, dy) > 0.0001) facing = Math.atan2(dx, dy);
    },
  };
}
