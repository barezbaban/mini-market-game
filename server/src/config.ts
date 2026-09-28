export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  clientOrigin: string;
  secureCookies: boolean;
  sessionDays: number;
  trustProxy: boolean;
}

const integer = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = environment.DATABASE_URL?.trim();
  const clientOrigin = environment.CLIENT_ORIGIN?.trim().replace(/\/$/, '');
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!clientOrigin || !/^https?:\/\//.test(clientOrigin))
    throw new Error('CLIENT_ORIGIN must be an absolute http(s) origin.');
  return {
    host: environment.HOST?.trim() || '127.0.0.1',
    port: integer(environment.PORT, 8787),
    databaseUrl,
    clientOrigin,
    secureCookies: environment.NODE_ENV === 'production',
    sessionDays: integer(environment.SESSION_DAYS, 30),
    trustProxy: environment.TRUST_PROXY === 'true',
  };
}
