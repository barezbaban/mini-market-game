import { PRODUCTS } from '../data/products';
import { GAME_CONFIG } from '../data/gameConfig';
import { CASH_POINTS, uncollectedCash } from '../data/cashPoints';
import { playerLevel, xpForLevel } from '../data/upgrades';
import type { GameState } from '../types';
import { icon, productIcon } from './icons';

export interface HudActions {
  account(): void;
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
              <div class="money-card" aria-label="Collected money available to spend"><span class="coin" aria-hidden="true">$</span><strong id="money-value">$0</strong></div>
              <div class="level-card" title="Earn XP by serving customers and hiring an accountant"><span id="player-level">LV 1</span><div><span id="xp-label">0 / 100 XP</span><div class="xp-track" role="progressbar" aria-label="Player level progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="xp-fill"></span></div></div></div>
              <button class="manage-button" id="manage-button" aria-label="Manage market">${icon('manage', 18)} <span>Manage</span></button>
              <span id="cash-ready" class="cash-ready" hidden></span>
            </div>
            <div class="hud-right">
              <div class="basket-card"><button class="basket-heading" id="inventory-toggle" aria-label="Show basket contents" aria-expanded="false" aria-controls="inventory-detail"><span>${icon('basket', 17)} Basket</span><span id="basket-count">0 / 8</span>${icon('chevron', 12)}</button><div id="inventory-items" class="inventory-items"></div><div id="inventory-detail" class="inventory-detail" hidden></div></div>
              <nav class="toolbar" aria-label="Game controls">
                <button class="icon-button" id="account-button" aria-label="Open player account" title="Player account">${icon('account')}</button>
                <button class="icon-button" id="help-button" aria-label="How to play" title="How to play">${icon('help')}</button>
                <button class="icon-button" id="sound-button" aria-label="Turn sound off" title="Sound on">${icon('sound')}</button>
                <button class="icon-button" id="pause-button" aria-label="Pause game" title="Pause">${icon('pause')}</button>
                <button class="icon-button" id="settings-button" aria-label="Open settings" title="Settings">${icon('settings')}</button>
              </nav>
            </div>
          </div>
          <div class="objective"><span class="objective-spark">${icon('leaf', 21)}</span><div id="objective-text"></div></div>
          <div id="security-banner" class="security-banner" role="status" aria-live="polite" hidden></div>
          <button id="sprint-button" class="sprint-button" aria-label="Hold to sprint" title="Hold Shift or this button to sprint"><span>Sprint</span><small>Hold / Shift</small><span class="sprint-track"><span id="sprint-energy"></span></span></button>
          <div id="joystick" class="joystick" aria-label="Touch movement joystick"><div class="joystick-knob">${icon('close', 22)}</div></div>
          <div id="pause-overlay" class="pause-overlay" hidden><div><span>${icon('pause', 32)}</span><h2>A little breather.</h2><p>Your market will be right here.</p><button id="resume-button" class="primary-button">Back to the market ${icon('play', 16)}</button></div></div>
          <div id="loading" class="loading"><span class="loading-leaf">${icon('leaf', 36)}</span><strong>Opening the market…</strong></div>
          <pre id="debug-panel" class="debug-panel" hidden></pre>
          <div class="desktop-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move</span><small>Walk close to harvest, stock & serve</small></div>
          <span id="save-label" class="save-label">● Saved on this device</span>
      </main>
      <dialog id="settings-dialog" class="game-dialog"></dialog>
      <dialog id="account-dialog" class="game-dialog account-dialog" aria-label="Player account"></dialog>
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
    root.querySelector('#account-button')!.addEventListener('click', actions.account);
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
    const pending = uncollectedCash(state);
    const cashReady = document.querySelector<HTMLElement>('#cash-ready')!;
    cashReady.hidden = pending === 0;
    cashReady.textContent = `Uncollected: $${pending.toLocaleString()}`;
    document.querySelector<HTMLElement>('#sprint-energy')!.style.width =
      `${Math.round(state.sprintEnergy * 100)}%`;
    document.querySelector('#sprint-button')!.classList.toggle('exhausted', state.sprintExhausted);
    const banner = document.querySelector<HTMLElement>('#security-banner')!;
    const thief = state.security.thief;
    const blocked = CASH_POINTS.filter(({ id }) => state.cashStacks[id].blocked);
    const chase = Boolean(thief && ['APPROACHING', 'STEALING', 'FLEEING'].includes(thief.phase));
    document.querySelector('#game-frame')!.classList.toggle('chasing', chase);
    let securityText = '';
    if (thief) {
      const distance = Math.round(
        Math.hypot(state.player.x - thief.x, state.player.y - thief.y) / 100,
      );
      const direction =
        thief.x < state.player.x - 40
          ? 'west'
          : thief.x > state.player.x + 40
            ? 'east'
            : thief.y < state.player.y
              ? 'north'
              : 'south';
      if (thief.phase === 'APPROACHING')
        securityText = `Thief approaching ${CASH_POINTS.find(({ id }) => id === thief.target)!.name}! ${distance}m ${direction}. Collect the cash or catch them in your net circle.`;
      if (thief.phase === 'STEALING')
        securityText = `Thief stealing! ${Math.max(0, Math.ceil((GAME_CONFIG.thiefStealTime - thief.elapsed) / 1000))}s left. Sprint into net range — Shift or hold Sprint.`;
      if (thief.phase === 'FLEEING')
        securityText = `Thief fleeing${thief.stolen ? ` with $${thief.stolen}` : ''}! ${distance}m ${direction}. Sprint into net range to catch them.`;
      if (thief.phase === 'CAUGHT')
        securityText = state.security.guardId
          ? 'Cash safe! A helper is guarding the netted thief. Police are on their way.'
          : 'Cash safe! Your net holds the thief until police arrive.';
      if (thief.phase === 'ESCORTED')
        securityText = 'Police are escorting the thief out. Your helper is back at work.';
    } else if (blocked.length)
      securityText = `${blocked.map(({ name }) => name).join(' & ')} closed: cash pile full. Walk to the cash to reopen.`;
    else if (
      CASH_POINTS.some(
        ({ id }) => state.cashStacks[id].unattendedMs >= GAME_CONFIG.thiefDelay - 30000,
      )
    )
      securityText = 'Cash has been unattended a long time. Collect it before a thief visits.';
    banner.hidden = !securityText;
    if (banner.textContent !== securityText) banner.textContent = securityText;
    const nearTrash =
      Math.hypot(state.player.x - GAME_CONFIG.trash.x, state.player.y - GAME_CONFIG.trash.y) < 85;
    const nearDriveThrough =
      state.upgrades.driveThrough > 0 &&
      Math.hypot(
        state.player.x - GAME_CONFIG.driveThroughPlayerSpot.x,
        state.player.y - GAME_CONFIG.driveThroughPlayerSpot.y,
      ) < 85;
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
      nearTrash,
      nearDriveThrough,
      pending,
      ...CASH_POINTS.map(({ id }) => state.cashStacks[id].blocked),
      state.driveThroughOrders
        .map((order) => `${order.id}:${order.state}:${Object.values(order.delivered).join('.')}`)
        .join('|'),
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
      [
        'Collect your earnings',
        'Walk to the cash pile beside checkout. Only collected cash can be spent.',
      ],
    ];
    const hint = hints[Math.min(state.tutorialStep, hints.length - 1)];
    this.hint.innerHTML =
      state.tutorialStep >= 6
        ? `<strong>${state.totalServed} happy customers</strong><span>Manage your farms, machines and growing team.</span>`
        : `<strong>${hint[0]}</strong><span>${hint[1]}</span>`;
    if (nearTrash)
      this.hint.innerHTML = count
        ? `<strong>Trash bin · ${count} item${count === 1 ? '' : 's'}</strong><span>Stay close for 1 second to discard everything.</span>`
        : '<strong>Trash bin · basket empty</strong><span>Carry unwanted items here to discard them.</span>';
    if (nearDriveThrough) {
      const order = state.driveThroughOrders.find((entry) => entry.state !== 'LEAVING');
      if (!order)
        this.hint.innerHTML =
          '<strong>Drive-through is ready</strong><span>The next car or bike is on its way.</span>';
      else if (order.state === 'ARRIVING')
        this.hint.innerHTML =
          '<strong>Vehicle approaching</strong><span>Wait for it to stop at the pickup window.</span>';
      else if (['READY_TO_PAY', 'PAYING'].includes(order.state))
        this.hint.innerHTML = state.upgrades.driveCashier
          ? '<strong>Drive-through payment</strong><span>Your cashier stacks the cash. Collect it at the separate cash pile.</span>'
          : '<strong>Drive-through payment ready</strong><span>Serve here, then walk to the cash pile to collect.</span>';
      else {
        const remaining = PRODUCTS.filter(({ id }) => order.requested[id] > order.delivered[id])
          .map(({ id, name }) => `${order.requested[id] - order.delivered[id]} ${name}`)
          .join(' · ');
        this.hint.innerHTML = state.upgrades.driveRunner
          ? `<strong>Drive-through order</strong><span>${remaining || 'Loaded'} · Your runner is working.</span>`
          : `<strong>Drive-through order</strong><span>Bring ${remaining || 'the last item'} here from your basket.</span>`;
      }
      if (state.cashStacks.drive.blocked)
        this.hint.innerHTML =
          '<strong>Drive-through closed</strong><span>Walk to its cash pile to collect the money and reopen.</span>';
    }
    if (pending && state.tutorialStep >= 6 && !nearDriveThrough && !nearTrash)
      this.hint.innerHTML = `<strong>$${pending.toLocaleString()} waiting to collect</strong><span>Walk up to a cash pile. Step away before collecting another batch.</span>`;
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
