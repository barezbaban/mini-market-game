import Phaser from 'phaser';
import { GAME_CONFIG } from '../data/gameConfig';
import { AudioManager } from '../managers/AudioManager';
import { WorldRenderer } from '../rendering/WorldRenderer';
import { GameEngine } from '../systems/GameEngine';
import { SaveSystem } from '../systems/SaveSystem';
import { FloatingText } from '../ui/FloatingText';
import type { Hud } from '../ui/Hud';
import { MobileControls } from '../ui/MobileControls';

export interface SceneServices {
  engine: GameEngine;
  save: SaveSystem;
  audio: AudioManager;
  hud: Hud;
  onReady(): void;
}

export class GameScene extends Phaser.Scene {
  private world!: WorldRenderer;
  private floating!: FloatingText;
  private controls!: MobileControls;
  private keys = new Set<string>();
  private saveTimer = 0;
  private hudTimer = 0;
  private debug = new URLSearchParams(location.search).get('debug') === 'true';

  constructor(private services: SceneServices) {
    super('GameScene');
  }

  create(): void {
    this.world = new WorldRenderer(this);
    this.floating = new FloatingText(this);
    this.controls = new MobileControls(document.querySelector('#joystick')!);
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, input, select, textarea')
      )
        return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
        event.preventDefault();
      this.keys.add(event.key.toLowerCase());
    };
    const keyup = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());
    const reset = () => {
      this.keys.clear();
      this.controls.reset();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', reset);
    this.events.on('pause', reset);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', reset);
    });
    if (this.debug) document.querySelector<HTMLElement>('#debug-panel')!.hidden = false;
    this.world.update(this.services.engine.state, 0, 0);
    this.services.hud.update(this.services.engine.state);
    this.services.onReady();
  }

  update(time: number, rawDelta: number): void {
    const delta = Math.min(rawDelta, 80);
    const { engine, audio, hud } = this.services;
    const x =
      Number(this.keys.has('d') || this.keys.has('arrowright')) -
      Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const y =
      Number(this.keys.has('s') || this.keys.has('arrowdown')) -
      Number(this.keys.has('w') || this.keys.has('arrowup'));
    engine.update(delta, x || y ? { x, y } : this.controls.vector);
    const events = engine.drainEvents();
    let important = false;
    for (const event of events) {
      this.floating.show(event);
      if (event.type !== 'notice') {
        audio.play(event.type);
        important = true;
      }
      if (event.type === 'upgrade' || event.type === 'money') hud.announce(event.text);
    }
    this.world.update(engine.state, time, delta);
    audio.update(delta);
    this.hudTimer += delta;
    if (this.hudTimer > 100) {
      hud.update(engine.state);
      this.hudTimer = 0;
      if (this.debug) {
        document.querySelector('#debug-panel')!.textContent =
          `FPS ${Math.round(this.game.loop.actualFps)} · player ${Math.round(engine.state.player.x)}, ${Math.round(engine.state.player.y)}\nBasket ${JSON.stringify(engine.state.inventory)}\nCustomers ${engine.state.customers.map((customer) => `${customer.id}:${customer.state}`).join(' ')}\nSales ${engine.state.totalServed} · Tutorial ${engine.state.tutorialStep}`;
      }
    }
    this.saveTimer += delta;
    if (important || this.saveTimer >= GAME_CONFIG.saveInterval) this.persist();
  }

  persist(): void {
    this.saveTimer = 0;
    this.services.hud.setSaved(this.services.save.save(this.services.engine.snapshot()));
  }
}
