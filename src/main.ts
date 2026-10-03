import '../styles/main.css';
import { AccountController } from './auth/AccountController';
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
import type { UpgradeDefinition, UpgradeId } from './game/types';

const save = new SaveSystem({
  read: () => localStorage.getItem(GAME_CONFIG.saveKey),
  write: (value) => localStorage.setItem(GAME_CONFIG.saveKey, value),
  clear: () => localStorage.removeItem(GAME_CONFIG.saveKey),
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
let managementCategory: UpgradeDefinition['category'] = 'store';
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
  },
);
void accountController.initialize();

function setPaused(value: boolean): void {
  if (!ready) return;
  paused = value;
  runtime.setControlsBlocked(paused);
  if (paused) {
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
      ? `<p>Your farm, your shelves, your growing team.</p><ol><li>Your compact shop has two shelf rows, checkouts on the right, and a wide glass entrance at the front. Farms sit in a three-column yard, with processors between the shop and fields. Departments open within this footprint instead of extending sideways.</li><li>Try <strong>Manage → Start rush hour</strong>: serve 8 orders in 90 seconds for 100 bonus XP. Timers keep running in Pause and Manage. Hiding or closing the browser tab suspends the market. Small faces appear only for an empty shelf, after 30 seconds in the payment queue, or briefly after a completed purchase. Customers leave after two minutes of waiting; serve them before they leave.</li><li>Use <strong>Settings</strong> for separate sound-effect and music volume. On touch screens, drag the world or joystick to walk and hold Sprint with your other thumb. Stand in the gold circles to move items automatically; no tiny item dragging is needed.</li><li>Build a <strong>corn grill</strong> in the processing row outside to sell grilled corn. Equipment speed upgrades accelerate every processor.</li><li>Move with <strong>WASD, arrow keys, the joystick, or dragging the world.</strong> Hold <strong>Shift or Sprint</strong> while moving for a short burst. Release and let stamina recover.</li><li>Stand near ripe farm plots to collect produce, then carry it to a matching shelf. Shelves start with 3 rows and 12 spaces. Buy extra rows in Manage at player levels 3, 10, and 20 to reach 24 spaces.</li><li>Customers take a cart outside, walk through the sliding entrance, and show what they need in a thought cloud. Their selected products appear inside the cart.</li><li>Your store starts with three carts. Each cart upgrade adds one cart. Grow to 10, then unlock five more at player levels 20, 22, 24, 26, and 28.</li><li>Take unwanted carried items to the <strong>trash bin</strong> beside the team office. Stay close for one second to empty your basket.</li><li>Stand beside checkout to serve customers. Sales earn 5 XP per customer and 2 XP per item, but <strong>cash stays in the pile</strong>. Walk into its gold circle to collect it. Only collected money can be spent. Step away before collecting another batch; standing there will not bank new payments.</li><li>Cash piles have <strong>no storage limit</strong>, and registers keep selling while money waits. The display stays small; its label shows the amount. Collect regularly because neglected cash can be stolen. At player level <strong>20</strong>, buy a second staffed checkout in Manage after hiring your first cashier. It has its own cash pile and shares cashier speed upgrades.</li><li>After <strong>three minutes</strong> of unattended cash, a thief may arrive. A warning gives you time to collect or intercept them. Bring the thief inside your visible <strong>net circle</strong> to catch them automatically and recover stolen cash. A hired helper will come to guard them; otherwise your net holds them. Police walk in and escort them out. Escaped cash is lost.</li><li>Buy the <strong>drive-through service</strong> in Manage. Bring the requested items to the drive window one at a time, then stay to process payment. Its separate cash pile has no storage limit and must still be collected by you.</li><li>The drive-through runner loads requested stock from shelves. The separate drive-through cashier processes completed payments and stacks the cash. Neither works until hired; neither banks money for you.</li><li>Open <strong>Manage</strong> to expand the store, add farm plots, build machines, hire staff, and purchase every upgrade. The level roadmap shows future unlocks; reaching a level makes upgrades available to buy, not free.</li><li>Carry tomatoes to the cannery, coffee beans to the grinder, or milk to the dairy kitchen. Stand close to supply ingredients and collect finished products when your basket has room.</li><li>Helpers harvest, supply machines, collect finished goods, and restock shelves. Upgrade their baskets and speed to keep things moving.</li></ol><p>The production department opens first, then the coffee corner, carrot garden, and dairy meadow. Your market saves automatically on this device, including stacked cash and any active thief encounter. Theft timers also keep running in menus. Hidden tabs and closed games do not advance them.</p>`
      : `<div class="setting-row"><span>Market sounds<small>Original melodies & little rewards</small></span><button id="dialog-sound" class="secondary-button">${engine.state.soundEnabled ? 'Sound on' : 'Sound off'}</button></div><div class="setting-row audio-setting"><label for="effects-volume">Sound effects<small>Pickups, stocking and register chimes</small></label><input id="effects-volume" type="range" min="0" max="100" value="${Math.round(engine.state.effectsVolume * 100)}" aria-label="Sound effects volume"></div><div class="setting-row audio-setting"><label for="music-volume">Background music<small>Cheerful original tune · set to 0 to mute</small></label><input id="music-volume" type="range" min="0" max="100" value="${Math.round(engine.state.musicVolume * 100)}" aria-label="Background music volume"></div><div class="setting-row"><span>Your little business<small>${engine.state.totalServed} customers · $${engine.state.totalEarned} lifetime earned</small></span>${icon('leaf')}</div><div class="setting-row"><span>A fresh beginning<small>Erase this device’s market progress</small></span><button id="reset-button" class="danger-button">Reset game</button></div><p>Your market is saved automatically in this browser. Clearing browser data also clears your save.</p>`);
  dialog.querySelector('#dialog-close')!.addEventListener('click', () => dialog.close());
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
      result.current = level ? `${(1 / 1.25 ** (level - 1)).toFixed(2)}s / customer` : 'Not hired';
      result.next = `${(1 / 1.25 ** (next - 1)).toFixed(2)}s / customer`;
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
      result.current = level ? `${level * 5} XP / 10s` : 'Not hired';
      result.next = `${next * 5} XP / 10s`;
      result.detail =
        'Your accountant earns passive player XP while the market is running. Every level adds 5 XP each 10 seconds.';
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
    ? `Level ${next.level} unlocks ${next.rewards.map(({ id, tier }) => milestoneReward(id, tier)).join(' · ')}`
    : 'All milestone tiers unlocked — finish your upgrades in Manage.';
  return `<section class="progression-overview" aria-label="Player progression"><strong>${headline}</strong><p>${remaining.toLocaleString()} XP to level ${level + 1} · ${state.totalServed.toLocaleString()} customers served</p><p>Every paid order: <b>5 XP for the customer + 2 XP per item.</b> Store and drive-through sales both count. Reaching a level unlocks upgrades to buy with money.</p><details><summary>View level rewards</summary><ol class="milestone-list">${LEVEL_MILESTONES.map((milestone) => `<li class="${milestone.level <= level ? 'unlocked' : ''}"><span>Level ${milestone.level}<small>${milestone.level <= level ? 'Unlocked' : `${Math.max(0, xpForLevel(milestone.level) - state.xp).toLocaleString()} XP away`}</small></span><span>${milestone.rewards.map(({ id, tier }) => milestoneReward(id, tier)).join(' · ')}</span></li>`).join('')}</ol></details></section>`;
}

