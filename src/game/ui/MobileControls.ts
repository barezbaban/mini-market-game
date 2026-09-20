import type { Vec2 } from '../types';

export class MobileControls {
  readonly vector: Vec2 = { x: 0, y: 0 };
  private pointer: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };
  private knob: HTMLElement;

  constructor(private element: HTMLElement) {
    this.knob = element.querySelector('.joystick-knob')!;
    element.addEventListener('pointerdown', (event) => {
      if (this.pointer !== null) return;
      this.pointer = event.pointerId;
      element.setPointerCapture(event.pointerId);
      const box = element.getBoundingClientRect();
      this.center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      this.move(event);
    });
    element.addEventListener('pointermove', (event) => this.move(event));
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.pointer) this.reset();
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', () => this.reset());
  }

  reset(): void {
    this.pointer = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = 'translate(0, 0)';
    this.element.classList.remove('active');
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
