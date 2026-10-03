import { Vector2 } from 'three';
import { GAME_CONFIG } from './data/gameConfig';
import type { AudioManager } from './managers/AudioManager';
import { WorldRenderer } from './rendering/WorldRenderer';
import type { GameEngine } from './systems/GameEngine';
import type { SaveSystem } from './systems/SaveSystem';
import { FloatingText } from './ui/FloatingText';
import type { Hud } from './ui/Hud';
import { MobileControls } from './ui/MobileControls';
import { guidanceTarget } from './systems/BusinessInsights';

interface RuntimeServices {
  engine: GameEngine;
  save: SaveSystem;
  audio: AudioManager;
  hud: Hud;
  refreshMenus?(): void;
}

/** Rendering and lifecycle adapter; game rules and save format are renderer-independent. */
export class GameRuntime {
  readonly world: WorldRenderer;
  private readonly controls: MobileControls;
  private readonly floating: FloatingText;
  private readonly guide = document.querySelector<HTMLElement>('#goal-guide')!;
  private readonly guideArrow = this.guide.querySelector<HTMLElement>('span')!;
  private readonly guideLabel = this.guide.querySelector('small')!;
  private readonly guideViewport = new Vector2();
  private readonly keys = new Set<string>();
  private touchSprint = false;
  private readonly events = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private previousTime = 0;
  private animationTime = 0;
  private saveTimer = 0;
  private hudTimer = 0;
  private renderTimer = 0;
  private paused = false;
  private controlsBlocked = false;
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
    const sprintButton = document.querySelector<HTMLButtonElement>('#sprint-button')!;
    sprintButton.addEventListener(
      'pointerdown',
      (event) => {
        if (this.inputBlocked) return;
        event.preventDefault();
        sprintButton.setPointerCapture(event.pointerId);
        this.touchSprint = true;
        host.focus({ preventScroll: true });
      },
      options,
    );
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      sprintButton.addEventListener(
        name,
        () => {
          this.touchSprint = false;
        },
        options,
      );
    sprintButton.addEventListener(
      'keydown',
      (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          this.touchSprint = !this.inputBlocked;
        }
      },
      options,
    );
    sprintButton.addEventListener(
      'keyup',
      () => {
        this.touchSprint = false;
      },
      options,
    );
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
        if (!this.inputBlocked) this.keys.add(event.key.toLowerCase());
      },
      options,
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.clearInput(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        this.previousTime = 0;
        this.clearInput();
        services.audio.setPaused(this.suspended);
      },
      options,
    );
    host.querySelector('canvas')!.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.contextLost = true;
        services.audio.setPaused(true);
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
        this.previousTime = 0;
        services.audio.setPaused(this.suspended);
      },
      options,
    );
    document.querySelector<HTMLElement>('#debug-panel')!.hidden = !this.debug;
    this.world.update(services.engine.state, 0, 0);
    this.updateGuide();
    services.hud.update(services.engine.state);
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.services.audio.setPaused(this.suspended);
    this.clearInput();
  }
  /** Menus stop player input, not the shop simulation or its timers. */
  setControlsBlocked(blocked: boolean): void {
    this.controlsBlocked = blocked;
    this.services.engine.securityProtected = blocked;
    this.clearInput();
    this.updateGuide();
  }
  private get suspended(): boolean {
    return this.paused || this.contextLost || document.hidden;
  }
  private get inputBlocked(): boolean {
    return this.controlsBlocked || this.suspended;
  }
  private clearInput(): void {
    this.touchSprint = false;
    this.keys.clear();
    this.controls.reset();
  }

  private tick(time: number): void {
    const delta = this.previousTime ? Math.min(80, time - this.previousTime) : 16;
    this.previousTime = time;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, delta)) * 0.05;
    const { engine, audio, hud } = this.services;
    if (!this.suspended) {
      const x =
        Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'));
      const y =
        Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'));
      engine.update(
        delta,
        this.controlsBlocked
          ? { x: 0, y: 0 }
          : {
              ...this.world.screenToWorldInput(x || y ? { x, y } : this.controls.vector),
              sprint: this.keys.has('shift') || this.touchSprint,
            },
      );
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
        if (event.type === 'upgrade' || event.type === 'money' || event.type === 'notice')
          hud.announce(event.text);
      }
      audio.update(delta);
      this.saveTimer += delta;
      // Coalesce rapid harvest/stock events; explicit purchases and pagehide still flush.
      if ((important && this.saveTimer >= 2000) || this.saveTimer >= GAME_CONFIG.saveInterval)
        this.persist();
    }
    // Keep presenting while paused so resizing, camera easing, and test fixtures stay visible.
    this.renderTimer += delta;
    if (
      !this.contextLost &&
      !document.hidden &&
      (!engine.state.lowPower || this.renderTimer >= 1000 / 30 - 0.5)
    ) {
      this.world.update(engine.state, this.animationTime, this.renderTimer, engine.trashProgress);
      // Project against the camera just rendered, including low-power frames.
      // The slower HUD cadence makes this world-anchored marker visibly jump.
      this.updateGuide();
      this.renderTimer = 0;
    }
    this.floating.update(this.animationTime);
    this.hudTimer += delta;
    if (this.hudTimer >= 100) {
      this.hudTimer = 0;
      hud.update(engine.state);
      this.services.refreshMenus?.();
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

  private updateGuide(): void {
    const guide = this.guide;
    const target = guidanceTarget(this.services.engine.state);
    guide.hidden = !target || this.controlsBlocked;
    if (!target || this.controlsBlocked) return;
    const projected = this.world.screenPosition(target.position.x, target.position.y, 0.15);
    // Use logical render dimensions without triggering DOM layout every frame.
    const { x: width, y: height } = this.world.renderer.getSize(this.guideViewport);
    const x = Math.max(45, Math.min(width - 45, projected.x));
    const y = Math.max(145, Math.min(height - 175, projected.y));
    guide.style.left = `${x}px`;
    guide.style.top = `${y}px`;
    const angle = projected.visible
      ? 90
      : (Math.atan2(projected.y - height / 2, projected.x - width / 2) * 180) / Math.PI;
    this.guideArrow.style.transform = `rotate(${angle}deg)`;
    if (this.guideLabel.textContent !== target.label) this.guideLabel.textContent = target.label;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.events.abort();
    this.controls.dispose();
    this.services.audio.dispose();
    this.floating.dispose();
    this.world.dispose();
  }
}
