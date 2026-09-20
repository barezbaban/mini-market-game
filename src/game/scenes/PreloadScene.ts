import Phaser from 'phaser';

/** Place future image/audio loading here. Initial assets are drawn locally by the renderer. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }
  create(): void {
    this.scene.start('GameScene');
  }
}
