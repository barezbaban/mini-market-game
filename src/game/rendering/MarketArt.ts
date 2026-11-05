import {
  Mesh,
  InstancedMesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Local geometry only: the .blend file lays props out on a gallery grid.
// In the market, existing game anchors and animated joints determine placement.
const library = new Map<string, BufferGeometry>();
const ceramic = new MeshStandardMaterial({ vertexColors: true, roughness: 0.84 });
export const marketGeometry = (name: string) => library.get(name);
export function marketInstances(name: string, capacity: number): InstancedMesh | undefined {
  const geometry = library.get(name);
  return geometry ? new InstancedMesh(geometry, ceramic, capacity) : undefined;
}
export function addMarketProp(parent: Object3D, name: string): Mesh | undefined {
  const geometry = library.get(name);
  if (!geometry) return;
  const mesh = new Mesh(geometry, ceramic);
  mesh.name = 'blender:' + name;
  parent.add(mesh);
  return mesh;
}

export async function loadMarketArt(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'models/market.glb', {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Model library unavailable');
    const glb = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    glb.scene.traverse((node) => {
      if (
        node instanceof Mesh &&
        node.geometry.getAttribute('position') &&
        node.geometry.getAttribute('color')
      ) {
        library.set(node.name, node.geometry);
      }
    });
    for (const id of [
      'kitBlock',
      'kitBevel',
      'kitBall',
      'kitDisc',
      'kitCone',
      'kitPill',
      'tomato',
      'egg',
      'corn',
      'grilledCorn',
      'coffee',
      'carrot',
      'tomatoPaste',
      'groundCoffee',
      'milk',
      'cheese',
      'cow',
      'hen',
      'tree',
      'cart',
      'till',
      'machine_paste',
      'machine_coffee',
      'machine_dairy',
      'machine_grill',
      'face',
      'hair',
      'car_paint',
      'car_trim',
      'bike',
      'awning',
      'shelf_base',
      'notes',
      'satchel',
      'crate',
      'bin',
      'desk_marketing',
      'desk_accountant',
      'plant_tomato',
      'plant_coffee',
      'plant_corn',
      'plant_carrot',
    ]) {
      if (!library.has(id)) throw new Error('Incomplete market library');
    }
  } catch {
    library.clear();
    // Offline, partial deployments, and older browsers still get the original market.
    console.warn('Using the built-in market models.');
  } finally {
    clearTimeout(timer);
  }
}
