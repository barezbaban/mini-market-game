type SoundName = 'harvest' | 'stock' | 'money' | 'checkout' | 'upgrade' | 'purchase' | 'discard';
const EFFECTS: Record<SoundName, number[]> = {
  harvest: [659, 880],
  stock: [392, 523],
  money: [784, 988, 1319],
  checkout: [1047, 1319, 1568],
  upgrade: [523, 659, 784, 1047],
  purchase: [587, 784],
  discard: [294, 220],
};
// Original 8-bar major-key tune with soft bass on alternate beats.
const MELODY = [
  72, 76, 79, 76, 74, 77, 81, 79, 76, 79, 84, 83, 81, 79, 76, 74, 72, 76, 79, 84, 81, 77, 74, 77,
  79, 76, 74, 71, 72, 76, 72, 0,
];

/** No downloads or continuous oscillators; bounded, cleaned-up Web Audio voices. */
export class AudioManager {
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private enabled = true;
  private paused = false;
  private effectsVolume = 0.7;
  private musicVolume = 0.35;
  private musicTimer = 0;
  private note = 0;
  private readonly voices = new Set<OscillatorNode>();
  private readonly lastPlayed = new Map<SoundName, number>();

  unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.effects = this.context.createGain();
        this.music = this.context.createGain();
        this.effects.connect(this.context.destination);
        this.music.connect(this.context.destination);
        this.applyVolumes();
      } catch {
        return;
      }
    }
    void this.context.resume().catch(() => undefined);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVolumes();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.musicTimer = 0;
    this.applyVolumes();
  }

  setVolumes(effects: number, music: number): void {
    this.effectsVolume = Number.isFinite(effects) ? Math.max(0, Math.min(1, effects)) : 0;
    this.musicVolume = Number.isFinite(music) ? Math.max(0, Math.min(1, music)) : 0;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const audible = this.enabled && !this.paused;
    if (this.effects) this.effects.gain.value = audible ? this.effectsVolume : 0;
    if (this.music) this.music.gain.value = audible ? this.musicVolume : 0;
  }

  play(name: SoundName): void {
    if (
      !this.enabled ||
      this.paused ||
      !this.effectsVolume ||
      !this.context ||
      this.context.state !== 'running'
    )
      return;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 0.1) return;
    this.lastPlayed.set(name, now);
    EFFECTS[name].forEach((frequency, index) =>
      this.tone(frequency, index * 0.065, 0.13, 0.045, this.effects),
    );
  }

  update(delta: number): void {
    if (
      !this.enabled ||
      this.paused ||
      !this.musicVolume ||
      !this.context ||
      this.context.state !== 'running' ||
      !Number.isFinite(delta) ||
      delta <= 0
    )
      return;
    this.musicTimer += delta;
    if (this.musicTimer < 300) return;
    // Never schedule a catch-up burst after a suspended frame or tab.
    this.musicTimer %= 300;
    const beat = this.note++ % MELODY.length;
    const midi = MELODY[beat];
    if (midi) this.tone(440 * 2 ** ((midi - 69) / 12), 0, 0.24, 0.025, this.music);
    if (beat % 2 === 0) {
      const bass = [48, 53, 48, 55][Math.floor(beat / 8)];
      this.tone(440 * 2 ** ((bass - 69) / 12), 0, 0.45, 0.035, this.music);
    }
  }

  private tone(
    frequency: number,
    delay: number,
    duration: number,
    volume: number,
    bus: GainNode | null,
  ): void {
    if (!this.context || !bus || this.voices.size >= 20) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  dispose(): void {
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
    this.effects?.disconnect();
    this.music?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
