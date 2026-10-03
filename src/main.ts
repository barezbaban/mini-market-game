import '../styles/main.css';
import { AccountController } from './auth/AccountController';
import { helpContent } from './game/ui/HelpPanel';
import { AuthClient } from './auth/AuthClient';
import { GAME_CONFIG } from './game/data/gameConfig';
import { CAMERA_ZOOM, clampCameraZoom } from './game/data/cameraConfig';
import { MACHINES, machineDuration } from './game/data/machines';
import { plotCount, PRODUCTS } from './game/data/products';
import {
  playerLevel,
  UPGRADES,
  upgradeAvailable,
  upgradeById,
  upgradeCost,
  requiredPlayerLevel,
  requiredOrders,
  checkoutDuration,
  LEVEL_MILESTONES,
  SHELF_COLUMNS,
  shelfRows,
  xpForLevel,
} from './game/data/upgrades';
import { GameRuntime } from './game/GameRuntime';
import { AudioManager } from './game/managers/AudioManager';
import { GameEngine } from './game/systems/GameEngine';
import { SaveSystem } from './game/systems/SaveSystem';
import { Hud } from './game/ui/Hud';
import { icon, productIcon } from './game/ui/icons';
import { goalsPanel, insightPanel, productionPanel, staffPanel } from './game/ui/BusinessPanels';
import { recommendedUpgrades } from './game/systems/BusinessInsights';
import { RUSH_TIERS, rushRequirement, type RushTier } from './game/systems/RushHourSystem';
import { workerPriority } from './game/systems/validateCareer';
import { mountSettingsExtras } from './game/ui/SettingsExtras';
import type {
  BusinessContract,
  MachineId,
  ProductId,
  ShopStyle,
  UpgradeDefinition,
  UpgradeId,
} from './game/types';

const save = new SaveSystem({
  read: () => localStorage.getItem(GAME_CONFIG.saveKey),
  write: (value) => localStorage.setItem(GAME_CONFIG.saveKey, value),
  clear: () => localStorage.removeItem(GAME_CONFIG.saveKey),
  backup: (value) => localStorage.setItem(`${GAME_CONFIG.saveKey}.backup`, value),
  readBackup: () => localStorage.getItem(`${GAME_CONFIG.saveKey}.backup`),
  backupRecovery: (value) => localStorage.setItem(`${GAME_CONFIG.saveKey}.recovery`, value),
  readRecovery: () => localStorage.getItem(`${GAME_CONFIG.saveKey}.recovery`),
});
const engine = new GameEngine(save.load());
const audio = new AudioManager();
audio.setEnabled(engine.state.soundEnabled);
audio.setVolumes(engine.state.effectsVolume, engine.state.musicVolume);
let paused = false;
let ready = false;
let dialogWasPaused = false;
let managementWasPaused = false;
let managementSessionActive = false;
type ManagementCategory = UpgradeDefinition['category'] | 'goals';
let managementCategory: ManagementCategory = 'store';
let selectedRushTier: RushTier = 'gentle';
let managementMessage = '';
let managementStateKey = '';
let accountWasPaused = false;
const hud = new Hud(document.querySelector('#app')!, {
  account: () => accountController.open(),
  sound: toggleSound,
  pause: () => setPaused(!paused),
  settings: () => showDialog('settings'),
  help: () => showDialog('help'),
  manage: showManagement,
});
let runtime: GameRuntime;
try {
  runtime = new GameRuntime(document.querySelector('#game-canvas')!, {
    engine,
    save,
    audio,
    hud,
    refreshMenus: refreshManagement,
  });
  ready = true;
  document.querySelector('#loading')!.remove();
  hud.setSaved(save.lastError === null);
} catch (error) {
  console.error('The 3D market could not start.', error);
  document.querySelector('#loading')!.innerHTML =
    '<strong>The 3D market needs WebGL 2.</strong><p>Try an updated browser with hardware acceleration enabled. Your saved market is safe.</p><button class="primary-button" id="retry-game">Try again</button>';
  document.querySelector('#retry-game')!.addEventListener('click', () => location.reload());
}

