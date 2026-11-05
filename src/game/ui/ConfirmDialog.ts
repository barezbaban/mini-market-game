import { getLanguage, html, t } from '../../i18n';

/** Kurdish confirmations include translated buttons instead of browser-language chrome. */
export async function confirmAction(message: string): Promise<boolean> {
  if (getLanguage() === 'en') return window.confirm(message);
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'game-dialog confirmation-dialog';
  dialog.setAttribute('aria-label', t('Confirm your choice'));
  dialog.innerHTML = html(`<h2>Confirm your choice</h2><p class="confirmation-message"></p>
    <div class="dialog-actions"><button type="button" class="secondary-button" data-confirm="no" autofocus>Cancel</button>
    <button type="button" class="primary-button" data-confirm="yes">Confirm</button></div>`);
  // Account data can appear in confirmation text. Never interpret it as markup.
  dialog.querySelector('.confirmation-message')!.textContent = t(message);
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLButtonElement>('[data-confirm]');
      if (action) dialog.close(action.dataset.confirm);
    });
    dialog.addEventListener(
      'close',
      () => {
        const accepted = dialog.returnValue === 'yes';
        dialog.remove();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
          previousFocus.focus({ preventScroll: true });
        resolve(accepted);
      },
      { once: true },
    );
    dialog.showModal();
  });
}
