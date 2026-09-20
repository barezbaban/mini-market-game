import Phaser from 'phaser';
import type { GameEvent } from '../types';

export class FloatingText {
  private pool: Phaser.GameObjects.Text[] = [];
  constructor(private scene: Phaser.Scene) {}

  show(event: GameEvent): void {
    const label =
      this.pool.pop() ??
      this.scene.add
        .text(0, 0, '', {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          stroke: '#fff9ea',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(10000);
    label
      .setText(event.text)
      .setPosition(event.x, event.y - 48)
      .setAlpha(1)
      .setVisible(true);
    label.setColor(event.type === 'money' || event.type === 'upgrade' ? '#2c7855' : '#654c37');
    this.scene.tweens.add({
      targets: label,
      y: event.y - 94,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.Out',
      onComplete: () => {
        label.setVisible(false);
        this.pool.push(label);
      },
    });
  }
}