const accountController = new AccountController(
  document.querySelector<HTMLDialogElement>('#account-dialog')!,
  document.querySelector<HTMLButtonElement>('#account-button')!,
  new AuthClient(import.meta.env.VITE_API_URL ?? ''),
  {
    opened: () => {
      accountWasPaused = paused;
      setPaused(true);
    },
    closed: () => {
      if (!accountWasPaused) setPaused(false);
    },
    cloud: {
      snapshot: () => JSON.parse(JSON.stringify(engine.snapshot())) as Record<string, unknown>,
      preview: (text) => {
        const state = save.previewImport(text);
        return `level ${playerLevel(state.xp)}, $${state.money.toLocaleString()}, ${state.totalServed} paid orders`;
      },
      restore: (text) => {
        if (!save.restore(text))
          throw new Error(save.lastError ?? 'Could not restore this backup.');
        resetting = true;
        runtime.setPaused(true);
        location.reload();
      },
    },
  },
);
void accountController.initialize();

function setPaused(value: boolean): void {
  if (!ready) return;
  paused = value;
  runtime.setControlsBlocked(paused);
  runtime.setPaused(paused && engine.state.safePause);
  if (paused) {
    runtime.persist();
  } else {
    runtime.setPaused(false);
    audio.unlock();
    document.querySelector<HTMLElement>('#game-canvas')!.focus({ preventScroll: true });
  }
  hud.setPaused(paused, engine.state.safePause);
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
  const zoomPercent = Math.round(engine.state.cameraZoom * 100);
  dialog.innerHTML =
    `<div class="dialog-heading"><h2>${kind === 'settings' ? 'Make yourself at home.' : 'Small steps. Fresh starts.'}</h2><button class="icon-button" id="dialog-close" aria-label="Close dialog">${icon('close')}</button></div>` +
    (kind === 'help'
      ? '<p>Gold footprint circles show a place to stand. They turn green when you are close enough to collect, stock, or load items.</p>'
      : '') +
    (kind === 'settings'
      ? `<section class="zoom-setting" aria-label="Camera settings"><div class="zoom-heading"><label for="camera-zoom">Camera zoom</label><output id="camera-zoom-value" for="camera-zoom">${zoomPercent}%</output></div><input id="camera-zoom" type="range" min="${CAMERA_ZOOM.min * 100}" max="${CAMERA_ZOOM.max * 100}" step="${CAMERA_ZOOM.step * 100}" value="${zoomPercent}" aria-valuetext="${zoomPercent}% zoom" aria-describedby="camera-zoom-hint"><div class="zoom-scale" aria-hidden="true"><span>Wider view</span><span>Closer view</span></div><div class="zoom-actions"><small id="camera-zoom-hint">Applies immediately and saves on this device.</small><button id="reset-zoom" class="secondary-button" ${engine.state.cameraZoom === CAMERA_ZOOM.default ? 'disabled' : ''}>Reset zoom</button></div></section>`
      : '') +
    (kind === 'help'
      ? helpContent()
      : `<div class="setting-row"><span>Market sounds<small>Original melodies & little rewards</small></span><button id="dialog-sound" class="secondary-button">${engine.state.soundEnabled ? 'Sound on' : 'Sound off'}</button></div><div class="setting-row audio-setting"><label for="effects-volume">Sound effects<small>Pickups, stocking and register chimes</small></label><input id="effects-volume" type="range" min="0" max="100" value="${Math.round(engine.state.effectsVolume * 100)}" aria-label="Sound effects volume"></div><div class="setting-row audio-setting"><label for="music-volume">Background music<small>Cheerful original tune · set to 0 to mute</small></label><input id="music-volume" type="range" min="0" max="100" value="${Math.round(engine.state.musicVolume * 100)}" aria-label="Background music volume"></div><div class="setting-row"><span>Your little business<small>${engine.state.totalServed} customers · $${engine.state.totalEarned} lifetime earned</small></span>${icon('leaf')}</div><div class="setting-row"><span>A fresh beginning<small>Erase this device’s market progress</small></span><button id="reset-button" class="danger-button">Reset game</button></div><p>Your market is saved automatically in this browser. Clearing browser data also clears your save.</p>`);
  dialog.querySelector('#dialog-close')!.addEventListener('click', () => dialog.close());
  if (kind === 'settings')
    mountSettingsExtras(dialog, engine, save, {
      persist: () => runtime.persist(),
      pauseChanged: () => setPaused(paused),
      restoreReady: () => {
        resetting = true;
        runtime.setPaused(true);
        location.reload();
      },
    });
  const zoomSlider = dialog.querySelector<HTMLInputElement>('#camera-zoom');
  const applyZoom = (value: number) => {
    engine.state.cameraZoom = clampCameraZoom(value);
    runtime.world.setZoom(engine.state.cameraZoom);
    const percent = Math.round(engine.state.cameraZoom * 100);
    zoomSlider!.value = String(percent);
    zoomSlider!.setAttribute('aria-valuetext', `${percent}% zoom`);
    dialog.querySelector('#camera-zoom-value')!.textContent = `${percent}%`;
    dialog.querySelector<HTMLButtonElement>('#reset-zoom')!.disabled =
      engine.state.cameraZoom === CAMERA_ZOOM.default;
    runtime.persist();
  };
  zoomSlider?.addEventListener('input', () => applyZoom(Number(zoomSlider.value) / 100));
  dialog.querySelector('#reset-zoom')?.addEventListener('click', () => {
    applyZoom(CAMERA_ZOOM.default);
    zoomSlider!.focus();
  });
  for (const [id, field] of [
    ['effects-volume', 'effectsVolume'],
    ['music-volume', 'musicVolume'],
  ] as const) {
    dialog.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', (event) => {
      engine.state[field] = Number((event.target as HTMLInputElement).value) / 100;
      audio.setVolumes(engine.state.effectsVolume, engine.state.musicVolume);
      runtime.persist();
    });
  }
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
        // Stop background autosaves during navigation so they cannot recreate the deleted save.
        runtime.setPaused(true);
        location.reload();
      } else
        dialog.innerHTML =
          '<h2>Reset unavailable</h2><p>Your browser blocked access to storage. Please check site storage permissions and reload.</p><form method="dialog"><button class="secondary-button">Close</button></form>';
    });
  });
  dialog.showModal();
}

