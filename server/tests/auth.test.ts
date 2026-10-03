import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import type {
  AuthStore,
  CloudSave,
  CreatePlayer,
  CreateSession,
  Player,
  StoredPlayer,
} from '../src/types.js';

class MemoryStore implements AuthStore {
  saves = new Map<string, CloudSave>();
  players = new Map<string, StoredPlayer>();
  sessions = new Map<string, CreateSession>();

  async createPlayer(value: CreatePlayer): Promise<Player | null> {
    if ([...this.players.values()].some((player) => player.email === value.email)) return null;
    this.players.set(value.id, value);
    return value;
  }

  async findPlayerByEmail(email: string): Promise<StoredPlayer | null> {
    return [...this.players.values()].find((player) => player.email === email) ?? null;
  }

  async findPlayerBySessionHash(tokenHash: string): Promise<Player | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= new Date()) return null;
    return this.players.get(session.playerId) ?? null;
  }

  async createSession(session: CreateSession): Promise<void> {
    this.sessions.set(session.tokenHash, session);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteExpiredSessions(): Promise<void> {}

  async readSave(playerId: string): Promise<CloudSave | null> {
    return this.saves.get(playerId) ?? null;
  }

  async writeSave(
    playerId: string,
    revision: number,
    mutationId: string,
    state: Record<string, unknown>,
  ) {
    const current = this.saves.get(playerId) ?? null;
    if (current?.mutationId === mutationId)
      return { conflict: JSON.stringify(current.state) !== JSON.stringify(state), save: current };
    if ((current?.revision ?? 0) !== revision) return { conflict: true, save: current };
    const save = { revision: revision + 1, mutationId, state, updatedAt: new Date().toISOString() };
    this.saves.set(playerId, save);
    return { conflict: false, save };
  }
}

const origin = 'https://play.kurdmart.example';

test('registers, restores and logs out a player through an opaque cookie session', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ store, clientOrigin: origin, secureCookies: true, sessionDays: 30 });
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Barez Market',
      email: ' PLAYER@EXAMPLE.COM ',
      password: 'a very long market passphrase',
    },
  });
  assert.equal(registration.statusCode, 201);
  assert.deepEqual(registration.json().user, {
    id: registration.json().user.id,
    displayName: 'Barez Market',
    email: 'player@example.com',
  });
  const stored = [...store.players.values()][0];
  assert.ok(stored.passwordHash.startsWith('scrypt$'));
  assert.ok(!stored.passwordHash.includes('a very long market passphrase'));
  const setCookie = registration.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  assert.match(setCookie as string, /HttpOnly/);
  assert.match(setCookie as string, /Secure/);
  assert.match(setCookie as string, /SameSite=Lax/);
  const cookie = (setCookie as string).split(';', 1)[0];

  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: { cookie },
  });
  assert.equal(session.statusCode, 200);
  assert.equal(session.json().user.email, 'player@example.com');

  const logout = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { cookie, origin },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(store.sessions.size, 0);
  await app.close();
});

test('logs in with a generic failure and rejects an unapproved origin', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ store, clientOrigin: origin, secureCookies: true, sessionDays: 30 });
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'missing@example.com', password: 'not the correct password' },
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().message, 'Email or password is incorrect.');

  const foreign = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'https://unrelated.example' },
    payload: {
      displayName: 'Nope',
      email: 'nope@example.com',
      password: 'a sufficiently long password',
    },
  });
  assert.equal(foreign.statusCode, 403);
  assert.equal(store.players.size, 0);
  await app.close();
});

test('cloud backups require ownership, strict origin and revision checks; retries do not duplicate writes', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ store, clientOrigin: origin, secureCookies: true, sessionDays: 30 });
  const register = async (name: string) => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin },
      payload: {
        displayName: name,
        email: `${name}@example.com`,
        password: 'a long unique test passphrase',
      },
    });
    assert.equal(result.statusCode, 201);
    return (result.headers['set-cookie'] as string).split(';', 1)[0];
  };
  const cookie = await register('first');
  const otherCookie = await register('second');
  const state = { version: 2, money: 120, upgrades: {}, farms: {}, inventory: {} };
  const mutationId = '9630956c-9999-4000-8000-2fcff1c68d29';
  const payload = { revision: 0, mutationId, state };
  assert.equal((await app.inject({ method: 'GET', url: '/api/save' })).statusCode, 401);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/save', headers: { origin }, payload }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/save',
        headers: { cookie, origin: 'https://foreign.example' },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/save', headers: { cookie }, payload }))
      .statusCode,
    403,
  );
  const upload = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload,
  });
  assert.equal(upload.statusCode, 200);
  assert.equal(upload.json().save.revision, 1);
  assert.equal(upload.headers['cache-control'], 'no-store');
  const retry = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload,
  });
  assert.equal(retry.json().save.revision, 1);
  const reused = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload: { ...payload, state: { ...state, money: 999 } },
  });
  assert.equal(reused.statusCode, 409);
  const conflict = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload: { ...payload, mutationId: '9630956c-9999-4000-8000-2fcff1c68d30' },
  });
  assert.equal(conflict.statusCode, 409);
  const restore = await app.inject({ method: 'GET', url: '/api/save', headers: { cookie } });
  assert.deepEqual(restore.json().save.state, state);
  const isolated = await app.inject({
    method: 'GET',
    url: '/api/save',
    headers: { cookie: otherCookie },
  });
  assert.equal(isolated.json().save, null);
  const next = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload: {
      ...payload,
      revision: 1,
      mutationId: '9630956c-9999-4000-8000-2fcff1c68d31',
      state: { ...state, money: 200 },
    },
  });
  assert.equal(next.statusCode, 200);
  assert.equal(next.json().save.revision, 2);
  assert.equal(store.saves.size, 1);
  await app.close();
});

test('cloud backups reject invalid payloads and oversized bodies', async () => {
  const store = new MemoryStore();
  const app = await buildApp({ store, clientOrigin: origin, secureCookies: true, sessionDays: 30 });
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Save tests',
      email: 'save@example.com',
      password: 'a long unique test passphrase',
    },
  });
  const cookie = (registration.headers['set-cookie'] as string).split(';', 1)[0];
  const payload = {
    revision: 0,
    mutationId: '9630956c-9999-4000-8000-2fcff1c68d29',
    state: { version: 2, money: 1, upgrades: {}, farms: {}, inventory: {} },
  };
  for (const value of [
    null,
    {},
    { ...payload, revision: -1 },
    { ...payload, mutationId: 'bad' },
    { ...payload, state: { ...payload.state, upgrades: [] } },
    { ...payload, state: { ...payload.state, money: 1.5 } },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/save',
      headers: { cookie, origin, 'content-type': 'application/json' },
      payload: JSON.stringify(value),
    });
    assert.equal(response.statusCode, 400);
  }
  const huge = await app.inject({
    method: 'POST',
    url: '/api/save',
    headers: { cookie, origin },
    payload: { ...payload, state: { ...payload.state, junk: 'x'.repeat(2_000_000) } },
  });
  assert.equal(huge.statusCode, 413);
  assert.equal(store.saves.size, 0);
  await app.close();
});
