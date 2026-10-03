import { AuthClient, AuthError, type AuthUser } from './AuthClient';
import { icon } from '../game/ui/icons';
import { mountCloudSavePanel, type CloudSaveActions } from './CloudSavePanel';

type Mode = 'login' | 'register' | 'account' | 'unavailable';

interface AccountLifecycle {
  opened(): void;
  closed(): void;
  cloud?: CloudSaveActions;
}

const messageFor = (error: unknown): string =>
  error instanceof AuthError ? error.message : 'Something went wrong. Please try again.';

export class AccountController {
  private user: AuthUser | null = null;
  private mode: Mode = 'login';
  private busy = false;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly button: HTMLButtonElement,
    private readonly client: AuthClient,
    private readonly lifecycle: AccountLifecycle,
  ) {
    this.button.addEventListener('click', () => this.open());
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.dialog.addEventListener('close', () => this.lifecycle.closed());
    this.updateButton();
  }

  async initialize(): Promise<void> {
    if (!this.client.configured) return;
    try {
      this.user = (await this.client.session()).user;
      this.updateButton();
      // Guest play is a first-class path; do not interrupt the first harvest.
    } catch {
      this.mode = 'unavailable';
      this.updateButton();
    }
  }

  open(): void {
    if (this.dialog.open) return;
    this.mode = this.user ? 'account' : this.client.configured ? 'login' : 'unavailable';
    this.render();
    this.lifecycle.opened();
    this.dialog.showModal();
  }

  private close(): void {
    if (!this.busy) this.dialog.close();
  }

  private updateButton(): void {
    const label = this.user ? `Account: ${this.user.displayName}` : 'Open player account';
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
    this.button.classList.toggle('signed-in', Boolean(this.user));
  }

  private render(message = ''): void {
    if (this.mode === 'unavailable') {
      this.dialog.innerHTML = `
        <div class="auth-brand">${icon('account', 27)}<span>KurdMart account</span></div>
        <h2>Keep your market with you.</h2>
        <p>Account screens are ready, but the secure account server still needs to be connected. You can keep playing as a guest on this device.</p>
        <div class="auth-notice" role="status">Online login will switch on after a hosting provider and API URL are approved.</div>
        <button class="primary-button auth-wide" id="auth-guest">Continue as guest</button>`;
      this.dialog.querySelector('#auth-guest')!.addEventListener('click', () => this.close());
      return;
    }
    if (this.mode === 'account' && this.user) {
      this.dialog.innerHTML = `
        <div class="dialog-heading"><div class="auth-brand">${icon('account', 25)}<span>Player account</span></div><button class="icon-button" id="auth-close" aria-label="Close account">${icon('close')}</button></div>
        <div class="account-card"><span class="account-avatar"></span><div><strong id="account-name"></strong><small id="account-email"></small></div></div>
        <div id="cloud-panel"></div><p class="auth-message" id="account-message" role="status"></p>
        <button class="secondary-button auth-wide" id="auth-logout">Sign out</button>`;
      this.dialog.querySelector('.account-avatar')!.textContent = this.user.displayName
        .slice(0, 1)
        .toUpperCase();
      this.dialog.querySelector('#account-message')!.textContent = message;
      if (this.lifecycle.cloud)
        mountCloudSavePanel(
          this.dialog.querySelector('#cloud-panel')!,
          this.client,
          this.lifecycle.cloud,
        );
      this.dialog.querySelector('#account-name')!.textContent = this.user.displayName;
      this.dialog.querySelector('#account-email')!.textContent = this.user.email;
      this.dialog.querySelector('#auth-close')!.addEventListener('click', () => this.close());
      this.dialog
        .querySelector('#auth-logout')!
        .addEventListener('click', () => void this.logout());
      return;
    }
    const registering = this.mode === 'register';
    this.dialog.innerHTML = `
      <div class="auth-brand">${icon('account', 27)}<span>KurdMart account</span></div>
      <h2>${registering ? 'Create your player account.' : 'Welcome back.'}</h2>
      <p>${registering ? 'An account lets you keep a manual cloud backup. Guest play is always available.' : 'Sign in to manage your cloud backup. Your local market stays unchanged.'}</p>
      <div class="auth-tabs" role="tablist" aria-label="Account access">
        <button role="tab" id="auth-login-tab" aria-selected="${!registering}">Sign in</button>
        <button role="tab" id="auth-register-tab" aria-selected="${registering}">Create account</button>
      </div>
      <form id="auth-form" class="auth-form">
        ${registering ? '<label>Player name<input name="displayName" autocomplete="nickname" minlength="2" maxlength="24" required placeholder="Your market name"></label>' : ''}
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label>
        <label>Password<input name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" ${registering ? 'minlength="15"' : ''} maxlength="128" required placeholder="${registering ? '15 characters or more' : 'Your password'}"></label>
        ${registering ? '<small class="auth-help">Use a memorable passphrase of at least 15 characters. Spaces are welcome.</small>' : ''}
        <div id="auth-message" class="auth-message" role="alert" ${message ? '' : 'hidden'}></div>
        <button class="primary-button auth-wide" type="submit">${registering ? 'Create account' : 'Sign in'}</button>
      </form>
      <button class="auth-guest-link" id="auth-guest">Play as guest on this device</button>`;
    const status = this.dialog.querySelector<HTMLElement>('#auth-message')!;
    status.textContent = message;
    this.dialog.querySelector('#auth-login-tab')!.addEventListener('click', () => {
      this.mode = 'login';
      this.render();
    });
    this.dialog.querySelector('#auth-register-tab')!.addEventListener('click', () => {
      this.mode = 'register';
      this.render();
    });
    this.dialog.querySelector('#auth-guest')!.addEventListener('click', () => this.close());
    this.dialog
      .querySelector<HTMLFormElement>('#auth-form')!
      .addEventListener('submit', (event) => {
        event.preventDefault();
        void this.submit(event.currentTarget as HTMLFormElement);
      });
  }

  private async submit(form: HTMLFormElement): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true;
    submit.textContent = this.mode === 'register' ? 'Creating…' : 'Signing in…';
    const values = new FormData(form);
    try {
      this.user =
        this.mode === 'register'
          ? await this.client.register({
              displayName: String(values.get('displayName') ?? ''),
              email: String(values.get('email') ?? ''),
              password: String(values.get('password') ?? ''),
            })
          : await this.client.login(
              String(values.get('email') ?? ''),
              String(values.get('password') ?? ''),
            );
      form.reset();
      this.mode = 'account';
      this.updateButton();
      this.render();
    } catch (error) {
      this.render(messageFor(error));
    } finally {
      this.busy = false;
    }
  }

  private async logout(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.client.logout();
      this.user = null;
      this.mode = 'login';
      this.updateButton();
      this.render('You are signed out. Your guest save remains on this device.');
    } catch (error) {
      this.render(messageFor(error));
    } finally {
      this.busy = false;
    }
  }
}