function renderManagement(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#management-dialog')!;
  const rewardsOpen = dialog.querySelector('details')?.open ?? false;
  const previousFocus = dialog.contains(document.activeElement)
    ? document.activeElement?.id
    : undefined;
  const scrollTop = dialog.querySelector('.management-content')?.scrollTop ?? 0;
  const tab = managementTabs.find((entry) => entry.id === managementCategory)!;
  const state = engine.state;
  const rushCard = `<section class="rush-card" aria-label="Rush hour challenge"><div><strong>Rush hour · 90 seconds</strong><p>Serve 8 store or drive-through orders for 100 bonus XP. Double customer arrivals, limited by your carts. No cash penalty if time runs out. Timers keep running while you manage.</p><small id="management-rush-result"></small></div><button id="start-rush" class="primary-button"></button></section>`;
  dialog.innerHTML = `<div class="management-header"><div><span class="eyebrow">YOUR LITTLE BUSINESS</span><h2>Make room to grow.</h2></div><button class="icon-button" id="management-close" aria-label="Close management">${icon('close')}</button></div>
    <div class="management-summary"><span>${icon('coin', 18)} <strong id="management-money">$${state.money.toLocaleString()}</strong></span><span>${icon('star', 16)} <span id="management-xp"></span></span><span>${state.workers.length} ${state.workers.length === 1 ? 'helper' : 'helpers'} working</span></div>
    <div class="management-tabs" role="tablist" aria-label="Management categories">${managementTabs.map((entry) => `<button id="management-tab-${entry.id}" role="tab" aria-selected="${entry.id === managementCategory}" aria-controls="management-panel" tabindex="${entry.id === managementCategory ? 0 : -1}" data-category="${entry.id}">${icon(entry.icon, 18)}${entry.title}</button>`).join('')}</div>
    <div class="management-content" id="management-panel" role="tabpanel" aria-labelledby="management-tab-${managementCategory}" tabindex="0">${progressionOverview()}${rushCard}<p class="management-intro">${tab.subtitle}</p><div class="upgrade-grid">${UPGRADES.filter(
      (upgrade) => upgrade.category === managementCategory,
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
        return `<article class="upgrade-card ${maxed ? 'maxed' : ''} ${available ? '' : 'unavailable'}" data-upgrade="${upgrade.id}"><div class="upgrade-card-heading"><span class="upgrade-symbol">${product ? productIcon(product.id) : icon(upgrade.icon, 25)}</span><div><small>${presentation.level}</small><h3>${upgrade.name}</h3></div></div><div class="upgrade-effect"><span>${presentation.current}</span>${maxed ? icon('check', 16) : `${icon('arrow', 16)}<strong>${presentation.next}</strong>`}</div><p>${presentation.detail}</p>${!available && !maxed ? `<div class="upgrade-requirement">${icon('lock', 13)} Requires ${upgradeRequirement(upgrade)}</div>` : ''}<div class="upgrade-purchase"><span class="upgrade-cost">${maxed ? 'All set' : `$${cost.toLocaleString()}`}</span><button id="buy-${upgrade.id}" class="upgrade-buy" data-buy-upgrade="${upgrade.id}" ${maxed || !available || !affordable ? 'disabled' : ''} aria-label="${maxed ? `${upgrade.name}: fully upgraded` : `Buy ${upgrade.name} for $${cost}`}">${buttonLabel}</button></div></article>`;
      })
      .join(
        '',
      )}</div></div><div id="management-status" class="management-status" role="status" aria-live="polite">${managementMessage || 'Your market keeps running while you plan. Only player controls are paused.'}</div>`;
  dialog.querySelector('details')!.open = rewardsOpen;
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
  return JSON.stringify([state.money, playerLevel(state.xp), state.workers.length, state.upgrades]);
}

function refreshManagementValues(dialog: HTMLDialogElement): void {
  const { rush, xp, totalServed } = engine.state;
  const setText = (selector: string, text: string) => {
    const node = dialog.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  };
  const start = dialog.querySelector<HTMLButtonElement>('#start-rush')!;
  start.disabled = rush.remainingMs > 0 || rush.cooldownMs > 0;
  setText(
    '#start-rush',
    rush.remainingMs
      ? `In progress · ${Math.ceil(rush.remainingMs / 1000)}s · ${rush.completed}/8 orders`
      : rush.cooldownMs
        ? `Ready in ${Math.ceil(rush.cooldownMs / 1000)}s`
        : 'Start rush hour',
  );
  setText(
    '#management-rush-result',
    rush.result === 'won'
      ? 'Last rush: completed! +100 XP.'
      : rush.result === 'missed'
        ? `Last rush: ${rush.completed}/8 orders. Restock and try again.`
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
    if (engine.rush.start()) {
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
