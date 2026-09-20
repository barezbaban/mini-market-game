import type { GameEvent } from '../types';

interface FloatLabel {
  element: HTMLSpanElement;
  event: GameEvent;
  started: number;
}
type Project = (
  x: number,
  y: number,
  elevation?: number,
) => { x: number; y: number; visible: boolean };

/** Screen-space text follows its 3D anchor while the camera moves. */
export class FloatingText {
  private readonly layer = document.createElement('div');
  private active: FloatLabel[] = [];
  private pool: HTMLSpanElement[] = [];

  constructor(
    host: HTMLElement,
    private readonly project: Project,
  ) {
    this.layer.className = 'floating-labels';
    this.layer.setAttribute('aria-hidden', 'true');
    host.append(this.layer);
  }

  show(event: GameEvent, time: number): void {
    if (this.active.length >= 16) return;
    const element = this.pool.pop() ?? document.createElement('span');
    element.className = `world-float ${event.type}`;
    element.textContent = event.text;
    element.hidden = false;
    this.layer.append(element);
    this.active.push({ element, event, started: time });
  }

  update(time: number): void {
    this.active = this.active.filter((label) => {
      const age = (time - label.started) / 1200;
      if (age >= 1) {
        label.element.hidden = true;
        this.pool.push(label.element);
        return false;
      }
      const position = this.project(label.event.x, label.event.y, 0.85 + age * 0.55);
      label.element.style.transform = `translate(${position.x}px, ${position.y}px) translate(-50%, -100%)`;
      label.element.style.opacity = position.visible ? String(Math.min(1, (1 - age) * 2)) : '0';
      return true;
    });
  }

  dispose(): void {
    this.layer.remove();
    this.active = [];
    this.pool = [];
  }
}
