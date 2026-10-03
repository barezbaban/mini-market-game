import { describe, expect, it, vi } from 'vitest';
import { AuthClient, AuthError } from '../src/auth/AuthClient';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('AuthClient', () => {
  it('uses revisioned cookie-authenticated cloud requests and exposes conflicts without retrying blindly', async () => {
    const state = { version: 2, money: 20 };
    const saved = {
      revision: 1,
      mutationId: 'test-mutation',
      state,
      updatedAt: '2026-10-01T10:00:00Z',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ save: null }))
      .mockResolvedValueOnce(json({ save: saved }))
      .mockResolvedValueOnce(json({ code: 'SAVE_CONFLICT', message: 'Review cloud first.' }, 409));
    const client = new AuthClient('https://api.example.com', fetcher);
    await expect(client.readCloudSave()).resolves.toBeNull();
    await expect(client.writeCloudSave(0, saved.mutationId, state)).resolves.toEqual(saved);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/save',
      expect.objectContaining({
        credentials: 'include',
        body: JSON.stringify({ revision: 0, mutationId: saved.mutationId, state }),
      }),
    );
    await expect(client.writeCloudSave(0, 'other', state)).rejects.toMatchObject({
      status: 409,
      code: 'SAVE_CONFLICT',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(state.money).toBe(20);
  });
  it('rejects malformed cloud responses and preserves caller state when offline', async () => {
    const state = { money: 25 };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ save: {} }))
      .mockRejectedValueOnce(new TypeError('offline'));
    const client = new AuthClient('https://api.example.com', fetcher);
    await expect(client.readCloudSave()).rejects.toBeInstanceOf(AuthError);
    await expect(client.writeCloudSave(0, 'same-retry-id', state)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(state).toEqual({ money: 25 });
  });
  it('normalizes account fields and uses cookie credentials without persisting the password', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ user: { id: 'p1', email: 'player@example.com', displayName: 'Player' } }),
      );
    const client = new AuthClient('https://api.example.com/', fetcher);
    await expect(
      client.login(' PLAYER@EXAMPLE.COM ', 'a long private passphrase'),
    ).resolves.toEqual({
      id: 'p1',
      email: 'player@example.com',
      displayName: 'Player',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          email: 'player@example.com',
          password: 'a long private passphrase',
        }),
      }),
    );
  });

  it('returns a generic login failure when the server does not provide a safe message', async () => {
    const client = new AuthClient(
      'https://api.example.com',
      vi.fn<typeof fetch>().mockResolvedValue(json({}, 401)),
    );
    await expect(client.login('missing@example.com', 'wrong')).rejects.toMatchObject({
      message: 'Email or password is incorrect.',
      status: 401,
    });
  });

  it('does not display an account-enumerating server error', async () => {
    const client = new AuthClient(
      'https://api.example.com',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ message: 'That account does not exist.' }, 401)),
    );
    await expect(client.login('missing@example.com', 'wrong')).rejects.toMatchObject({
      message: 'Email or password is incorrect.',
    });
  });

  it('does not make a request when accounts are not configured', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new AuthClient('', fetcher);
    expect(client.configured).toBe(false);
    await expect(client.session()).rejects.toEqual(
      new AuthError('Online accounts are not connected yet.', 0, 'AUTH_NOT_CONFIGURED'),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('restores a null session without inventing a player', async () => {
    const client = new AuthClient(
      'https://api.example.com',
      vi.fn<typeof fetch>().mockResolvedValue(json({ user: null })),
    );
    await expect(client.session()).resolves.toEqual({ user: null });
  });
});
