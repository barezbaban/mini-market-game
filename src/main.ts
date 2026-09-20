import '../styles/main.css';
import { GAME_CONFIG } from './game/data/gameConfig';
import { GameRuntime } from './game/GameRuntime';
import { AudioManager } from './game/managers/AudioManager';
import { GameEngine } from './game/systems/GameEngine';
import { SaveSystem } from './game/systems/SaveSystem';
import { Hud } from './game/ui/Hud';
import { icon } from './game/ui/icons';

const save = new SaveSystem({
  read: () => localStorage.getItem(GAME_CONFIG.saveKey),
  write: (value) => localStorage.setItem(GAME_CONFIG.saveKey, value),
  clear: () => localStorage.removeItem(GAME_CONFIG.saveKey),
});
const engine = new GameEngine(save.load());
const audio = new AudioManager();
audio.setEnabled(engine.state.soundEnabled);
let paused = false;
let ready = false;
let dialogWasPaused = false;
const hud = new Hud(document.querySelector('#app')!, {
  sound: toggleSound,
  pause: () => setPaused(!paused),
  settings: () => showDialog('settings'),
  help: () => showDialog('help'),
});
let runtime: GameRuntime;
try {
  runtime = new GameRuntime(document.querySelector('#game-canvas')!, { engine, save, audio, hud });
  ready = true;
  document.querySelector('#loading')!.remove();
  hud.setSaved(save.lastError === null);
} catch (error) {
  console.error('The 3D market could not start.', error);
  document.querySelector('#loading')!.innerHTML =
    '<strong>The 3D market needs WebGL 2.</strong><p>Try an updated browser with hardware acceleration enabled. Your saved market is safe.</p><button class="primary-button" id="retry-game">Try again</button>';
  document.querySelector('#retry-game')!.addEventListener('click', () => location.reload());
}

function setPaused(value: boolean): void {
  if (!ready) return;
  paused = value;
  if (paused) {
    runtime.setPaused(true);
    runtime.persist();
  } else {
    runtime.setPaused(false);
    audio.unlock();
    document.querySelector<HTMLElement>('#game-canvas')!.focus({ preventScroll: true });
  }
  hud.setPaused(paused);
}

function toggleSound(): void {
  if (!ready) return;
  audio.unlock();
  engine.state.soundEnabled = !engine.state.soundEnabled;
  audio.setEnabled(engine.state.soundEnabled);
  hud.update(engine.state);
  runtime.persist();
  if (!document.querySelector('dialog[open]'))
    document.querySelector<HTMLElement>('#game-canvas')!.focus({ preventScroll: true });
}

function showDialog(kind: 'settings' | 'help'): void {
  if (!ready) return;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  dialogWasPaused = paused;
  setPaused(true);
  dialog.innerHTML =
    `<div class="dialog-heading"><h2>${kind === 'settings' ? 'Make yourself at home.' : 'Small steps. Fresh starts.'}</h2><button class="icon-button" id="dialog-close" aria-label="Close dialog">${icon('close')}</button></div>` +
    (kind === 'help'
      ? `<p>You’re the grower, the shopkeeper, and everyone’s favorite neighbor.</p><ol><li>Move with <strong>WASD, arrow keys, or the touch joystick.</strong></li><li>Stand near a farm patch to collect ripe produce.</li><li>Carry it to the matching shelf to restock.</li><li>Stand on the green spot beside checkout to serve waiting customers.</li><li>Walk onto an upgrade in the right-hand garden and hold for a moment to purchase.</li></ol><p>Everything happens automatically when you’re close enough. Your progress saves on this device.</p>`
      : `<div class="setting-row"><span>Market sounds<small>Original melodies & little rewards</small></span><button id="dialog-sound" class="secondary-button">${engine.state.soundEnabled ? 'Sound on' : 'Sound off'}</button></div><div class="setting-row"><span>Your little business<small>${engine.state.totalServed} customers · $${engine.state.totalEarned} lifetime earned</small></span>${icon('leaf')}</div><div class="setting-row"><span>A fresh beginning<small>Erase this device’s market progress</small></span><button id="reset-button" class="danger-button">Reset game</button></div><p>Your market is saved automatically in this browser. Clearing browser data also clears your save.</p>`);
  dialog.querySelector('#dialog-close')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#dialog-sound')?.addEventListener('click', () => {
    toggleSound();
    dialog.querySelector('#dialog-sound')!.textContent = engine.state.soundEnabled
      ? 'Sound on'
      : 'Sound off';
  });
  dialog.querySelector('#reset-button')?.addEventListener('click', () => {
    dialog.innerHTML = `<div class="dialog-heading"><h2>Start fresh?</h2></div><p>This will erase your money, upgrades, and farm progress on this device. This cannot be undone.</p><div class="dialog-actions"><button id="cancel-reset" class="secondary-button">Keep my market</button><button id="confirm-reset" class="danger-button">Yes, reset game</button></div>`;
    dialog.querySelector('#cancel-reset')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#confirm-reset')!.addEventListener('click', () => {
      if (save.reset()) {
        resetting = true;
        location.reload();
      } else
        dialog.innerHTML =
          '<h2>Reset unavailable</h2><p>Your browser blocked access to storage. Please check site storage permissions and reload.</p><form method="dialog"><button class="secondary-button">Close</button></form>';
    });
  });
  dialog.showModal();
}

document.querySelector<HTMLDialogElement>('#settings-dialog')!.addEventListener('close', () => {
  if (!dialogWasPaused) setPaused(false);
});
let resetting = false;
window.addEventListener('pagehide', () => {
  if (ready && !resetting) runtime.persist();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready && !resetting) setPaused(true);
});
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', (event) => {
  audio.unlock();
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setPaused(!paused);
});

if (import.meta.hot) import.meta.hot.dispose(() => runtime?.dispose());

// Explicitly opt-in inspection surface for reproducible development and browser tests.
if (new URLSearchParams(location.search).get('debug') === 'true') {
  Object.assign(window, {
    __MARKET__: {
      engine,
      save,
      get world() {
        return runtime?.world;
      },
      setPaused,
      get ready() {
        return ready;
      },
    },
  });
}