const managementTabs: Array<{
  id: ManagementCategory;
  title: string;
  icon: string;
  subtitle: string;
}> = [
  { id: 'goals', title: 'Goals', icon: 'star', subtitle: 'Build a business at your own pace.' },
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
        : farm.id === 'milk'
          ? 'cows'
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
      result.current = `${shelfRows(level)} rows · ${shelfRows(level) * SHELF_COLUMNS} items`;
      result.next = `${shelfRows(next)} rows · ${shelfRows(next) * SHELF_COLUMNS} items`;
      result.detail =
        'Add one visible row of four spaces to every shelf, including future shelves. Buy extra rows at player levels 3, 10, and 20. Your current stock stays in place.';
      break;
    case 'carts':
      result.current = `${GAME_CONFIG.customerStartCarts + level} carts`;
      result.next = `${GAME_CONFIG.customerStartCarts + next} carts`;
      result.detail =
        'Each purchase adds one cart and space for one more shopper. Grow from 3 to 10 carts, then unlock carts 11–15 at player levels 20, 22, 24, 26, and 28. More carts help marketing turn arrivals into sales.';
      break;
    case 'expansion': {
      const areas = [
        'Original market',
        'Production department',
        'Coffee corner',
        'Carrot garden',
        'Dairy meadow',
      ];
      result.current = areas[level];
      result.next = areas[next];
      result.detail =
        level === 0
          ? 'Open the production department and unlock the option to build a tomato cannery.'
          : level === 1
            ? 'Add the first coffee plant, a bean shelf, and room to build a coffee grinder.'
            : level === 2
              ? 'Open a carrot garden with its first bed and a carrot shelf. Grow up to eight beds.'
              : level === 3
                ? 'Open the dairy meadow with one cow and a milk shelf. Add cows or build the dairy kitchen for cheese.'
                : 'All four departments are open. Keep improving your farms, machines, and staff.';
      break;
    }
    case 'corn':
      result.current = level ? 'Corn unlocked' : 'Not planted';
      result.next = '1 corn plot';
      result.level = level ? 'UNLOCKED' : 'NEW PRODUCT';
      result.detail = 'The first plot grows 2 corn every 5s. Add more with the Corn plots upgrade.';
      break;
    case 'pasteMachine':
    case 'coffeeMachine':
    case 'grillMachine':
    case 'dairyMachine': {
      const machine = MACHINES.find((entry) => entry.upgrade === upgrade.id)!;
      const output =
        upgrade.id === 'pasteMachine'
          ? 'cans'
          : upgrade.id === 'coffeeMachine'
            ? 'bags'
            : upgrade.id === 'grillMachine'
              ? 'grilled corn'
              : 'cheese';
      result.current = level ? `Up to ${2 * level} ${output}` : 'Not built';
      result.next = `Up to ${2 * next} ${output} / batch`;
      result.detail = `${upgrade.id === 'pasteMachine' ? '1 tomato makes 1 can' : upgrade.id === 'coffeeMachine' ? '1 coffee bean makes 1 bag' : upgrade.id === 'grillMachine' ? '1 corn makes 1 grilled corn, sold for $23. Includes its own shelf' : '1 milk bottle makes 1 cheese'}. A batch takes ${(machineDuration(engine.state, machine) / 1000).toFixed(1)}s and starts with available input. Upgrade its limit from 2 to 4, 6, then 8 ingredients.`;
      break;
    }
    case 'machineSpeed':
      result.current = `${(1.2 ** level).toFixed(2)}× production speed`;
      result.next = `${(1.2 ** next).toFixed(2)}× production speed`;
      result.detail =
        'All built and future processors run 20% faster per tier. Batch capacity is upgraded separately. Higher speed tiers unlock at player levels 5, 10 and 20.';
      break;
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
      result.current = level
        ? `${(checkoutDuration(state) / 1000).toFixed(2)}s / customer`
        : 'Not hired';
      result.next = `${(4.5 / 1.25 ** (next - 1)).toFixed(2)}s / customer`;
      result.detail =
        'Your cashier serves customers and keeps their payments in a compact cash pile with no storage limit. Collect it yourself before a thief visits. Each tier after hiring multiplies service speed by 1.25.';
      break;
    case 'secondCashier':
      result.current = level ? '2 staffed checkouts' : '1 checkout';
      result.next = 'Second cashier + cash pile';
      result.detail =
        'Unlock at player level 20 after hiring your first cashier. The second employee shares cashier speed upgrades and serves from the same queue. Each has a separate cash pile with no storage limit; collect both yourself.';
      break;
    case 'customers':
      result.current = level ? `+${level * 20}% arrivals` : 'Not hired';
      result.next = `+${next * 20}% arrivals`;
      result.detail =
        'Increase arrival rate by 20% of the base rate per upgrade. More arrivals need free carts and stocked shelves; only completed sales earn XP. Advanced tiers open at player levels 20, 25, and 30.';
      break;
    case 'accountant':
      result.current = level ? `${level * 2} bonus XP / 5 orders` : 'Not hired';
      result.next = `${next * 2} bonus XP / 5 orders`;
      result.detail =
        'Audits new paid orders every 10 seconds. Every five fulfilled orders earn 2 bonus XP per accountant tier. No sales means no passive XP.';
      break;
    case 'driveThrough':
      result.current = level ? 'Lane open' : 'Not built';
      result.next = 'Cars & bikes enabled';
      result.level = level ? 'OPEN' : 'NEW SERVICE';
      result.detail =
        'Cars and bikes arrive with two to four requested items. Load each item at the drive window, then collect payment.';
      break;
    case 'driveRunner':
      result.current = level ? 'Runner working' : 'Not hired';
      result.next = 'Automatic order loading';
      result.level = level ? 'HIRED' : 'DRIVE-THROUGH STAFF';
      result.detail =
        'This dedicated runner takes only requested products from stocked shelves and loads them into drive-through orders one at a time.';
      break;
    case 'driveCashier':
      result.current = level ? 'Cashier working' : 'Not hired';
      result.next = 'Automatic payment';
      result.level = level ? 'HIRED' : 'DRIVE-THROUGH STAFF';
      result.detail =
        'This cashier takes payment for loaded drive-through orders and keeps it in a compact cash pile with no storage limit. The window keeps serving; collect your money before a thief visits.';
      break;
  }
  return result;
}

