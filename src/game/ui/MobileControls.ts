import type { Vec2 } from '../types';

/** Fixed thumbstick on touch screens, or a floating stick when dragging the world. */
export class MobileControls {
  readonly vector: Vec2 = { x: 0, y: 0 };
  private pointer: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };
  private readonly knob: HTMLElement;
  private readonly events = new AbortController();
  private floating = false;

  constructor(
    private readonly element: HTMLElement,
    surface?: HTMLElement,
  ) {
    this.knob = element.querySelector('.joystick-knob')!;
    const options = { signal: this.events.signal };
    const start = (event: PointerEvent, floating: boolean) => {
      if (this.pointer !== null || event.button !== 0) return;
      event.preventDefault();
      surface?.focus({ preventScroll: true });
      this.pointer = event.pointerId;
      this.floating = floating;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      if (floating) {
        const parent = element.parentElement!.getBoundingClientRect();
        element.classList.add('dragging-surface');
        element.style.display = 'flex';
        element.style.left = `${event.clientX - parent.left - element.clientWidth / 2}px`;
        element.style.top = `${event.clientY - parent.top - element.clientHeight / 2}px`;
      }
      const box = element.getBoundingClientRect();
      this.center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      this.move(event);
    };
    element.addEventListener('pointerdown', (event) => start(event, false), options);
    surface?.addEventListener('pointerdown', (event) => start(event, true), options);
    window.addEventListener('pointermove', (event) => this.move(event), options);
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.pointer) this.reset();
    };
    window.addEventListener('pointerup', release, options);
    window.addEventListener('pointercancel', release, options);
    element.addEventListener('lostpointercapture', release, options);
    surface?.addEventListener('lostpointercapture', release, options);
    window.addEventListener('blur', () => this.reset(), options);
  }

  reset(): void {
    this.pointer = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = 'translate(0, 0)';
    this.element.classList.remove('active');
    if (this.floating) {
      this.element.classList.remove('dragging-surface');
      this.element.style.removeProperty('display');
      this.element.style.removeProperty('left');
      this.element.style.removeProperty('top');
      this.floating = false;
    }
  }

  dispose(): void {
    this.reset();
    this.events.abort();
  }

  private move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    event.preventDefault();
    const dx = event.clientX - this.center.x;
    const dy = event.clientY - this.center.y;
    const radius = this.element.clientWidth * 0.3;
    const distance = Math.hypot(dx, dy);
    const scale = Math.min(1, radius / (distance || 1));
    this.vector.x = (dx * scale) / radius;
    this.vector.y = (dy * scale) / radius;
    this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    this.element.classList.add('active');
  }
}
