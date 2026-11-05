import { t, html, errorText, getLanguage, isLanguage, storeLanguage } from '../../i18n';
import type { GameEngine } from '../systems/GameEngine';
import type { SaveSystem } from '../systems/SaveSystem';
import { playerLevel } from '../data/upgrades';
import { icon } from './icons';

export function downloadJson(name: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountSettingsExtras(
  dialog: HTMLDialogElement,
  engine: GameEngine,
  save: SaveSystem,
  actions: { persist(): void; pauseChanged(): void; restoreReady(): void },
): void {
  dialog.querySelector('.dialog-heading')!.insertAdjacentHTML(
    'afterend',
    html(`
    <fieldset class="language-setting" aria-describedby="language-hint"><legend>Language</legend>
      <div class="language-choices">
        <button type="button" id="language-en" data-language="en" aria-pressed="${getLanguage() === 'en'}"><span lang="en" dir="ltr" translate="no">English</span>${icon('check', 16)}</button>
        <button type="button" id="language-ckb" data-language="ckb" aria-pressed="${getLanguage() === 'ckb'}"><span lang="ckb" dir="rtl" translate="no">کوردی (سۆرانی)</span>${icon('check', 16)}</button>
        <button type="button" id="language-ar" data-language="ar" aria-pressed="${getLanguage() === 'ar'}"><span lang="ar" dir="rtl" translate="no">العربية</span>${icon('check', 16)}</button>
      </div><small id="language-hint">Choose your language. Your progress is kept.</small>
      <p id="language-status" role="alert" hidden></p>
    </fieldset>`),
  );
  dialog.querySelector('.language-choices')!.addEventListener('click', (event) => {
    const selected = (event.target as Element).closest<HTMLButtonElement>('button')?.dataset
      .language;
    if (!isLanguage(selected)) return;
    const url = new URL(window.location.href);
    const switching = selected !== getLanguage();
    // Never reload over an unsaved market, including when browser storage is blocked.
    if ((switching && !save.save(engine.snapshot())) || !storeLanguage(selected)) {
      const status = dialog.querySelector<HTMLElement>('#language-status')!;
      status.hidden = false;
      status.textContent = t('Could not save your language. Your market is unchanged.');
      return;
    }
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      window.history.replaceState(window.history.state, '', url);
    }
    if (!switching) {
      dialog.querySelector<HTMLElement>('#language-status')!.hidden = true;
      return;
    }
    actions.restoreReady();
  });
  if (save.lastError || save.lastWarning) {
    const warning = document.createElement('p');
    warning.className = 'auth-notice';
    warning.setAttribute('role', 'status');
    warning.textContent = t(
      `${errorText(save.lastError ?? save.lastWarning ?? '', 'Storage is unavailable. Your current game is still open; download a backup before closing it.')} Download your current market before closing this tab.`,
    );
    dialog.append(warning);
  }
  dialog.insertAdjacentHTML(
    'beforeend',
    html(`<section class="comfort-settings"><h3>Play comfortably</h3><label class="setting-row"><span>Low-power mode<small>30 FPS rendering, lower resolution. Game speed is unchanged.</small></span><input type="checkbox" id="low-power" ${engine.state.lowPower ? 'checked' : ''}></label><label class="setting-row"><span>Safe pause<small>Freeze the whole shop and all timers in Pause, Manage and Settings. Off by default; theft is always protected in menus.</small></span><input type="checkbox" id="safe-pause" ${engine.state.safePause ? 'checked' : ''}></label></section>
    <section class="backup-settings"><h3>Protect your market</h3><p>Download a backup before changing devices. Import only replaces this device after you confirm. Your previous save is kept as a recovery copy.</p><div class="backup-actions"><button class="secondary-button" id="export-backup">Download backup</button><label class="secondary-button backup-picker">Choose backup<input id="import-backup" type="file" accept=".json,application/json"></label><button class="secondary-button" id="recover-backup" ${save.previousBackup() ? '' : 'disabled'}>Previous local save</button></div><div id="backup-preview" role="status"></div><details><summary>Playtest report (local only)</summary><p>Export milestones and shop totals for a playtest. Nothing is uploaded automatically.</p><button class="secondary-button" id="export-playtest">Download playtest report</button></details></section>`),
  );
  dialog.querySelector<HTMLInputElement>('#low-power')!.addEventListener('change', (event) => {
    engine.state.lowPower = (event.target as HTMLInputElement).checked;
    actions.persist();
  });
  dialog.querySelector<HTMLInputElement>('#safe-pause')!.addEventListener('change', (event) => {
    engine.state.safePause = (event.target as HTMLInputElement).checked;
    actions.pauseChanged();
    actions.persist();
  });
  dialog
    .querySelector('#export-backup')!
    .addEventListener('click', () =>
      downloadJson('kurdmart-backup.json', save.export(engine.snapshot())),
    );
  const preview = (text: string) => {
    const host = dialog.querySelector<HTMLElement>('#backup-preview')!;
    try {
      const state = save.previewImport(text);
      host.innerHTML = html(
        `<p>Backup: level ${playerLevel(state.xp)} · $${state.money.toLocaleString()} · ${state.totalServed} paid orders. This replaces your current local market.</p><div class="dialog-actions"><button id="confirm-import" class="primary-button">Restore this backup</button><button id="cancel-import" class="secondary-button">Keep current market</button></div>`,
      );
      host.querySelector('#cancel-import')!.addEventListener('click', () => {
        host.replaceChildren();
      });
      host.querySelector('#confirm-import')!.addEventListener('click', () => {
        if (save.restore(text)) actions.restoreReady();
        else host.textContent = errorText(save.lastError ?? 'The backup could not be restored.');
      });
    } catch (error) {
      host.textContent = errorText(
        error instanceof Error ? error.message : 'Could not read backup. Your market is unchanged.',
      );
    }
  };
  dialog
    .querySelector<HTMLInputElement>('#import-backup')!
    .addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) {
        dialog.querySelector('#backup-preview')!.textContent = t(
          'Choose a backup smaller than 2 MB.',
        );
        return;
      }
      try {
        preview(await file.text());
      } catch {
        dialog.querySelector('#backup-preview')!.textContent = t(
          'The file could not be read. Your market is unchanged.',
        );
      }
    });
  dialog.querySelector('#recover-backup')!.addEventListener('click', () => {
    const previous = save.previousBackup();
    if (previous) preview(previous);
  });
  dialog.querySelector('#export-playtest')!.addEventListener('click', () =>
    downloadJson(
      'kurdmart-playtest.json',
      JSON.stringify(
        {
          version: 1,
          elapsedMs: engine.state.elapsed,
          firstActions: engine.state.career.firstActions,
          orders: engine.state.totalServed,
          walkouts: engine.state.totalWalkouts,
          xp: engine.state.xp,
          upgrades: engine.state.upgrades,
          sold: engine.state.career.sold,
          contractsCompleted: engine.state.career.contractsCompleted,
          lowPower: engine.state.lowPower,
        },
        null,
        2,
      ),
    ),
  );
}