function upgradeRequirement(upgrade: UpgradeDefinition): string {
  const requirements = Object.entries(upgrade.requires ?? {})
    .filter(([id, level]) => engine.state.upgrades[id as UpgradeId] < level!)
    .map(([id, level]) => {
      if (id === 'expansion')
        return [
          'the original market',
          'the production department',
          'the coffee corner',
          'the carrot garden',
          'the dairy meadow',
        ][level!];
      if (id === 'helpers') return 'at least one harvest helper';
      if (id === 'driveThrough') return 'the drive-through service';
      return `${upgradeById(id as UpgradeId).name} level ${level}`;
    });
  const level = requiredPlayerLevel(engine.state, upgrade.id);
  if (playerLevel(engine.state.xp) < level) requirements.unshift(`player level ${level}`);
  const orders = requiredOrders(engine.state, upgrade.id);
  if (engine.state.totalServed < orders)
    requirements.push(`${orders} paid orders (${engine.state.totalServed}/${orders})`);
  return requirements.join(' and ');
}

function milestoneReward(id: UpgradeId, tier: number): string {
  if (id === 'carts') return `${GAME_CONFIG.customerStartCarts + tier} carts`;
  if (id === 'shelf')
    return `${shelfRows(tier)} shelf rows (${shelfRows(tier) * SHELF_COLUMNS} items)`;
  if (id === 'inventory') return `${GAME_CONFIG.playerStartCapacity + tier * 4}-item basket`;
  return `${upgradeById(id).name} tier ${tier}`;
}

