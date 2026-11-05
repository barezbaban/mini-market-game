import { readFileSync } from 'node:fs';
import { Vector3, AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { CartWalk, PUSH_CART } from '../src/game/rendering/CartWalk';
import { createCharacter } from '../src/game/rendering/Models';

it('the Blender walk plants a foot, loops by distance and settles with both hands on the handle', async () => {
  const bytes = readFileSync('public/animations/cart-walk.glb');
  const glb = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const clip = new AnimationClip(
    'CartPush',
    -1,
    glb.animations.flatMap((c) => c.tracks),
  );
  expect(clip.tracks.length).toBe(6);
  expect(clip.duration).toBeCloseTo(1);
  const model = createCharacter('customer', undefined, true);
  const walk = new CartWalk(model.group);
  const pos = (name: string) => model.group.getObjectByName(name)!.getWorldPosition(new Vector3());
  walk.step(0.36, 2000, clip);
  const planted = pos('CartFootL');
  for (let i = 0; i < 12; i++) {
    model.group.position.z += 0.015;
    walk.step(0.015, 16, clip);
    expect(pos('CartFootL').distanceTo(planted)).toBeLessThan(0.0001);
  }
  model.group.rotation.y = 1.2;
  for (const [side, x] of [
    ['L', -0.075],
    ['R', 0.075],
  ] as const) {
    const grip = model.group.localToWorld(
      new Vector3(
        x,
        PUSH_CART.handleY * PUSH_CART.scale,
        PUSH_CART.offset + PUSH_CART.handleZ * PUSH_CART.scale,
      ),
    );
    expect(pos('CartHand' + side).distanceTo(grip)).toBeLessThan(0.0001);
  }
  walk.step(0, 1800, clip);
  expect(pos('CartFootL').y).toBeCloseTo(0.024);
  expect(pos('CartFootR').y).toBeCloseTo(0.024);
  walk.reset();
  walk.step(0, 16, clip);
  expect(model.group.getObjectByName('CartHipL')!.rotation.x).toBeCloseTo(
    -Math.acos(0.203 / 0.224),
  );
  walk.dispose();
  expect(createCharacter('customer').group.getObjectByName('CartHipL')).toBeUndefined();
});
