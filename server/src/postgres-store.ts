import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type {
  AuthStore,
  CloudSave,
  CreatePlayer,
  CreateSession,
  Player,
  StoredPlayer,
} from './types.js';

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
    const migration = await readFile(
      new URL('../migrations/001_auth.sql', import.meta.url),
      'utf8',
    );
    await this.pool.query(migration);
    await this.pool.query(
      await readFile(new URL('../migrations/002_cloud_saves.sql', import.meta.url), 'utf8'),
    );
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

  async readSave(playerId: string): Promise<CloudSave | null> {
    const result = await this.pool.query(
      'SELECT revision, mutation_id, state, updated_at FROM player_saves WHERE player_id = $1',
      [playerId],
    );
    const row = result.rows[0];
    return row
      ? {
          revision: row.revision,
          mutationId: row.mutation_id,
          state: row.state,
          updatedAt: row.updated_at.toISOString(),
        }
      : null;
  }

  async writeSave(
    playerId: string,
    revision: number,
    mutationId: string,
    state: Record<string, unknown>,
  ): Promise<{ conflict: boolean; save: CloudSave | null }> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize writes even when this player has no save row yet.
      await db.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      const current = await db.query(
        'SELECT revision, mutation_id, state, updated_at, state = $2::jsonb AS same_state FROM player_saves WHERE player_id = $1',
        [playerId, JSON.stringify(state)],
      );
      const row = current.rows[0];
      if (row && (row.mutation_id === mutationId || row.revision !== revision)) {
        await db.query('COMMIT');
        return {
          conflict: !(row.mutation_id === mutationId && row.same_state),
          save: {
            revision: row.revision,
            mutationId: row.mutation_id,
            state: row.state,
            updatedAt: row.updated_at.toISOString(),
          },
        };
      }
      if (!row && revision !== 0) {
        await db.query('ROLLBACK');
        return { conflict: true, save: null };
      }
      if (row)
        await db.query(
          'INSERT INTO player_save_history (player_id, revision, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [playerId, row.revision, row.state],
        );
      const result = await db.query(
        'INSERT INTO player_saves (player_id, revision, mutation_id, state) VALUES ($1, $2, $3, $4) ON CONFLICT (player_id) DO UPDATE SET revision = EXCLUDED.revision, mutation_id = EXCLUDED.mutation_id, state = EXCLUDED.state, updated_at = now() RETURNING updated_at',
        [playerId, revision + 1, mutationId, state],
      );
      await db.query(
        'DELETE FROM player_save_history WHERE player_id = $1 AND revision NOT IN (SELECT revision FROM player_save_history WHERE player_id = $1 ORDER BY revision DESC LIMIT 5)',
        [playerId],
      );
      await db.query('COMMIT');
      return {
        conflict: false,
        save: {
          revision: revision + 1,
          mutationId,
          state,
          updatedAt: result.rows[0].updated_at.toISOString(),
        },
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