function progressionOverview(): string {
  const state = engine.state;
  const level = playerLevel(state.xp);
  const next = LEVEL_MILESTONES.find((milestone) => milestone.level > level);
  const remaining = xpForLevel(level + 1) - state.xp;
  const headline = next
    ? `Level ${next.level} unlocks ${next.rewards
        .slice(0, 2)
        .map(({ id, tier }) => milestoneReward(id, tier))
        .join(' · ')}${next.rewards.length > 2 ? ' and more' : ''}`
    : 'All milestone tiers unlocked — finish your upgrades in Manage.';
  return `<section class="progression-overview" aria-label="Player progression"><strong>${headline}</strong><p>${remaining.toLocaleString()} XP to level ${level + 1} · ${state.totalServed.toLocaleString()} customers served</p><p>Every paid order: <b>5 XP for the customer + 2 XP per item.</b> Store and drive-through sales both count. Reaching a level unlocks upgrades to buy with money.</p><details><summary>View level rewards</summary><ol class="milestone-list">${LEVEL_MILESTONES.map((milestone) => `<li class="${milestone.level <= level ? 'unlocked' : ''}"><span>Level ${milestone.level}<small>${milestone.level <= level ? 'Unlocked' : `${Math.max(0, xpForLevel(milestone.level) - state.xp).toLocaleString()} XP away`}</small></span><span>${milestone.rewards.map(({ id, tier }) => milestoneReward(id, tier)).join(' · ')}</span></li>`).join('')}</ol></details></section>`;
}

