import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KeyframeTrack } from 'three';

export type HandAction = 'take' | 'place';
let curve: KeyframeTrack | undefined, loading: Promise<void> | undefined;
function loadCurve(): void {
  loading ??= new GLTFLoader()
    .loadAsync(import.meta.env.BASE_URL + 'animations/reach.glb')
    .then(({ animations }) => {
      curve = animations.flatMap((c) => c.tracks).find((t) => t.name === 'ReachHands.quaternion');
    })
    .catch(() => {
      /* A short procedural reach keeps the game playable offline. */
    });
}
// The clip rotates only about local X. Sample without allocating per-frame poses.
function shoulder(phase: number): number {
  if (!curve) return -Math.sin(Math.PI * phase);
  const { times, values } = curve,
    end = times.length - 1,
    t = phase * times[end];
  let i = 0;
  while (i < end - 1 && times[i + 1] < t) i++;
  const f = (t - times[i]) / (times[i + 1] - times[i]);
  const a = 2 * Math.atan2(values[4 * i], values[4 * i + 3]);
  const b = 2 * Math.atan2(values[4 * i + 4], values[4 * i + 7]);
  return a + (b - a) * f;
}
export class ReachMotion {
  private pending?: HandAction;
  private active?: HandAction;
  private start = 0;
  request(action: HandAction) {
    loadCurve();
    this.pending = action;
  }
  sample(time: number) {
    if (this.active && time - this.start >= 420) this.active = undefined;
    if (!this.active && this.pending) {
      this.active = this.pending;
      this.pending = undefined;
      this.start = time;
    }
    if (!this.active) return 0;
    const phase = Math.max(0, Math.min(1, (time - this.start) / 420));
    return shoulder(this.active === 'take' ? phase : 1 - phase);
  }
}
