import '../styles/main.css';
import { GAME_CONFIG } from './game/data/gameConfig';
import { MACHINES } from './game/data/machines';
import { plotCount, PRODUCTS } from './game/data/products';
import {
  playerLevel,
  UPGRADES,
  upgradeAvailable,
  upgradeById,
  upgradeCost,
} from './game/data/upgrades';
import { GameRuntime } from './game/GameRuntime';
import { AudioManager } from './game/managers/AudioManager';
import { GameEngine } from './game/systems/GameEngine';
import { SaveSystem } from './game/systems/SaveSystem';
import { Hud } from './game/ui/Hud';
import { icon, productIcon } from './game/ui/icons';
import type { UpgradeDefinition, UpgradeId } from './game/types';

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
let managementWasPaused = false;
let managementSessionActive = false;
let managementCategory: UpgradeDefinition['category'] = 'store';
let managementMessage = '';
const hud = new Hud(document.querySelector('#app')!, {
  sound: toggleSound,
  pause: () => setPaused(!paused),
  settings: () => showDialog('settings'),
  help: () => showDialog('help'),
  manage: showManagement,
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
  if (!ready || document.querySelector('dialog[open]')) return;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  dialogWasPaused = paused;
  setPaused(true);
  dialog.innerHTML =
    `<div class="dialog-heading"><h2>${kind === 'settings' ? 'Make yourself at home.' : 'Small steps. Fresh starts.'}</h2><button class="icon-button" id="dialog-close" aria-label="Close dialog">${icon('close')}</button></div>` +
    (kind === 'help'
      ? `<p>Your farm, your shelves, your growing team.</p><ol><li>Move with <strong>WASD, arrow keys, the joystick, or dragging the world.</strong></li><li>Stand near ripe farm plots to collect produce, then carry it to a matching shelf. Every shelf holds 12 items.</li><li>Take unwanted carried items to the <strong>trash bin</strong> beside the team office. Stay close for one second to empty your basket.</li><li>Stand beside checkout to serve customers and earn money plus 5 XP per sale.</li><li>Open <strong>Manage</strong> to expand the store, add farm plots, build machines, and hire staff. Some upgrades also have purchase pads in the world.</li><li>Carry tomatoes to the cannery or coffee beans to the grinder. Stand close to supply raw produce and collect finished cans or coffee bags when your basket has room.</li><li>Helpers harvest, supply machines, collect finished goods, and restock shelves. Upgrade their baskets and speed to keep things moving.</li></ol><p>The production wing opens first, then the coffee corner, then the carrot garden. Your market saves automatically on this device.</p>`
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

const managementTabs: Array<{
  id: UpgradeDefinition['category'];
  title: string;
  icon: string;
  subtitle: string;
}> = [
  { id: 'store', title: 'Store', icon: 'manage', subtitle: 'Make room for the next good thing.' },
  {
    id: 'farms',
    title: 'Farms',
    icon: 'leaf',
    subtitle: 'Every plot grows its own fresh harvest.',
  },
  {
    id: 'machines',
    title: 'Machines',
    icon: 'machine',
    subtitle: 'Turn fresh ingredients into something more.',
  },
  {
    id: 'staff',
    title: 'Staff',
    icon: 'worker',
    subtitle: 'A little help makes a growing market easier.',
  },
];

function showManagement(): void {
  if (!ready || document.querySelector('dialog[open]')) return;
  managementWasPaused = paused;
  managementSessionActive = true;
  managementMessage = '';
  setPaused(true);
  renderManagement();
  document.querySelector<HTMLDialogElement>('#management-dialog')!.showModal();
}

function upgradePresentation(upgrade: UpgradeDefinition): {
  current: string;
  next: string;
  detail: string;
  level: string;
} {
  const state = engine.state;
  const level = state.upgrades[upgrade.id];
  const next = Math.min(upgrade.maxLevel, level + 1);
  const result = {
    current: `Level ${level}`,
    next: `Level ${next}`,
    detail: upgrade.description,
    level: `LEVEL ${level} / ${upgrade.maxLevel}`,
  };
  const farm = PRODUCTS.find((product) => product.plotUpgrade === upgrade.id);
  if (farm) {
    const plots = plotCount(state, farm.id);
    const unit =
      farm.id === 'egg'
        ? 'nests'
        : farm.id === 'carrot'
          ? 'beds'
          : farm.id === 'corn'
            ? 'plots'
            : 'plants';
    const nextPlots = Math.min(farm.maxPlots, plots + 1);
    result.current = `${plots} ${plots === 1 ? unit.slice(0, -1) : unit}`;
    result.next = `${nextPlots} ${nextPlots === 1 ? unit.slice(0, -1) : unit}`;
    result.level = `${plots} / ${farm.maxPlots} ${unit.toUpperCase()}`;
    result.detail = `Each ${unit.slice(0, -1)} produces ${farm.yieldPerPlot} ${(farm.yieldPerPlot === 1 ? farm.name : farm.plural).toLowerCase()} every ${farm.productionTime / 1000}s. ${farm.maxPlots} maximum.${farm.id === 'carrot' ? ' Each new bed costs 20% more.' : ''}`;
    return result;
  }
  switch (upgrade.id) {
    case 'inventory':
      result.current = `${state.inventoryCapacity} items`;
      result.next = `${GAME_CONFIG.playerStartCapacity + next * 4} items`;
      result.detail =
        'Four more spaces in your own basket. Carry any mix of raw and finished products.';
      break;
    case 'shelf':
      result.current = '12 items per shelf';
      result.next = 'Already included';
      result.level = 'INCLUDED';
      result.detail =
        'Every product shelf holds 12 items. This capacity is included with your market.';
      break;
    case 'expansion': {
      const areas = ['Original market', 'Production wing', 'Coffee corner', 'Carrot garden'];
      result.current = areas[level];
      result.next = areas[next];
      result.detail =
        level === 0
          ? 'Open the production wing and unlock the option to build a tomato cannery.'
          : level === 1
            ? 'Add the first coffee plant, a bean shelf, and room to build a coffee grinder.'
            : level === 2
              ? 'Open a carrot garden with its first bed and a carrot shelf. Grow up to eight beds.'
              : 'All three new areas are open. Keep improving your farms, machines, and staff.';
      break;
    }
    case 'corn':
      result.current = level ? 'Corn unlocked' : 'Not planted';
      result.next = '1 corn plot';
      result.level = level ? 'UNLOCKED' : 'NEW PRODUCT';
      result.detail = 'The first plot grows 2 corn every 5s. Add more with the Corn plots upgrade.';
      break;
    case 'pasteMachine':
    case 'coffeeMachine': {
      const machine = MACHINES.find((entry) => entry.upgrade === upgrade.id)!;
      const output = upgrade.id === 'pasteMachine' ? 'cans' : 'bags';
      result.current = level ? `Up to ${2 * level} ${output}` : 'Not built';
      result.next = `Up to ${2 * next} ${output} / batch`;
      result.detail = `${upgrade.id === 'pasteMachine' ? '1 tomato makes 1 can' : '1 coffee bean makes 1 bag'}. A batch takes ${machine.batchMs / 1000}s and starts with available input. Upgrade its limit from 2 to 4, 6, then 8 ingredients.`;
      break;
    }
    case 'helpers':
      result.current = `${level} ${level === 1 ? 'helper' : 'helpers'}`;
      result.next = `${next} ${next === 1 ? 'helper' : 'helpers'}`;
      result.detail =
        'Helpers harvest crops, feed machines, collect finished goods, and restock shelves automatically. Hire up to three.';
      break;
    case 'helperCapacity':
      result.current = `${GAME_CONFIG.helperCapacities[level]} items each`;
      result.next = `${GAME_CONFIG.helperCapacities[next]} items each`;
      result.level = `LEVEL ${level + 1} / ${upgrade.maxLevel + 1}`;
      result.detail = 'Increase the carrying capacity of every helper: 2 → 3 → 4 → 5 → 6 items.';
      break;
    case 'helperSpeed':
      result.current = `${(1.1 ** level).toFixed(2)}× speed`;
      result.next = `${(1.1 ** next).toFixed(2)}× speed`;
      result.level = `LEVEL ${level + 1} / ${upgrade.maxLevel + 1}`;
      result.detail =
        'Each new level multiplies every helper’s walking speed by 1.10. Ten speed levels in total.';
      break;
    case 'cashier':
      result.current = level ? `${(1 / 1.25 ** (level - 1)).toFixed(2)}s / customer` : 'Not hired';
      result.next = `${(1 / 1.25 ** (next - 1)).toFixed(2)}s / customer`;
      result.detail =
        'Your cashier serves the queue automatically. Each level after hiring multiplies service speed by 1.25.';
      break;
    case 'customers':
      result.current = level ? `+${level * 20}% arrivals` : 'Not hired';
      result.next = `+${next * 20}% arrivals`;
      result.detail =
        'Hire a marketing director, then grow customer arrival rate by 20% of the base rate per level, up to +200%.';
      break;
    case 'accountant':
      result.current = level ? `${level * 5} XP / 10s` : 'Not hired';
      result.next = `${next * 5} XP / 10s`;
      result.detail =
        'Your accountant earns passive player XP while the market is running. Every level adds 5 XP each 10 seconds.';
      break;
  }
  return result;
}

function upgradeRequirement(upgrade: UpgradeDefinition): string {
  return Object.entries(upgrade.requires ?? {})
    .filter(([id, level]) => engine.state.upgrades[id as UpgradeId] < level!)
    .map(([id, level]) => {
      if (id === 'expansion')
        return [
          'the original market',
          'the production wing',
          'the coffee corner',
          'the carrot garden',
        ][level!];
      if (id === 'helpers') return 'at least one harvest helper';
      return `${upgradeById(id as UpgradeId).name} level ${level}`;
    })
    .join(' and ');
}

function renderManagement(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
  const previousFocus = dialog.contains(document.activeElement)
    ? document.activeElement?.id
    : undefined;
  const scrollTop = dialog.querySelector('.management-content')?.scrollTop ?? 0;
  const tab = managementTabs.find((entry) => entry.id === managementCategory)!;
  const state = engine.state;
  dialog.innerHTML = `<div class="management-header"><div><span class="eyebrow">YOUR LITTLE BUSINESS</span><h2>Make room to grow.</h2></div><button class="icon-button" id="management-close" aria-label="Close management">${icon('close')}</button></div>
    <div class="management-summary"><span>${icon('coin', 18)} <strong id="management-money">$${state.money.toLocaleString()}</strong></span><span>${icon('star', 16)} Level ${playerLevel(state.xp)} · ${state.xp.toLocaleString()} XP</span><span>${state.workers.length} ${state.workers.length === 1 ? 'helper' : 'helpers'} working</span></div>
    <div class="management-tabs" role="tablist" aria-label="Management categories">${managementTabs.map((entry) => `<button id="management-tab-${entry.id}" role="tab" aria-selected="${entry.id === managementCategory}" aria-controls="management-panel" tabindex="${entry.id === managementCategory ? 0 : -1}" data-category="${entry.id}">${icon(entry.icon, 18)}${entry.title}</button>`).join('')}</div>
    <div class="management-content" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${managementCategory}" tabindex="0"><p class="management-intro">${tab.subtitle}</p><div class="upgrade-grid">${UPGRADES.filter(
      (upgrade) => upgrade.category === managementCategory,
    )
      .map((upgrade) => {
        const presentation = upgradePresentation(upgrade);
        const included = upgrade.id === 'shelf';
        const maxed = included || state.upgrades[upgrade.id] >= upgrade.maxLevel;
        const available = upgradeAvailable(state, upgrade.id);
        const cost = upgradeCost(state, upgrade.id);
        const affordable = state.money >= cost;
        const product = PRODUCTS.find((entry) => entry.id === upgrade.icon);
        const buttonLabel = maxed
          ? included
            ? 'Included'
            : 'Fully upgraded'
          : !available
            ? 'Unlock first'
            : !affordable
              ? `Need $${(cost - state.money).toLocaleString()} more`
              : state.upgrades[upgrade.id] === 0 &&
                  ['cashier', 'customers', 'accountant', 'helpers'].includes(upgrade.id)
                ? `Hire · $${cost.toLocaleString()}`
                : `Buy · $${cost.toLocaleString()}`;
        return `<article class="upgrade-card ${maxed ? 'maxed' : ''} ${available ? '' : 'unavailable'}" data-upgrade="${upgrade.id}"><div class="upgrade-card-heading"><span class="upgrade-symbol">${product ? productIcon(product.id) : icon(upgrade.icon, 25)}</span><div><small>${presentation.level}</small><h3>${upgrade.name}</h3></div></div><div class="upgrade-effect"><span>${presentation.current}</span>${maxed ? icon('check', 16) : `${icon('arrow', 16)}<strong>${presentation.next}</strong>`}</div><p>${presentation.detail}</p>${!available && !maxed ? `<div class="upgrade-requirement">${icon('lock', 13)} Requires ${upgradeRequirement(upgrade)}</div>` : ''}<div class="upgrade-purchase"><span class="upgrade-cost">${maxed ? 'All set' : `$${cost.toLocaleString()}`}</span><button id="buy-${upgrade.id}" class="upgrade-buy" data-buy-upgrade="${upgrade.id}" ${maxed || !available || !affordable ? 'disabled' : ''} aria-label="${maxed ? `${upgrade.name}: ${included ? 'included' : 'fully upgraded'}` : `Buy ${upgrade.name} for $${cost}`}">${buttonLabel}</button></div></article>`;
      })
      .join(
        '',
      )}</div></div><div id="management-status" class="management-status" role="status" aria-live="polite">${managementMessage || 'Your market is paused while you plan.'}</div>`;
  dialog.querySelector<HTMLElement>('.management-content')!.scrollTop = scrollTop;
  if (previousFocus) {
    const replacement = dialog.querySelector<HTMLButtonElement>(`#${previousFocus}`);
    (replacement && !replacement.disabled
      ? replacement
      : dialog.querySelector<HTMLElement>(`#management-tab-${managementCategory}`)
    )?.focus({ preventScroll: true });
  }
}

const managementDialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
function restoreManagementPause(): void {
  if (!managementSessionActive) return;
  managementSessionActive = false;
  if (!managementWasPaused) setPaused(false);
  else document.querySelector<HTMLButtonElement>('#resume-button')!.focus();
}
function closeManagement(): void {
  managementDialog.close();
  restoreManagementPause();
}
managementDialog.addEventListener('click', (event) => {
  const target = event.target as Element;
  if (target.closest('#management-close')) {
    closeManagement();
    return;
  }
  const tab = target.closest<HTMLButtonElement>('[data-category]');
  if (tab) {
    managementCategory = tab.dataset.category as UpgradeDefinition['category'];
    managementMessage = '';
    renderManagement();
    managementDialog.querySelector<HTMLElement>(`#management-tab-${managementCategory}`)!.focus();
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-buy-upgrade]');
  if (!button || button.disabled) return;
  const id = button.dataset.buyUpgrade as UpgradeId;
  if (!UPGRADES.some((upgrade) => upgrade.id === id)) return;
  const purchased = engine.purchaseUpgrade(id);
  managementMessage = purchased
    ? `${upgradeById(id).name} upgraded. Saved to this device.`
    : 'That upgrade is not available yet.';
  if (purchased) {
    runtime.persist();
    hud.update(engine.state);
    runtime.world.update(engine.state, engine.state.elapsed, 0);
    if (save.lastError)
      managementMessage = `${upgradeById(id).name} upgraded. Saving is unavailable; keep this tab open.`;
    hud.announce(managementMessage);
  }
  renderManagement();
});
managementDialog.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') return;
  const index = managementTabs.findIndex((tab) => tab.id === managementCategory);
  const nextIndex =
    event.key === 'ArrowRight'
      ? (index + 1) % managementTabs.length
      : event.key === 'ArrowLeft'
        ? (index + managementTabs.length - 1) % managementTabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? managementTabs.length - 1
            : -1;
  if (nextIndex < 0) return;
  event.preventDefault();
  managementCategory = managementTabs[nextIndex].id;
  renderManagement();
  managementDialog.querySelector<HTMLElement>(`#management-tab-${managementCategory}`)!.focus();
});
managementDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeManagement();
});
managementDialog.addEventListener('close', restoreManagementPause);

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