function renderManagement(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
  const openDetails = new Set(
    [...dialog.querySelectorAll('details[open]')].map(
      (d) => d.querySelector('summary')?.textContent,
    ),
  );
  const previousFocus = dialog.contains(document.activeElement)
    ? document.activeElement?.id
    : undefined;
  const scrollTop = dialog.querySelector('.management-content')?.scrollTop ?? 0;
  const tab = managementTabs.find((entry) => entry.id === managementCategory)!;
  const state = engine.state;
  const recommended = recommendedUpgrades(state);
  const rushCard = `<section class="rush-card" aria-label="Rush hour challenge"><div><strong>Optional rush hour · 90 seconds</strong><p>Pick a challenge that fits your shop. No cash penalty. ${state.safePause ? 'Safe pause freezes challenge timers in menus.' : 'Timers keep running in Manage.'}</p><label class="management-control">Challenge<select id="rush-tier" aria-label="Rush hour difficulty">${RUSH_TIERS.map((t) => `<option value="${t.id}" ${selectedRushTier === t.id ? 'selected' : ''}>${t.name} · ${t.goal} orders · ${t.xp} XP</option>`).join('')}</select></label><small id="management-rush-result"></small></div><button id="start-rush" class="primary-button"></button></section>`;
  dialog.innerHTML = `<div class="management-header"><div><span class="eyebrow">YOUR LITTLE BUSINESS</span><h2>Make room to grow.</h2></div><button class="icon-button" id="management-close" aria-label="Close management">${icon('close')}</button></div>
    <div class="management-summary"><span>${icon('coin', 18)} <strong id="management-money">$${state.money.toLocaleString()}</strong></span><span>${icon('star', 16)} <span id="management-xp"></span></span><span>${state.workers.length} ${state.workers.length === 1 ? 'helper' : 'helpers'} working</span></div>
    <div class="management-tabs" role="tablist" aria-label="Management categories">${managementTabs.map((entry) => `<button id="management-tab-${entry.id}" role="tab" aria-selected="${entry.id === managementCategory}" aria-controls="management-panel" tabindex="${entry.id === managementCategory ? 0 : -1}" data-category="${entry.id}">${icon(entry.icon, 18)}${entry.title}</button>`).join('')}</div>
    <div class="management-content" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${managementCategory}" tabindex="0">${managementCategory === 'goals' ? `${goalsPanel(state)}${rushCard}<details class="future-upgrades"><summary>Player-level roadmap</summary>${progressionOverview()}</details>` : insightPanel(state)}${managementCategory === 'staff' ? staffPanel(state) : ''}${managementCategory === 'machines' ? productionPanel(state) : ''}<p class="management-intro">${tab.subtitle}</p><div class="upgrade-grid">${UPGRADES.filter(
      (upgrade) => upgrade.category === managementCategory,
    )
      .sort(
        (a, b) =>
          Number(upgradeAvailable(state, b.id)) - Number(upgradeAvailable(state, a.id)) ||
          Number(recommended.includes(b.id)) - Number(recommended.includes(a.id)),
      )
      .map((upgrade) => {
        const presentation = upgradePresentation(upgrade);
        const maxed = state.upgrades[upgrade.id] >= upgrade.maxLevel;
        const available = upgradeAvailable(state, upgrade.id);
        const cost = upgradeCost(state, upgrade.id);
        const affordable = state.money >= cost;
        const product = PRODUCTS.find((entry) => entry.id === upgrade.icon);
        const buttonLabel = maxed
          ? 'Fully upgraded'
          : !available
            ? playerLevel(state.xp) < requiredPlayerLevel(state, upgrade.id)
              ? `Player level ${requiredPlayerLevel(state, upgrade.id)}`
              : 'Unlock first'
            : !affordable
              ? `Need $${(cost - state.money).toLocaleString()} more`
              : state.upgrades[upgrade.id] === 0 &&
                  [
                    'cashier',
                    'customers',
                    'accountant',
                    'helpers',
                    'driveRunner',
                    'driveCashier',
                  ].includes(upgrade.id)
                ? `Hire · $${cost.toLocaleString()}`
                : `Buy · $${cost.toLocaleString()}`;
        const card = `<article class="upgrade-card ${maxed ? 'maxed' : ''} ${available ? '' : 'unavailable'}" data-upgrade="${upgrade.id}"><div class="upgrade-card-heading"><span class="upgrade-symbol">${product ? productIcon(product.id) : icon(upgrade.icon, 25)}</span><div><small>${recommended.includes(upgrade.id) ? 'SUGGESTED · ' : ''}${presentation.level}</small><h3>${upgrade.name}</h3></div></div><div class="upgrade-effect"><span>${presentation.current}</span>${maxed ? icon('check', 16) : `${icon('arrow', 16)}<strong>${presentation.next}</strong>`}</div><p>${presentation.detail}</p>${!available && !maxed ? `<div class="upgrade-requirement">${icon('lock', 13)} Requires ${upgradeRequirement(upgrade)}</div>` : ''}<div class="upgrade-purchase"><span class="upgrade-cost">${maxed ? 'All set' : `$${cost.toLocaleString()}`}</span><button id="buy-${upgrade.id}" class="upgrade-buy" data-buy-upgrade="${upgrade.id}" ${maxed || !available || !affordable ? 'disabled' : ''} aria-label="${maxed ? `${upgrade.name}: fully upgraded` : `Buy ${upgrade.name} for $${cost}`}">${buttonLabel}</button></div></article>`;
        return !available && !maxed
          ? `<details class="locked-upgrade"><summary>${upgrade.name}<small>${upgradeRequirement(upgrade)}</small></summary>${card}</details>`
          : card;
      })
      .join(
        '',
      )}</div></div><div id="management-status" class="management-status" role="status" aria-live="polite">${managementMessage || (state.safePause ? 'Safe pause is on. Your market and timers are paused.' : 'Your market keeps running. Theft is protected while menus are open.')}</div>`;
  dialog.querySelectorAll('details').forEach((d) => {
    d.open = openDetails.has(d.querySelector('summary')?.textContent);
  });
  managementStateKey = currentManagementStateKey();
  refreshManagementValues(dialog);
  dialog.querySelector<HTMLElement>('.management-content')!.scrollTop = scrollTop;
  if (previousFocus) {
    const replacement = dialog.querySelector<HTMLButtonElement>(`#${previousFocus}`);
    (replacement && !replacement.disabled
      ? replacement
      : dialog.querySelector<HTMLElement>(`#management-tab-${managementCategory}`)
    )?.focus({ preventScroll: true });
  }
}

