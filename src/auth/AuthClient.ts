export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthSession {
  user: AuthUser | null;
}

export interface CloudSave {
  revision: number;
  mutationId: string;
  state: Record<string, unknown>;
  updatedAt: string;
}

function cloudSave(value: unknown): CloudSave | null {
  if (value === null) return null;
  if (typeof value !== 'object' || !value) throw new AuthError('Invalid cloud response.', 502);
  const save = value as CloudSave;
  if (
    !Number.isSafeInteger(save.revision) ||
    save.revision < 1 ||
    typeof save.mutationId !== 'string' ||
    typeof save.updatedAt !== 'string' ||
    typeof save.state !== 'object' ||
    !save.state ||
    Array.isArray(save.state)
  )
    throw new AuthError('Invalid cloud response.', 502);
  return save;
}

export interface RegisterDetails {
  displayName: string;
  email: string;
  password: string;
}

interface ErrorPayload {
  code?: string;
  message?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'AUTH_REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const normalizedBaseUrl = (value: string): string => value.trim().replace(/\/$/, '');

const authUser = (value: unknown): AuthUser | null => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.email !== 'string' ||
    typeof candidate.displayName !== 'string'
  )
    return null;
  return {
    id: candidate.id,
    email: candidate.email,
    displayName: candidate.displayName,
  };
};

export class AuthClient {
  readonly configured: boolean;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    // Native browser fetch requires Window as its receiver. Calling a stored
    // reference as this.fetcher() otherwise throws "Illegal invocation".
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.configured = this.baseUrl.length > 0;
  }

  async session(): Promise<AuthSession> {
    const payload = await this.request('/api/auth/session', { method: 'GET' });
    return { user: authUser((payload as { user?: unknown }).user) };
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const payload = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const user = authUser((payload as { user?: unknown }).user);
    if (!user)
      throw new AuthError('The server returned an invalid account.', 502, 'INVALID_RESPONSE');
    return user;
  }

  async register(details: RegisterDetails): Promise<AuthUser> {
    const payload = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        displayName: details.displayName.trim(),
        email: details.email.trim().toLowerCase(),
        password: details.password,
      }),
    });
    const user = authUser((payload as { user?: unknown }).user);
    if (!user)
      throw new AuthError('The server returned an invalid account.', 502, 'INVALID_RESPONSE');
    return user;
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
  }

  async readCloudSave(): Promise<CloudSave | null> {
    const payload = await this.request('/api/save', { method: 'GET', cache: 'no-store' });
    return cloudSave((payload as { save?: unknown }).save);
  }

  async writeCloudSave(
    revision: number,
    mutationId: string,
    state: Record<string, unknown>,
  ): Promise<CloudSave> {
    const payload = await this.request('/api/save', {
      method: 'POST',
      body: JSON.stringify({ revision, mutationId, state }),
    });
    const save = cloudSave((payload as { save?: unknown }).save);
    if (!save) throw new AuthError('Missing cloud save response.', 502);
    return save;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    if (!this.configured)
      throw new AuthError('Online accounts are not connected yet.', 0, 'AUTH_NOT_CONFIGURED');
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch {
      throw new AuthError(
        'The account service is unavailable. Try again soon.',
        0,
        'NETWORK_ERROR',
      );
    }
    const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
    if (!response.ok) {
      const generic = path.endsWith('/login')
        ? 'Email or password is incorrect.'
        : path.endsWith('/register')
          ? 'We could not create that account.'
          : 'The account request could not be completed.';
      const safeMessage =
        path.endsWith('/login') || path.endsWith('/register')
          ? generic
          : payload.message || generic;
      throw new AuthError(safeMessage, response.status, payload.code);
    }
    return payload;
  }
}
