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
      <main id="game-frame" class="game-frame">
          <div id="game-canvas" aria-label="Market and farm game world. Move with WASD, arrow keys, or the touch joystick." role="application" tabindex="0"></div>
          <div class="game-hud">
            <div class="hud-left">
              <div class="money-card" aria-label="Market earnings"><span class="coin" aria-hidden="true">$</span><strong id="money-value">$0</strong></div>
              <span class="game-name">${GAME_CONFIG.title}</span>
            </div>
            <div class="hud-right">
              <div class="basket-card"><div class="basket-heading"><span>${icon('basket', 17)} Basket</span><span id="basket-count">0 / 8</span></div><div id="inventory-items" class="inventory-items"></div></div>
              <nav class="toolbar" aria-label="Game controls">
                <button class="icon-button" id="help-button" aria-label="How to play" title="How to play">${icon('help')}</button>
                <button class="icon-button" id="sound-button" aria-label="Turn sound off" title="Sound on">${icon('sound')}</button>
                <button class="icon-button" id="pause-button" aria-label="Pause game" title="Pause">${icon('pause')}</button>
                <button class="icon-button" id="settings-button" aria-label="Open settings" title="Settings">${icon('settings')}</button>
              </nav>
            </div>
          </div>
          <div class="objective"><span class="objective-spark">${icon('leaf', 21)}</span><div id="objective-text"></div></div>
          <div id="joystick" class="joystick" aria-label="Touch movement joystick"><div class="joystick-knob">${icon('close', 22)}</div></div>
          <div id="pause-overlay" class="pause-overlay" hidden><div><span>${icon('pause', 32)}</span><h2>A little breather.</h2><p>Your market will be right here.</p><button id="resume-button" class="primary-button">Back to the market ${icon('play', 16)}</button></div></div>
          <div id="loading" class="loading"><span class="loading-leaf">${icon('leaf', 36)}</span><strong>Opening the market…</strong></div>
          <pre id="debug-panel" class="debug-panel" hidden></pre>
          <div class="desktop-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move</span><small>Walk close to harvest, stock & serve</small></div>
          <span id="save-label" class="save-label">● Saved on this device</span>
      </main>
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
      ['Your first harvest', 'Head to the tomato patch.'],
      ['Pick something fresh', 'Stand near ripe plants to collect tomatoes.'],
      ['Fill your first shelf', 'Carry tomatoes to the matching shelf.'],
      ['The market is open!', 'Customers collect produce from your shelves.'],
      ['Time to check out', 'Stand on the green spot to serve customers.'],
      ['A little room to grow', 'Stand on an upgrade pad to buy it.'],
    ];
    const hint = hints[Math.min(state.tutorialStep, hints.length - 1)];
    this.hint.innerHTML =
      state.tutorialStep >= 6
        ? `<strong>${state.totalServed} happy customers</strong><span>Keep your shelves full and your market growing.</span>`
        : `<strong>${hint[0]}</strong><span>${hint[1]}</span>`;
    if (nearbyUpgrade) {
      const instruction =
        state.money < nearbyUpgrade.cost
          ? `Need $${nearbyUpgrade.cost - state.money} more`
          : 'Stay on the pad to buy';
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
