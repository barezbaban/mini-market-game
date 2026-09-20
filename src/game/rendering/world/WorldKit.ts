import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import type { Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cube = new BoxGeometry(1, 1, 1);
const roundedCube = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
const cylinder = new CylinderGeometry(1, 1, 1, 16);
const ball = new SphereGeometry(1, 12, 8);
const plane = new PlaneGeometry(1, 1);
const materials = new Map<number, MeshStandardMaterial>();

export const PALETTE = {
  grass: 0x8ad66c,
  darkGrass: 0x70bd55,
  cream: 0xfff8e8,
  tile: 0xf1ede0,
  grout: 0xe4e0d1,
  green: 0x219e74,
  darkGreen: 0x117054,
  mint: 0xbae8c5,
  peach: 0xffad83,
  wood: 0xd9a56d,
  soil: 0x9b6746,
  gold: 0xffd554,
  white: 0xffffff,
};

export function material(color: number): MeshStandardMaterial {
  let existing = materials.get(color);
  if (!existing) {
    existing = new MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 });
    materials.set(color, existing);
  }
  return existing;
}

export function block(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: number,
  rounded = true,
): Mesh {
  const mesh = new Mesh(rounded ? roundedCube : cube, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = height > 0.03;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function disc(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  color: number,
): Mesh {
  const mesh = new Mesh(cylinder, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function sphere(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  color: number,
): Mesh {
  const mesh = new Mesh(ball, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function ring(parent: Object3D, radius: number, color: number, thickness = 0.04): Mesh {
  const mesh = new Mesh(
    new RingGeometry(radius - thickness, radius, 64, 1, Math.PI / 2),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

export interface WorldLabel {
  object: Sprite | Mesh;
  setText(text: string, foreground?: string, background?: string): void;
}

/** Canvas is only for legible labels: all scenery and characters are real meshes. */
export function label(
  parent: Object3D,
  text: string,
  width: number,
  height: number,
  options: {
    foreground?: string;
    background?: string;
    flat?: boolean;
    surface?: boolean;
    fontSize?: number;
  } = {},
): WorldLabel {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const context = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  const labelMaterial =
    options.flat || options.surface
      ? new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
      : new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const object =
    options.flat || options.surface
      ? new Mesh(plane, labelMaterial as MeshBasicMaterial)
      : new Sprite(labelMaterial as SpriteMaterial);
  object.scale.set(width, height, 1);
  if (options.flat) object.rotation.x = -Math.PI / 2;
  object.renderOrder = 3;
  parent.add(object);
  let previous = '';
  const setText = (
    next: string,
    foreground = options.foreground ?? '#185b43',
    background = options.background ?? '',
  ) => {
    const key = `${next}|${foreground}|${background}`;
    if (previous === key) return;
    previous = key;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (background) {
      context.fillStyle = background;
      context.beginPath();
      context.roundRect(0, 0, canvas.width, canvas.height, Math.min(30, canvas.height / 2));
      context.fill();
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = foreground;
    context.font = `800 ${options.fontSize ?? Math.round(canvas.height * 0.58)}px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`;
    context.fillText(next, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 34);
    texture.needsUpdate = true;
  };
  setText(text);
  return { object, setText };
}

export function crate(parent: Object3D, x: number, y: number, z: number, scale = 1): Group {
  const group = new Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  parent.add(group);
  block(group, 0, 0.035, 0, 0.62, 0.07, 0.45, PALETTE.wood);
  [-1, 1].forEach((side) => {
    block(group, 0, 0.16, side * 0.2, 0.64, 0.24, 0.055, PALETTE.wood);
    block(group, side * 0.285, 0.16, 0, 0.065, 0.24, 0.42, 0xc38e57);
  });
  return group;
}
