import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/managers/AudioManager';

class Gain {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}
class Voice {
  type = 'sine';
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  static latest: Context;
  state = 'running';
  currentTime = 0;
  destination = {};
  gains: Gain[] = [];
  voices: Voice[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() {
    Context.latest = this;
  }
  createGain(): Gain {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator(): Voice {
    const voice = new Voice();
    this.voices.push(voice);
    return voice;
  }
}
beforeEach(() => vi.stubGlobal('AudioContext', Context));
afterEach(() => vi.unstubAllGlobals());

describe('lightweight market audio', () => {
  it('waits for a gesture and supports independent music and effects volume', () => {
    const audio = new AudioManager();
    audio.play('harvest');
    audio.update(500);
    audio.setVolumes(0.4, 0.2);
    audio.unlock();
    const context = Context.latest;
    expect(context.voices).toHaveLength(0);
    expect(context.gains[0].gain.value).toBe(0.4);
    expect(context.gains[1].gain.value).toBe(0.2);
    audio.play('harvest');
    audio.update(300);
    expect(context.voices).toHaveLength(4); // Two pickup notes + melody + bass.
  });
  it('mutes already-scheduled audio immediately and freezes music when paused', () => {
    const audio = new AudioManager();
    audio.unlock();
    audio.play('checkout');
    audio.setEnabled(false);
    expect(Context.latest.gains.slice(0, 2).map(({ gain }) => gain.value)).toEqual([0, 0]);
    audio.update(50000);
    audio.play('stock');
    expect(Context.latest.voices).toHaveLength(3);
    audio.setEnabled(true);
    audio.setPaused(true);
    audio.update(50000);
    expect(Context.latest.voices).toHaveLength(3);
    expect(Context.latest.gains[1].gain.value).toBe(0);
    audio.setPaused(false);
    audio.update(300);
    expect(Context.latest.voices).toHaveLength(5);
  });
  it('throttles repeated transfers, bounds polyphony and releases finished nodes', () => {
    const audio = new AudioManager();
    audio.unlock();
    for (let i = 0; i < 100; i++) audio.play('stock');
    expect(Context.latest.voices).toHaveLength(2);
    for (let i = 0; i < 100; i++) {
      Context.latest.currentTime += 0.2;
      audio.play('checkout');
    }
    expect(Context.latest.voices).toHaveLength(20);
    for (const voice of [...Context.latest.voices]) voice.onended?.();
    expect(Context.latest.voices[0].disconnect).toHaveBeenCalledOnce();
    Context.latest.currentTime += 1;
    audio.play('harvest');
    expect(Context.latest.voices).toHaveLength(22);
    audio.dispose();
    expect(Context.latest.close).toHaveBeenCalledOnce();
    expect(Context.latest.voices.at(-1)!.stop).toHaveBeenCalledTimes(2);
  });
  it('does not play disabled channels or flood notes after a long frame', () => {
    const audio = new AudioManager();
    audio.unlock();
    audio.setVolumes(0, 0);
    audio.play('money');
    audio.update(1000000);
    expect(Context.latest.voices).toHaveLength(0);
    audio.setVolumes(0, 1);
    audio.update(1000000);
    expect(Context.latest.voices).toHaveLength(2);
  });
  it('fails quietly on devices without Web Audio', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('Unavailable');
        }
      },
    );
    const audio = new AudioManager();
    expect(() => {
      audio.unlock();
      audio.play('harvest');
      audio.update(300);
      audio.dispose();
    }).not.toThrow();
  });
});
