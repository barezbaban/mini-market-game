import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply } from 'fastify';
import { hashPassword, verifyPassword } from './password.js';
import { createSessionToken, hashSessionToken, SESSION_COOKIE } from './session.js';
import type { AuthStore, Player } from './types.js';

export interface AppOptions {
  store: AuthStore;
  clientOrigin: string;
  secureCookies: boolean;
  sessionDays: number;
  trustProxy?: boolean;
}

interface CredentialsBody {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicPlayer = (user: Player) => ({
  user: { id: user.id, email: user.email, displayName: user.displayName },
});

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 16 * 1024,
  });
  const dummyPasswordHash = await hashPassword('invalid KurdMart password placeholder');
  await app.register(cookie);
  await app.register(cors, {
    origin: options.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, {
    global: false,
    max: 12,
    timeWindow: '1 minute',
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || !request.url.startsWith('/api/auth/')) return;
    const origin = request.headers.origin;
    if (!origin || origin !== options.clientOrigin)
      return reply.code(403).send({ code: 'INVALID_ORIGIN', message: 'Request not allowed.' });
  });

  const setSession = async (reply: FastifyReply, user: Player) => {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + options.sessionDays * 24 * 60 * 60 * 1000);
    await options.store.createSession({
      id: randomUUID(),
      playerId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: 'lax',
      maxAge: options.sessionDays * 24 * 60 * 60,
    });
  };

  app.get('/health', async () => ({ ok: true, service: 'kurdmart-server' }));

  app.get('/api/auth/session', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return { user: null };
    const user = await options.store.findPlayerBySessionHash(hashSessionToken(token));
    return user ? publicPlayer(user) : { user: null };
  });

  app.post<{ Body: CredentialsBody }>(
    '/api/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const displayName =
        typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      if (!emailPattern.test(email) || email.length > 254 || displayName.length < 2 || displayName.length > 24 || password.length < 15 || password.length > 128)
        return reply.code(400).send({ code: 'INVALID_REGISTRATION', message: 'We could not create that account.' });
      const created = await options.store.createPlayer({
        id: randomUUID(),
        email,
        displayName,
        passwordHash: await hashPassword(password),
      });
      if (!created)
        return reply.code(400).send({ code: 'INVALID_REGISTRATION', message: 'We could not create that account.' });
      await setSession(reply, created);
      return reply.code(201).send(publicPlayer(created));
    },
  );

  app.post<{ Body: CredentialsBody }>(
    '/api/auth/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const stored = emailPattern.test(email) ? await options.store.findPlayerByEmail(email) : null;
      const candidatePassword = password.length <= 128 ? password : 'invalid password placeholder';
      const valid = await verifyPassword(candidatePassword, stored?.passwordHash ?? dummyPasswordHash);
      if (!stored || !valid)
        return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
      await setSession(reply, stored);
      return publicPlayer(stored);
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await options.store.deleteSession(hashSessionToken(token));
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: 'lax',
    });
    return { ok: true };
  });

  app.addHook('onClose', async () => options.store.close?.());
  return app;
}
