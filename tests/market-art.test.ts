import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PRODUCTS } from '../src/game/data/products';
import { MACHINES } from '../src/game/data/machines';

it('ships single-mesh painted Blender props, in local coordinates and without external resources', async () => {
  const data = readFileSync('public/models/market.glb');
  const glb = await new GLTFLoader().parseAsync(new Uint8Array(data).buffer, '');
  expect(data.byteLength).toBeLessThan(1_300_000);
  expect(glb.parser.json.asset.generator).toContain('Blender');
  expect(glb.parser.json.images ?? []).toHaveLength(0);
  for (const id of [
    ...PRODUCTS.map((p) => p.id),
    ...MACHINES.map((m) => 'machine_' + m.id),
    'cow',
    'hen',
    'tree',
    'till',
    'awning',
    'face',
    'hair',
    'cart',
    'car_paint',
    'car_trim',
    'bike',
    'notes',
    'crate',
    'bin',
    'satchel',
    'desk_accountant',
    'desk_marketing',
    'kitPill',
    'kitBevel',
    'kitBall',
    'kitBlock',
    'kitDisc',
    'kitCone',
    'shelf_base',
    'plant_tomato',
    'plant_coffee',
    'plant_corn',
    'plant_carrot',
  ]) {
    const mesh = glb.scene.getObjectByName(id) as Mesh;
    expect(mesh?.isMesh, id).toBe(true);
    expect(mesh.geometry.getAttribute('color').count).toBe(
      mesh.geometry.getAttribute('position').count,
    );
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.min.x, id).toBeGreaterThan(-1.5);
    expect(mesh.geometry.boundingBox!.max.x, id).toBeLessThan(1.5);
  }
});
