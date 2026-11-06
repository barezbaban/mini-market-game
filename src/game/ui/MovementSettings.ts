import { html, t } from '../../i18n';
import {
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  WALK_SPEED,
  clampWalkSpeed,
  keyLabel,
  validBinding,
  sprintDuration,
  type ControlAction,
} from '../data/movement';
import { upgradeCost, upgradeById } from '../data/upgrades';
import type { GameEngine } from '../systems/GameEngine';

export function mountMovementSettings(
  dialog: HTMLDialogElement,
  engine: GameEngine,
  persist: () => void,
): void {
  const section = document.createElement('section');
  section.className = 'movement-settings';
  section.innerHTML = html(`<h3>Movement and controls</h3>
    <p>Farms are on the left, machines on the right. Use the clear middle path for delivery. Stop on a harvest circle to collect.</p>
    <div class="movement-speed"><label for="walk-speed">Walking speed</label><output id="walk-speed-value"></output>
    <input id="walk-speed" type="range" min="100" max="135" step="5" value="${Math.round(engine.state.walkSpeed * 100)}"></div>
    <small>Normal to 35% faster. Applies to keyboard and touch controls.</small>
    <div class="sprint-upgrade"><div><h4>Sprint endurance</h4><p id="sprint-duration-value"></p><small>30 upgrades, each adds half a second of sprint time</small></div><button type="button" class="primary-button" id="upgrade-sprint"></button></div>
    <h4>Keyboard controls</h4><p>Choose a key button, then press a new key. Escape cancels. Each action has two keys.</p>
    <div class="key-binding-list"></div><button type="button" class="secondary-button" id="reset-controls">Reset movement settings</button>
    <p class="movement-feedback" role="status" aria-live="polite"></p>`);
  dialog.querySelector('.comfort-settings')!.after(section);
  const status = section.querySelector<HTMLElement>('.movement-feedback')!;
  const buttons = section.querySelector<HTMLElement>('.key-binding-list')!;
  const names: Record<ControlAction, string> = {
    up: 'Move up',
    down: 'Move down',
    left: 'Move left',
    right: 'Move right',
    sprint: 'Sprint',
  };
  let pending: { action: ControlAction; slot: number } | undefined;
  function renderBindings() {
    buttons.innerHTML = CONTROL_ACTIONS.map(
      (action) =>
        `<div class="key-binding-row"><span>${t(names[action])}</span><div>${engine.state.controls[action].map((code, slot) => `<button type="button" class="key-binding" data-action="${action}" data-slot="${slot}" aria-label="${t(names[action])}: ${t(keyLabel(code))}"><kbd>${t(keyLabel(code))}</kbd></button>`).join('')}</div></div>`,
    ).join('');
  }
  function renderSprint() {
    const level = engine.state.upgrades.sprint;
    const max = upgradeById('sprint').maxLevel;
    section.querySelector('#sprint-duration-value')!.textContent = t(
      `${t('Level')} ${level}/${max} · ${sprintDuration(engine.state) / 1000} ${t('seconds')}`,
    );
    const buy = section.querySelector<HTMLButtonElement>('#upgrade-sprint')!;
    buy.disabled = level >= max;
    buy.textContent =
      level >= max
        ? t('Fully upgraded')
        : t(`${t('Upgrade')} · $${upgradeCost(engine.state, 'sprint').toLocaleString()}`);
  }
  function renderSpeed() {
    const percentage = Math.round(engine.state.walkSpeed * 100);
    section.querySelector('#walk-speed-value')!.textContent = t(`${percentage}%`);
    section.querySelector<HTMLInputElement>('#walk-speed')!.value = String(percentage);
  }
  section.querySelector('#walk-speed')!.addEventListener('input', (event) => {
    engine.state.walkSpeed = clampWalkSpeed(Number((event.target as HTMLInputElement).value) / 100);
    renderSpeed();
    persist();
  });
  section.querySelector('#upgrade-sprint')!.addEventListener('click', () => {
    status.textContent = t(
      engine.purchaseUpgrade('sprint') ? 'Sprint upgraded.' : 'Not enough cash for this upgrade.',
    );
    renderSprint();
    persist();
  });
  buttons.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!button) return;
    pending = { action: button.dataset.action as ControlAction, slot: Number(button.dataset.slot) };
    renderBindings();
    const active = buttons.querySelector<HTMLButtonElement>(
      `[data-action="${pending.action}"][data-slot="${pending.slot}"]`,
    )!;
    active.classList.add('recording');
    active.textContent = t('Press a key…');
    active.focus();
    status.textContent = t('Press a new key. Escape cancels.');
  });
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (!pending) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === 'Escape') {
        pending = undefined;
        renderBindings();
        status.textContent = t('Key change cancelled.');
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || !validBinding(event.code)) {
        status.textContent = t(
          'Choose a letter, number, arrow, Shift, Space or another single key.',
        );
        return;
      }
      if (
        CONTROL_ACTIONS.some((action) =>
          engine.state.controls[action].some(
            (code, slot) =>
              code === event.code && (action !== pending!.action || slot !== pending!.slot),
          ),
        )
      ) {
        status.textContent = t('That key is already assigned. Choose another key.');
        return;
      }
      const { action, slot } = pending;
      engine.state.controls[action][slot] = event.code;
      pending = undefined;
      renderBindings();
      persist();
      status.textContent = t('Controls saved.');
      buttons
        .querySelector<HTMLButtonElement>(`[data-action="${action}"][data-slot="${slot}"]`)!
        .focus();
    },
    { signal: controllerForDialog(dialog).signal },
  );
  section.querySelector('#reset-controls')!.addEventListener('click', () => {
    pending = undefined;
    engine.state.controls = structuredClone(DEFAULT_BINDINGS);
    engine.state.walkSpeed = WALK_SPEED.default;
    renderBindings();
    renderSpeed();
    persist();
    status.textContent = t('Movement settings restored. Sprint upgrades are kept.');
  });
  renderBindings();
  renderSpeed();
  renderSprint();
}

// Settings are rebuilt on every opening; old listeners must never capture another dialog's keys.
const controllers = new WeakMap<HTMLDialogElement, AbortController>();
function controllerForDialog(dialog: HTMLDialogElement): AbortController {
  controllers.get(dialog)?.abort();
  const controller = new AbortController();
  controllers.set(dialog, controller);
  dialog.addEventListener('close', () => controller.abort(), {
    once: true,
    signal: controller.signal,
  });
  return controller;
}
