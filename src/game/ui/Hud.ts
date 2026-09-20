import { GAME_CONFIG } from '../data/gameConfig';
import { PRODUCTS } from '../data/products';
import { UPGRADES } from '../data/upgrades';
import type { GameState } from '../types';
import { icon, productIcon } from './icons';

export interface HudActions {
  sound(): void;
  pause(): void;
  settings(): void;
  help(): void;
}

export class Hud {
  private money: HTMLElement;
  private inventory: HTMLElement;
  private hint: HTMLElement;
  private basketCount: HTMLElement;
  private saveLabel: HTMLElement;
  private soundButton: HTMLButtonElement;
  private pauseButton: HTMLButtonElement;
  private cached = '';

  constructor(root: HTMLElement, actions: HudActions) {
    root.innerHTML = `
      <header class="app-header">
        <a class="brand" href="./" aria-label="Mini Market Manager home">
          <span class="brand-mark">${icon('leaf', 25)}</span>
          <span><strong>${GAME_CONFIG.title}</strong><small>${GAME_CONFIG.subtitle}</small></span>
        </a>
        <span class="header-tag"><span></span> GOOD THINGS GROW HERE</span>
        <div class="toolbar">
          <button class="icon-button" id="help-button" aria-label="How to play" title="How to play">${icon('help')}</button>
          <button class="icon-button" id="sound-button" aria-label="Turn sound off" title="Sound on">${icon('sound')}</button>
          <button class="icon-button" id="pause-button" aria-label="Pause game" title="Pause">${icon('pause')}</button>
          <button class="icon-button" id="settings-button" aria-label="Open settings" title="Settings">${icon('settings')}</button>
        </div>
      </header>
      <main class="play-area">
        <div id="game-frame" class="game-frame">
          <div id="game-canvas" aria-label="Market and farm game world. Move with WASD, arrow keys, or the touch joystick." role="application" tabindex="0"></div>
          <div class="game-hud">
            <div class="money-card"><span class="coin">$</span><span><small>YOUR EARNINGS</small><strong id="money-value">$0</strong></span></div>
            <div class="day-card">${icon('sun', 18)}<span>A FRESH START<small>Your neighborhood market</small></span></div>
            <div class="basket-card"><span class="basket-symbol">${icon('basket', 24)}</span><div><div class="basket-heading">YOUR BASKET <span id="basket-count">0 / 8</span></div><div id="inventory-items" class="inventory-items"></div></div></div>
          </div>
          <div class="objective"><span class="objective-spark">${icon('leaf', 19)}</span><div id="objective-text"></div><span class="auto-badge">AUTO INTERACT</span></div>
          <div id="joystick" class="joystick" aria-label="Touch movement joystick"><div class="joystick-knob">${icon('close', 22)}</div></div>
          <div id="pause-overlay" class="pause-overlay" hidden><div><span>${icon('pause', 32)}</span><h2>A little breather.</h2><p>Your market will be right here.</p><button id="resume-button" class="primary-button">Back to the market ${icon('play', 16)}</button></div></div>
          <div id="loading" class="loading"><span class="loading-leaf">${icon('leaf', 36)}</span><strong>Opening the market…</strong></div>
          <pre id="debug-panel" class="debug-panel" hidden></pre>
        </div>
      </main>
      <footer class="app-footer"><div class="desktop-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>or arrow keys to move</span><i></i><span>Walk close to harvest, stock & serve</span></div><span class="touch-controls">Use the joystick to move · Walk close to interact</span><span id="save-label" class="save-label">● Saved on this device</span></footer>
      <div class="rotate-hint">${icon('sun', 17)} For the best experience, rotate your phone.</div>
      <dialog id="settings-dialog" class="game-dialog"></dialog>
      <div class="sr-only" id="announcements" aria-live="polite" role="status"></div>
    `;
    this.money = root.querySelector('#money-value')!;
    this.inventory = root.querySelector('#inventory-items')!;
    this.hint = root.querySelector('#objective-text')!;
    this.basketCount = root.querySelector('#basket-count')!;
    this.saveLabel = root.querySelector('#save-label')!;
    this.soundButton = root.querySelector('#sound-button')!;
    this.pauseButton = root.querySelector('#pause-button')!;
    this.soundButton.addEventListener('click', actions.sound);
    this.pauseButton.addEventListener('click', actions.pause);
    root.querySelector('#resume-button')!.addEventListener('click', actions.pause);
    root.querySelector('#settings-button')!.addEventListener('click', actions.settings);
    root.querySelector('#help-button')!.addEventListener('click', actions.help);
  }