function currentManagementStateKey(): string {
  const state = engine.state;
  // Only rebuild upgrade cards when their prices, requirements or affordability change.
  return JSON.stringify([
    state.money,
    playerLevel(state.xp),
    state.totalServed,
    state.workers.length,
    state.upgrades,
    state.career.claimed,
    state.career.contractsCompleted,
    state.career.style,
  ]);
}

function refreshManagementValues(dialog: HTMLDialogElement): void {
  const { rush, xp, totalServed } = engine.state;
  const setText = (selector: string, text: string) => {
    const node = dialog.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  };
  const start = dialog.querySelector<HTMLButtonElement>('#start-rush');
  const requirement = rushRequirement(engine.state, selectedRushTier);
  if (start) start.disabled = rush.remainingMs > 0 || rush.cooldownMs > 0 || Boolean(requirement);
  setText(
    '#start-rush',
    rush.remainingMs
      ? `In progress · ${Math.ceil(rush.remainingMs / 1000)}s · ${rush.completed}/${rush.goal} orders`
      : rush.cooldownMs
        ? `Ready in ${Math.ceil(rush.cooldownMs / 1000)}s`
        : requirement || 'Start rush hour',
  );
  setText(
    '#management-rush-result',
    rush.result === 'won'
      ? `Last rush: completed! +${rush.rewardXp} XP.`
      : rush.result === 'missed'
        ? `Last rush: ${rush.completed}/${rush.goal} orders. Restock and try again.`
        : 'Optional challenge. Stock your shelves before starting.',
  );
  setText('#management-xp', `Level ${playerLevel(xp)} · ${xp.toLocaleString()} XP`);
  setText(
    '.progression-overview > p',
    `${(xpForLevel(playerLevel(xp) + 1) - xp).toLocaleString()} XP to level ${playerLevel(xp) + 1} · ${totalServed.toLocaleString()} customers served`,
  );
  for (const [index, milestone] of LEVEL_MILESTONES.entries())
    setText(
      `.milestone-list > li:nth-child(${index + 1}) small`,
      milestone.level <= playerLevel(xp)
        ? 'Unlocked'
        : `${Math.max(0, xpForLevel(milestone.level) - xp).toLocaleString()} XP away`,
    );
}

