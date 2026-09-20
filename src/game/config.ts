import Phaser from 'phaser';
import { GAME_CONFIG } from './data/gameConfig';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-canvas',
  backgroundColor: '#b8ce94',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  input: { activePointers: 3, keyboard: false },
  audio: { noAudio: true },
  fps: { target: 60, forceSetTimeOut: false },
};
