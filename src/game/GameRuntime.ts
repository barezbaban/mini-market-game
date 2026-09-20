import { GAME_CONFIG } from './data/gameConfig';
import type { AudioManager } from './managers/AudioManager';
import { WorldRenderer } from './rendering/WorldRenderer';
import type { GameEngine } from './systems/GameEngine';
import type { SaveSystem } from './systems/SaveSystem';
import { FloatingText } from './ui/FloatingText';
import type { Hud } from './ui/Hud';
import { MobileControls } from './ui/MobileControls';

interface RuntimeServices {
  engine: GameEngine;
  save: SaveSystem;
  audio: AudioManager;
  hud: Hud;
}

/** Rendering and lifecycle adapter; game rules and save format are renderer-independent. */
export class GameRuntime {
  readonly world: WorldRenderer;
  private readonly controls: MobileControls;
  private readonly floating: FloatingText;
  private readonly keys = new Set<string>();
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private previousTime = 0;
  private animationTime = 0;
  private saveTimer = 0;
  private hudTimer = 0;
  private paused = false;
  private contextLost = false;
  private fps = 60;
  private readonly debug = new URLSearchParams(location.search).get('debug') === 'true';

  constructor(
    host: HTMLElement,
    private readonly services: RuntimeServices,
  ) {
    this.world = new WorldRenderer(host);
    this.controls = new MobileControls(document.querySelector('#joystick')!, host);
    this.floating = new FloatingText(host, (x, y, elevation) =>
      this.world.screenPosition(x, y, elevation),
    );
    this.resizeObserver = new ResizeObserver(() => this.world.resize());
    this.resizeObserver.observe(host);
    const options = { signal: this.events.signal };
    window.addEventListener(
      'keydown',
      (event) => {
        if (document.querySelector('dialog[open]')) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('button, a, input, select, textarea')
        )
          return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
          event.preventDefault();
        if (!this.paused) this.keys.add(event.key.toLowerCase());
      },
      options,
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.clearInput(), options);
    host.querySelector('canvas')!.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.persist();
        this.clearInput();
        services.hud.announce('Graphics were interrupted. Your game has been saved.');
      },
      options,
    );
    host.querySelector('canvas')!.addEventListener(
      'webglcontextrestored',
      () => {
        this.contextLost = false;
      },
      options,
    );
    document.querySelector<HTMLElement>('#debug-panel')!.hidden = !this.debug;
    this.world.update(services.engine.state, 0, 0);
    services.hud.update(services.engine.state);
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clearInput();
  }
  private clearInput(): void {
    this.keys.clear();
    this.controls.reset();
  }

  private tick(time: number): void {
    const delta = this.previousTime ? Math.min(80, time - this.previousTime) : 16;
    this.previousTime = time;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, delta)) * 0.05;
    const { engine, audio, hud } = this.services;
    if (!this.paused && !this.contextLost) {
      const x =
        Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'));
      const y =
        Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'));
      engine.update(delta, this.world.screenToWorldInput(x || y ? { x, y } : this.controls.vector));
      this.animationTime += delta;
      const events = engine.drainEvents();
      let important = false;
      for (const event of events) {
        this.floating.show(event, this.animationTime);
        this.world.showEvent(event);
        if (event.type !== 'notice') {
          audio.play(event.type);
          important = true;
        }
        if (event.type === 'upgrade' || event.type === 'money') hud.announce(event.text);
      }
      audio.update(delta);
      this.saveTimer += delta;
      if (important || this.saveTimer >= GAME_CONFIG.saveInterval) this.persist();
    }
    // Keep presenting while paused so resizing, camera easing, and test fixtures stay visible.
    if (!this.contextLost)
      this.world.update(engine.state, this.animationTime, delta, engine.trashProgress);
    this.floating.update(this.animationTime);
    this.hudTimer += delta;
    if (this.hudTimer >= 100) {
      this.hudTimer = 0;
      hud.update(engine.state);
      if (this.debug) {
        document.querySelector('#debug-panel')!.textContent =
          `3D · ${Math.round(this.fps)} FPS · ${this.world.renderer.info.render.calls} draw calls\nPlayer ${Math.round(engine.state.player.x)}, ${Math.round(engine.state.player.y)}\nBasket ${JSON.stringify(engine.state.inventory)}\n${engine.state.customers.map((customer) => `${customer.id}:${customer.state}`).join(' ')}\nSales ${engine.state.totalServed} · Tutorial ${engine.state.tutorialStep}`;
      }
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  persist(): void {
    this.saveTimer = 0;
    this.services.hud.setSaved(this.services.save.save(this.services.engine.snapshot()));
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.events.abort();
    this.controls.dispose();
    this.floating.dispose();
    this.world.dispose();
  }
}