  update(state: GameState): void {
    const nearbyUpgrade = UPGRADES.find(
      (upgrade) =>
        state.upgrades[upgrade.id] < upgrade.maxLevel &&
        Math.hypot(state.player.x - upgrade.position.x, state.player.y - upgrade.position.y) < 80,
    );
    const key = [
      state.money,
      ...Object.values(state.inventory),
      state.inventoryCapacity,
      state.tutorialStep,
      state.totalServed,
      state.soundEnabled,
      nearbyUpgrade?.id,
    ].join(',');
    if (key === this.cached) return;
    this.cached = key;
    this.money.textContent = `$${state.money.toLocaleString()}`;
    const count = Object.values(state.inventory).reduce((a, b) => a + b, 0);
    this.basketCount.textContent = `${count} / ${state.inventoryCapacity}`;
    this.basketCount.classList.toggle('full', count === state.inventoryCapacity);
    this.inventory.innerHTML = PRODUCTS.map(
      (product) =>
        `<span class="inventory-product ${state.inventory[product.id] ? '' : 'empty'}" title="${product.plural}">${productIcon(product.id)}<b>${state.inventory[product.id]}</b></span>`,
    ).join('');
    const hints = [
      ['Let’s grow something good.', 'Walk down to the tomato patch.'],
      ['Fresh from your farm.', 'Stand near the ripe plants to gather tomatoes.'],
      ['From patch to shelf.', 'Carry your harvest up to the tomato shelf.'],
      ['Open for good things.', 'Customers will pick up stocked produce.'],
      ['Your first happy customer.', 'Stand on the green checkout spot to serve.'],
      ['A little market. Big possibilities.', 'Walk onto a garden upgrade and stay to buy.'],
    ];
    const hint = hints[Math.min(state.tutorialStep, hints.length - 1)];
    this.hint.innerHTML =
      state.tutorialStep >= 6
        ? `<strong>Look at your market grow.</strong><span>${state.totalServed} happy customers · Keep the shelves full and dream a little bigger.</span>`
        : `<strong>${hint[0]}</strong><span>${hint[1]}</span>`;
    if (nearbyUpgrade) {
      const instruction =
        state.money < nearbyUpgrade.cost
          ? `Need $${nearbyUpgrade.cost - state.money} more`
          : 'Stand on the pad and hold to buy';
      this.hint.innerHTML = `<strong>${nearbyUpgrade.name} · $${nearbyUpgrade.cost}</strong><span>${nearbyUpgrade.description} · ${instruction}</span>`;
    }
    this.soundButton.innerHTML = icon(state.soundEnabled ? 'sound' : 'mute');
    this.soundButton.setAttribute(
      'aria-label',
      state.soundEnabled ? 'Turn sound off' : 'Turn sound on',
    );
    this.soundButton.title = state.soundEnabled ? 'Sound on' : 'Sound off';
  }

  setPaused(paused: boolean): void {
    document.querySelector<HTMLElement>('#pause-overlay')!.hidden = !paused;
    this.pauseButton.innerHTML = icon(paused ? 'play' : 'pause');
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  }

  setSaved(success: boolean): void {
    this.saveLabel.textContent = success
      ? '● Saved on this device'
      : '○ Saving unavailable — keep this tab open';
    this.saveLabel.classList.toggle('save-error', !success);
  }

  announce(text: string): void {
    document.querySelector('#announcements')!.textContent = text;
  }
}
