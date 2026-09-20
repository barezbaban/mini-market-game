type SoundName =
  | 'harvest'
  | 'stock'
  | 'money'
  | 'checkout'
  | 'upgrade'
  | 'purchase'
  | 'discard';

/** Original synthesized tones; no downloaded or licensed audio files. */
export class AudioManager {
  private context: AudioContext | null = null;
  private enabled = true;
  private musicTimer = 0;
  private note = 0;

  unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
    }
    void this.context.resume().catch(() => undefined);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const tones: Record<SoundName, number[]> = {
      harvest: [523, 659],
      stock: [392, 523],
      money: [659, 784, 1046],
      checkout: [440, 554],
      upgrade: [523, 659, 784, 1046],
      purchase: [587, 784],
      discard: [294, 220],
    };
    tones[name].forEach((frequency, index) => this.tone(frequency, index * 0.075, 0.1, 0.045));
  }

  update(delta: number): void {
    this.musicTimer += delta;
    if (this.musicTimer < 1300) return;
    this.musicTimer = 0;
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    this.tone(melody[this.note++ % melody.length], 0, 0.65, 0.009);
  }

  private tone(frequency: number, delay: number, duration: number, volume: number): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }
}
