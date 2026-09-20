import { PRODUCTS } from '../data/products';
import { playerLevel, UPGRADES, upgradeAvailable, upgradeCost, xpForLevel } from '../data/upgrades';
import type { GameState } from '../types';
import { icon, productIcon } from './icons';

export interface HudActions {
  sound(): void;
  pause(): void;
  settings(): void;
  help(): void;
  manage(): void;
}

export class Hud {
  private money: HTMLElement;
  private inventory: HTMLElement;
  private hint: HTMLElement;
  private basketCount: HTMLElement;
  private saveLabel: HTMLElement;
  private soundButton: HTMLButtonElement;
  private pauseButton: HTMLButtonElement;
  private levelLabel: HTMLElement;
  private xpLabel: HTMLElement;
  private xpFill: HTMLElement;
  private inventoryDetail: HTMLElement;
  private cached = '';

  constructor(root: HTMLElement, actions: HudActions) {
    root.innerHTML = `
      <main id="game-frame" class="game-frame">
          <div id="game-canvas" aria-label="Market and farm game world. Move with WASD, arrow keys, or the touch joystick." role="application" tabindex="0"></div>
          <div class="game-hud">
            <div class="hud-left">
              <div class="money-card" aria-label="Market earnings"><span class="coin" aria-hidden="true">$</span><strong id="money-value">$0</strong></div>
              <div class="level-card" title="Earn XP by serving customers and hiring an accountant"><span id="player-level">LV 1</span><div><span id="xp-label">0 / 100 XP</span><div class="xp-track" role="progressbar" aria-label="Player level progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="xp-fill"></span></div></div></div>
              <button class="manage-button" id="manage-button" aria-label="Manage market">${icon('manage', 18)} <span>Manage</span></button>
            </div>
            <div class="hud-right">
              <div class="basket-card"><button class="basket-heading" id="inventory-toggle" aria-label="Show basket contents" aria-expanded="false" aria-controls="inventory-detail"><span>${icon('basket', 17)} Basket</span><span id="basket-count">0 / 8</span>${icon('chevron', 12)}</button><div id="inventory-items" class="inventory-items"></div><div id="inventory-detail" class="inventory-detail" hidden></div></div>
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
      <dialog id="management-dialog" class="game-dialog management-dialog" aria-label="Manage market"></dialog>
      <div class="sr-only" id="announcements" aria-live="polite" role="status"></div>
    `;
    this.money = root.querySelector('#money-value')!;
    this.inventory = root.querySelector('#inventory-items')!;
    this.hint = root.querySelector('#objective-text')!;
    this.basketCount = root.querySelector('#basket-count')!;
    this.saveLabel = root.querySelector('#save-label')!;
    this.soundButton = root.querySelector('#sound-button')!;
    this.pauseButton = root.querySelector('#pause-button')!;
    this.levelLabel = root.querySelector('#player-level')!;
    this.xpLabel = root.querySelector('#xp-label')!;
    this.xpFill = root.querySelector('#xp-fill')!;
    this.inventoryDetail = root.querySelector('#inventory-detail')!;
    this.soundButton.addEventListener('click', actions.sound);
    this.pauseButton.addEventListener('click', actions.pause);
    root.querySelector('#resume-button')!.addEventListener('click', actions.pause);
    root.querySelector('#settings-button')!.addEventListener('click', actions.settings);
    root.querySelector('#help-button')!.addEventListener('click', actions.help);
    root.querySelector('#manage-button')!.addEventListener('click', actions.manage);
    const inventoryToggle = root.querySelector<HTMLButtonElement>('#inventory-toggle')!;
    inventoryToggle.addEventListener('click', () => {
      this.inventoryDetail.hidden = !this.inventoryDetail.hidden;
      inventoryToggle.setAttribute('aria-expanded', String(!this.inventoryDetail.hidden));
      inventoryToggle.setAttribute(
        'aria-label',
        this.inventoryDetail.hidden ? 'Show basket contents' : 'Hide basket contents',
      );
      root.querySelector<HTMLElement>('#game-canvas')!.focus({ preventScroll: true });
    });
  }

