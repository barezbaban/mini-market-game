import { AnimationClip, AnimationMixer, type AnimationAction, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The existing compact cart, relative to the shopper's feet. Forward is +Z.
export const PUSH_CART = { scale: 0.42, offset: 0.25, handleY: 0.69, handleZ: -0.35 } as const;
let walkClip: AnimationClip | undefined;
let pending: Promise<void> | undefined;

export function loadCartWalk(): void {
  pending ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}animations/cart-walk.glb`)
    .then((glb) => {
      // Blender exports one action per joint; they share the same timeline.
      walkClip = new AnimationClip(
        'CartPush',
        -1,
        glb.animations.flatMap((clip) => clip.tracks),
      );
    })
    .catch(() => console.warn('Cart walk clip unavailable; using the simple walk cycle.'));
}

export class CartWalk {
  private phase = 0;
  private weight = 0;
  private mixer?: AnimationMixer;
  private action?: AnimationAction;

  constructor(private readonly root: Object3D) {}

  reset(): void {
    this.phase = 0;
    this.weight = 0;
  }

  /** One complete left/right stride covers 0.36 world units, regardless of FPS. */
  step(distance: number, dtMs: number, clip = walkClip): void {
    this.phase = (this.phase + distance / 0.36) % 1;
    this.weight +=
      ((distance > 0.0001 ? 1 : 0) - this.weight) * (1 - Math.exp(-Math.max(0, dtMs) / 65));
    if (clip && !this.action) {
      // The simple walk may have been active during the download. Capture a
      // neutral stance, not a half-step, as the pose to blend back to at rest.
      for (const side of ['L', 'R']) {
        const hip = this.root.getObjectByName('CartHip' + side)!;
        hip.rotation.x = -Math.acos(0.203 / 0.224);
      }
      this.mixer = new AnimationMixer(this.root);
      this.action = this.mixer.clipAction(clip).play();
    }
    if (this.action && this.mixer) {
      this.action.time = this.phase * this.action.getClip().duration;
      this.action.setEffectiveWeight(this.weight);
      this.mixer.update(0);
    }
  }

  get usingClip(): boolean {
    return !!this.action;
  }
  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.root);
  }
}
