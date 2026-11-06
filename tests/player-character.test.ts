import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { Group, SkinnedMesh, Vector3, Quaternion } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createPlayerCharacter, validatePlayerArt } from '../src/game/rendering/PlayerCharacter';

let art: GLTF;
beforeAll(async () => {
  const bytes = readFileSync('public/models/player.glb');
  art = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
});
const makePlayer = () => createPlayerCharacter(() => new Group(), art)!;
const pos = (root: Group, name: string) =>
  root.getObjectByName(name)!.getWorldPosition(new Vector3());

it('ships a compact, genuinely skinned Blender character with four complete looping poses', () => {
  validatePlayerArt(art);
  expect(readFileSync('public/models/player.glb').byteLength).toBeLessThan(450_000);
  expect(art.parser.json.asset.generator).toContain('Blender');
  expect(art.parser.json.images ?? []).toHaveLength(0);
  const skin = art.scene.getObjectByName('PlayerSkin') as SkinnedMesh;
  expect(skin.skeleton.bones.length).toBe(15);
  expect(skin.geometry.getAttribute('skinWeight')).toBeDefined();
  for (const name of ['position', 'normal', 'skinWeight']) {
    expect(Array.from(skin.geometry.getAttribute(name).array).every(Number.isFinite), name).toBe(
      true,
    );
  }
  for (const clip of art.animations) {
    expect(clip.duration).toBeCloseTo(1);
    for (const track of clip.tracks) {
      expect(Array.from(track.values).every(Number.isFinite), track.name).toBe(true);
      const size = track.getValueSize();
      for (let i = 0; i < size; i++)
        expect(track.values[i], `${clip.name}:${track.name}`).toBeCloseTo(
          track.values[track.values.length - size + i],
          4,
        );
    }
  }
});

it('keeps the planted foot on the ground while the opposite knee bends during a step', () => {
  const p = makePlayer();
  p.animate(0, false);
  for (let i = 1; i <= 120; i++) {
    p.group.position.z += 0.48 / 120;
    p.animate((i * 1000) / 120, true);
  }
  const start = pos(p.group, 'FootL');
  for (let i = 1; i <= 12; i++) {
    p.group.position.z += 0.48 / 120;
    p.animate(1000 + (i * 1000) / 120, true);
    expect(pos(p.group, 'FootL').distanceTo(start)).toBeLessThan(0.003);
    expect(pos(p.group, 'FootR').y).toBeGreaterThan(0.027);
  }
  p.dispose?.();
});

it('uses the same gait and shortest turn at 30 and 60 fps, then settles into idle', () => {
  const a = makePlayer(),
    b = makePlayer();
  for (const [player, fps] of [
    [a, 30],
    [b, 60],
  ] as const) {
    player.group.rotation.y = Math.PI - 0.05;
    player.setFacing(-0.05, -1);
    player.animate(0, false);
    for (let i = 1; i <= fps; i++) {
      player.group.position.z += 0.63 / fps;
      player.animate((i * 1000) / fps, true);
    }
    expect(Math.abs(player.group.rotation.y - Math.PI)).toBeLessThan(0.06);
  }
  for (const name of ['FootL', 'FootR', 'HandL', 'HandR'])
    expect(pos(a.group, name).distanceTo(pos(b.group, name))).toBeLessThan(0.0001);
  for (let i = 1; i <= 90; i++) a.animate(1000 + (i * 1000) / 60, false);
  expect(pos(a.group, 'FootL').y).toBeCloseTo(0.03, 2);
  expect(pos(a.group, 'FootR').y).toBeCloseTo(0.03, 2);
  a.dispose?.();
  b.dispose?.();
});

it('holds a bounded tray between both hands, blends into carrying, and reuses item meshes', () => {
  const p = makePlayer();
  p.animate(0, false);
  const arm = p.group.getObjectByName('ForearmL')!;
  const before = arm.quaternion.clone();
  p.setInventory({ tomato: 100, milk: 3 });
  p.animate(16, false);
  expect(before.angleTo(arm.quaternion)).toBeLessThan(0.5);
  for (let i = 2; i <= 90; i++) p.animate(i * 16, false);
  const hands = pos(p.group, 'HandL').add(pos(p.group, 'HandR')).multiplyScalar(0.5);
  const tray = pos(p.group, 'carried-produce');
  expect(tray.distanceTo(hands)).toBeLessThan(0.02);
  expect(tray.z).toBeGreaterThan(0.15);
  expect(tray.y).toBeLessThan(pos(p.group, 'PlayerHead').y);
  const contents = p.group.getObjectByName('player-tray-items')!;
  expect(contents.children).toHaveLength(6);
  const first = contents.children[0];
  p.setInventory({});
  expect(p.group.getObjectByName('carried-produce')!.visible).toBe(false);
  p.setInventory({ tomato: 100, milk: 3 });
  expect(contents.children[0]).toBe(first);
  p.dispose?.();
});

it('does not advance gait for a save teleport or animate a second player skeleton by accident', () => {
  const a = makePlayer(),
    b = makePlayer();
  a.animate(0, false);
  b.animate(0, false);
  const idle = b.group.getObjectByName('ThighL')!.quaternion.clone();
  a.group.position.z = 20;
  a.animate(16, true);
  const q = a.group.getObjectByName('ThighL')!.quaternion;
  expect(q.angleTo(idle)).toBeLessThan(0.01);
  expect(b.group.getObjectByName('ThighL')!.quaternion.angleTo(idle)).toBeLessThan(0.000001);
  expect(q.angleTo(new Quaternion())).toBeLessThan(Math.PI);
  a.dispose?.();
  b.dispose?.();
});