function refreshManagement(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
  if (!managementSessionActive || !dialog.open) return;
  // Do not replace a native picker or partially typed target when a sale arrives.
  if (
    dialog.contains(document.activeElement) &&
    document.activeElement?.matches('select, input:not([type="radio"])')
  ) {
    refreshManagementValues(dialog);
    return;
  }
  if (managementStateKey !== currentManagementStateKey()) renderManagement();
  else refreshManagementValues(dialog);
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
  if (target.closest('#start-rush')) {
    if (engine.rush.start(selectedRushTier)) {
      runtime.persist();
      managementWasPaused = false;
      closeManagement();
    }
    return;
  }
  if (target.closest('#management-close')) {
    closeManagement();
    return;
  }
  const tab = target.closest<HTMLButtonElement>('[data-category]');
  if (tab) {
    managementCategory = tab.dataset.category as ManagementCategory;
    managementMessage = '';
    managementDialog.querySelector('.management-content')!.scrollTop = 0;
    renderManagement();
    managementDialog.querySelector<HTMLElement>(`#management-tab-${managementCategory}`)!.focus();
    return;
  }
  const goal = target.closest<HTMLButtonElement>('[data-claim-goal]');
  const contract = target.closest<HTMLButtonElement>('[data-contract]');
  const style = target.closest<HTMLButtonElement>('[data-style]');
  if (goal || contract || style || target.closest('#claim-contract, #cancel-contract')) {
    if (target.closest('button:disabled')) return;
    let changed = false;
    if (goal) changed = engine.career.claimMilestone(goal.dataset.claimGoal!);
    else if (contract)
      changed = engine.career.acceptContract(contract.dataset.contract as BusinessContract['kind']);
    else if (style) changed = engine.career.setStyle(style.dataset.style as ShopStyle);
    else if (target.closest('#claim-contract')) changed = engine.career.claimContract();
    else if (
      confirm('Abandon this optional contract? Progress on it will be cleared; no money is lost.')
    ) {
      engine.career.cancelContract();
      changed = true;
    }
    if (changed) {
      runtime.persist();
      hud.update(engine.state);
      managementMessage = 'Saved. Your next goal is ready when you are.';
    }
    renderManagement();
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
managementDialog.addEventListener('change', (event) => {
  const control = event.target as HTMLInputElement | HTMLSelectElement;
  if (control.id === 'rush-tier') {
    if (RUSH_TIERS.some((t) => t.id === control.value))
      selectedRushTier = control.value as RushTier;
    refreshManagementValues(managementDialog);
    return;
  }
  if (control.dataset.workerPriority) {
    const worker = engine.state.workers.find(
      (w) => w.id === Number(control.dataset.workerPriority),
    );
    if (worker) {
      worker.priority = workerPriority(control.value, engine.state);
      const note = managementDialog.querySelector(`#helper-${worker.id}-focus-note`);
      if (note && control.dataset.focusDescription)
        note.textContent = control.dataset.focusDescription;
    }
  } else if (control.dataset.machinePolicy) {
    const id = control.dataset.machinePolicy as MachineId;
    if (
      MACHINES.some((m) => m.id === id) &&
      ['balanced', 'shelf-first', 'processing-first', 'paused'].includes(control.value)
    )
      engine.state.career.machinePolicies[id] =
        control.value as (typeof engine.state.career.machinePolicies)[MachineId];
  } else if (control.dataset.batchMode) {
    const id = control.dataset.batchMode as MachineId;
    if (MACHINES.some((m) => m.id === id))
      engine.state.career.batchModes[id] = control.value === 'full' ? 'full' : 'quick';
  } else if (control.dataset.stockTarget) {
    const id = control.dataset.stockTarget as ProductId;
    const value = Number(control.value);
    if (PRODUCTS.some((p) => p.id === id) && Number.isFinite(value))
      engine.state.career.stockTargets[id] = Math.max(
        0,
        Math.min(engine.state.shelfCapacities[id], Math.floor(value)),
      );
    control.value = String(engine.state.career.stockTargets[id]);
  } else return;
  runtime.persist();
  managementMessage =
    'Plan saved. Helpers finish their current delivery before following the new priority.';
  const status = managementDialog.querySelector('#management-status');
  if (status) status.textContent = managementMessage;
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
  managementDialog.querySelector('.management-content')!.scrollTop = 0;
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
  if (document.hidden && ready && !resetting) runtime.persist();
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
      // Test fixtures may freeze time explicitly; the real menu buttons only block input.
      setPaused(value: boolean) {
        setPaused(value);
        runtime.setPaused(value);
      },
      get ready() {
        return ready;
      },
    },
  });
}
