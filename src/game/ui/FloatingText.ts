import type { GameEvent } from '../types';

interface FloatLabel {
  element: HTMLSpanElement;
  event: GameEvent;
  started: number;
  lift: number;
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
    this.active.push({ element, event, started: time, lift: 0 });
  }

  update(time: number): void {
    this.active = this.active.filter((label) => {
      const age = (time - label.started) / 1200;
      if (age >= 1) {
        label.element.hidden = true;
        this.pool.push(label.element);
        return false;
      }
      return true;
    });
    if (!this.active.length) return;

    // Batch layout reads before writes; at most 16 short-lived labels are present.
    const viewportWidth = this.layer.clientWidth;
    const measurements = this.active.map((label) => ({
      label,
      width: label.element.offsetWidth,
      height: label.element.offsetHeight,
    }));
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const gap = 6;
    for (const { label, width, height } of measurements) {
      const age = (time - label.started) / 1200;
      const position = this.project(label.event.x, label.event.y, 0.85 + age * 0.55);
      label.element.style.opacity = position.visible ? String(Math.min(1, (1 - age) * 2)) : '0';
      if (!position.visible) continue;
      const left = Math.max(12, Math.min(viewportWidth - width - 12, position.x - width / 2));
      let top = position.y - height - label.lift;
      // Stack screen-space collisions, not world distances: zoom changes the spacing.
      // Bottom-to-top order means each rectangle needs only one collision check.
      for (const other of placed) {
        if (
          left < other.right + gap &&
          left + width + gap > other.left &&
          top < other.bottom + gap &&
          top + height + gap > other.top
        )
          top = other.top - height - gap;
      }
      // Keep a label in its lane when an older message fades, rather than jumping down.
      label.lift = Math.max(label.lift, position.y - height - top);
      placed.push({ left, top, right: left + width, bottom: top + height });
      placed.sort((a, b) => b.top - a.top);
      label.element.style.transform = `translate(${left}px, ${top}px)`;
    }
  }

  dispose(): void {
    this.layer.remove();
    this.active = [];
    this.pool = [];
  }
}
