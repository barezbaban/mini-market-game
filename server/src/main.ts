import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { PostgresAuthStore } from './postgres-store.js';

const config = loadConfig();
const store = new PostgresAuthStore(config.databaseUrl);

try {
  await store.migrate();
  await store.deleteExpiredSessions();
  const app = await buildApp({
    store,
    clientOrigin: config.clientOrigin,
    secureCookies: config.secureCookies,
    sessionDays: config.sessionDays,
    trustProxy: config.trustProxy,
  });
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`KurdMart server listening on ${config.host}:${config.port}`);
} catch (error) {
  await store.close();
  console.error(error);
  process.exitCode = 1;
}
