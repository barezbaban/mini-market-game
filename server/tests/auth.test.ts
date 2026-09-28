import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import type {
  AuthStore,
  CreatePlayer,
  CreateSession,
  Player,
  StoredPlayer,
} from '../src/types.js';

class MemoryStore implements AuthStore {
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

  const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
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
