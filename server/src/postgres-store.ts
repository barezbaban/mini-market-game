import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { AuthStore, CreatePlayer, CreateSession, Player, StoredPlayer } from './types.js';

interface PlayerRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
}

const player = (row: PlayerRow): Player => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
});

export class PostgresAuthStore implements AuthStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
  }

  async migrate(): Promise<void> {
    const migration = await readFile(new URL('../migrations/001_auth.sql', import.meta.url), 'utf8');
    await this.pool.query(migration);
  }

  async createPlayer(value: CreatePlayer): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>(
      `INSERT INTO players (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(email))) DO NOTHING
       RETURNING id, email, display_name, password_hash`,
      [value.id, value.email, value.displayName, value.passwordHash],
    );
    return result.rows[0] ? player(result.rows[0]) : null;
  }

  async findPlayerByEmail(email: string): Promise<StoredPlayer | null> {
    const result = await this.pool.query<PlayerRow>(
      'SELECT id, email, display_name, password_hash FROM players WHERE email = $1',
      [email],
    );
    const row = result.rows[0];
    return row ? { ...player(row), passwordHash: row.password_hash } : null;
  }

  async findPlayerBySessionHash(tokenHash: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT p.id, p.email, p.display_name, p.password_hash
       FROM player_sessions s JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] ? player(result.rows[0]) : null;
  }

  async createSession(value: CreateSession): Promise<void> {
    await this.pool.query(
      'INSERT INTO player_sessions (id, player_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [value.id, value.playerId, value.tokenHash, value.expiresAt],
    );
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM player_sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.pool.query('DELETE FROM player_sessions WHERE expires_at <= now()');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