  update(state: GameState): void {
    const nearbyUpgrade = UPGRADES.find(
      (upgrade) =>
        upgrade.inWorld &&
        upgradeAvailable(state, upgrade.id) &&
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
      state.xp,
      ...Object.values(state.upgrades),
      state.unlockedProducts.join(':'),
      nearbyUpgrade?.id,
    ].join(',');
    if (key === this.cached) return;
    this.cached = key;
    this.money.textContent = `$${state.money.toLocaleString()}`;
    const level = playerLevel(state.xp);
    const levelXp = state.xp - xpForLevel(level);
    const nextXp = xpForLevel(level + 1) - xpForLevel(level);
    this.levelLabel.textContent = `LV ${level}`;
    this.xpLabel.textContent = `${levelXp.toLocaleString()} / ${nextXp.toLocaleString()} XP`;
    const xpPercent = Math.min(100, Math.round((levelXp / nextXp) * 100));
    this.xpFill.style.width = `${xpPercent}%`;
    this.xpFill.parentElement!.setAttribute('aria-valuenow', String(xpPercent));
    this.xpFill.parentElement!.setAttribute(
      'aria-valuetext',
      `Level ${level}, ${levelXp} of ${nextXp} XP to next level`,
    );
    const count = Object.values(state.inventory).reduce((a, b) => a + b, 0);
    this.basketCount.textContent = `${count} / ${state.inventoryCapacity}`;
    this.basketCount.classList.toggle('full', count === state.inventoryCapacity);
    const sortedProducts = [...PRODUCTS].sort(
      (a, b) =>
        Number(state.inventory[b.id] > 0) - Number(state.inventory[a.id] > 0) ||
        Number(state.unlockedProducts.includes(b.id)) -
          Number(state.unlockedProducts.includes(a.id)),
    );
    const visibleProducts = sortedProducts.slice(0, 3);
    this.inventory.innerHTML =
      visibleProducts
        .map(
          (product) =>
            `<span class="inventory-product ${state.inventory[product.id] ? '' : 'empty'}" title="${product.plural}">${productIcon(product.id)}<b>${state.inventory[product.id]}</b></span>`,
        )
        .join('') +
      (sortedProducts.slice(3).some((product) => state.inventory[product.id] > 0)
        ? '<span class="inventory-extra" title="Open basket to see all products">+ more</span>'
        : '');
    this.inventoryDetail.innerHTML = `<strong>Everything in your basket</strong>${PRODUCTS.map((product) => `<div class="inventory-detail-row ${state.unlockedProducts.includes(product.id) ? '' : 'locked'}">${productIcon(product.id)}<span>${product.plural}${state.unlockedProducts.includes(product.id) ? '' : '<small>Not unlocked yet</small>'}</span><b>${state.inventory[product.id]}</b></div>`).join('')}`;
    const hints = [
      ['Your first harvest', 'Head to the tomato patch.'],
      ['Pick something fresh', 'Stand near ripe plants to collect tomatoes.'],
      ['Fill your first shelf', 'Carry tomatoes to the matching shelf.'],
      ['The market is open!', 'Customers collect produce from your shelves.'],
      ['Time to check out', 'Stand on the green spot to serve customers.'],
      ['A little room to grow', 'Open Manage to add farms, machines and staff.'],
    ];
    const hint = hints[Math.min(state.tutorialStep, hints.length - 1)];
    this.hint.innerHTML =
      state.tutorialStep >= 6
        ? `<strong>${state.totalServed} happy customers</strong><span>Manage your farms, machines and growing team.</span>`
        : `<strong>${hint[0]}</strong><span>${hint[1]}</span>`;
    if (nearbyUpgrade) {
      const cost = upgradeCost(state, nearbyUpgrade.id);
      const instruction =
        state.money < cost
          ? `Need $${(cost - state.money).toLocaleString()} more`
          : 'Stay on the pad to buy';
      this.hint.innerHTML = `<strong>${nearbyUpgrade.name} · $${cost.toLocaleString()}</strong><span>${instruction} · Or open Manage for details.</span>`;
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
