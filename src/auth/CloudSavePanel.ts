import { html, t, errorText, getLanguage } from '../i18n';
import { confirmAction } from '../game/ui/ConfirmDialog';
import { AuthClient, AuthError, type CloudSave } from './AuthClient';

export interface CloudSaveActions {
  snapshot(): Record<string, unknown>;
  preview(text: string): string;
  restore(text: string): void;
}

/** Explicit, revision-checked backups. Never replace local progress on sign-in. */
export function mountCloudSavePanel(
  host: HTMLElement,
  client: AuthClient,
  actions: CloudSaveActions,
): void {
  host.innerHTML = html(
    `<h3>Cloud backup</h3><p>Keep playing offline. Upload and restore are manual, so signing in never replaces this device’s market.</p><p role="status" id="cloud-status">Check the saved market before choosing what to keep.</p><div class="backup-actions"><button class="secondary-button" id="cloud-refresh">Check cloud</button><button class="secondary-button" id="cloud-upload" disabled>Upload this market</button><button class="secondary-button" id="cloud-restore" disabled>Restore cloud market</button></div>`,
  );
  const status = host.querySelector<HTMLElement>('#cloud-status')!;
  const refresh = host.querySelector<HTMLButtonElement>('#cloud-refresh')!;
  const upload = host.querySelector<HTMLButtonElement>('#cloud-upload')!;
  const restore = host.querySelector<HTMLButtonElement>('#cloud-restore')!;
  let remote: CloudSave | null = null;
  let checked = false;
  let pending: { revision: number; mutationId: string; state: Record<string, unknown> } | null =
    null;
  const controls = (busy: boolean) => {
    refresh.disabled = busy;
    upload.disabled = busy || !checked;
    restore.disabled = busy || !remote || Boolean(pending);
    upload.textContent = t(pending ? 'Retry same upload' : 'Upload this market');
  };
  const summary = () =>
    remote
      ? // Not all browsers ship a Sorani date locale. Numeric day/month/year and a
        // 24-hour clock avoid falling back to English AM/PM; t() handles the digits.
        `Cloud revision ${remote.revision}: ${actions.preview(JSON.stringify(remote.state))}. Saved ${new Date(remote.updatedAt).toLocaleString(getLanguage() === 'ckb' ? 'en-GB' : undefined, getLanguage() === 'ckb' ? { hour12: false } : undefined)}.`
      : 'No cloud backup yet. This device’s market is unchanged.';
  refresh.addEventListener('click', async () => {
    if (
      pending &&
      !(await confirmAction(
        'An upload response was lost. Checking cloud discards the retry, not your local market. Continue?',
      ))
    )
      return;
    controls(true);
    try {
      const result = await client.readCloudSave();
      // Validate before offering restore; malformed remote data cannot replace a local save.
      if (result) actions.preview(JSON.stringify(result.state));
      remote = result;
      checked = true;
      pending = null;
      status.textContent = t(summary());
    } catch (error) {
      checked = false;
      remote = null;
      status.textContent = errorText(
        error instanceof Error ? error.message : 'Cloud unavailable. Local progress is safe.',
      );
    } finally {
      controls(false);
    }
  });
  upload.addEventListener('click', async () => {
    if (!pending) {
      if (
        remote &&
        !(await confirmAction(`${summary()} Replace it with this device’s current market?`))
      )
        return;
      pending = {
        revision: remote?.revision ?? 0,
        mutationId: crypto.randomUUID(),
        state: actions.snapshot(),
      };
    }
    controls(true);
    try {
      remote = await client.writeCloudSave(pending.revision, pending.mutationId, pending.state);
      pending = null;
      status.textContent = t(`Uploaded safely. ${summary()}`);
    } catch (error) {
      if (error instanceof AuthError && error.status === 409) {
        pending = null;
        checked = false;
        remote = null;
        status.textContent = t(
          'Another device changed the cloud market. Nothing was overwritten. Check cloud and review it before trying again.',
        );
      } else {
        status.textContent = t(
          `${errorText(error instanceof Error ? error.message : 'Upload failed.')} Local progress is safe. Retry sends the same snapshot only once.`,
        );
      }
    } finally {
      controls(false);
    }
  });
  restore.addEventListener('click', async () => {
    if (
      !remote ||
      !(await confirmAction(
        `${summary()} Replace this device’s market? Your current local save will be kept as a recovery copy.`,
      ))
    )
      return;
    try {
      actions.restore(JSON.stringify(remote.state));
    } catch (error) {
      status.textContent = errorText(
        error instanceof Error ? error.message : 'Restore failed. Local progress is unchanged.',
      );
    }
  });
}
