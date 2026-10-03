import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresAuthStore } from '../src/postgres-store.js';

// Opt in only against a disposable test database, never a user's live database.
const databaseUrl = process.env.KURDMART_TEST_DATABASE_URL;
test(
  'PostgreSQL serializes simultaneous first writes, keeps history and rejects stale revisions',
  { skip: !databaseUrl },
  async () => {
    const store = new PostgresAuthStore(databaseUrl!);
    const pool = new Pool({ connectionString: databaseUrl! });
    const playerId = randomUUID();
    try {
      await store.migrate();
      await store.migrate(); // Idempotent migration.
      await store.createPlayer({
        id: playerId,
        email: `${playerId}@example.com`,
        displayName: 'Test player',
        passwordHash: 'integration-fixture-only',
      });
      assert.equal(await store.readSave(playerId), null);
      const state = { version: 2, money: 50, upgrades: {}, farms: {}, inventory: {} };
      const attempts = await Promise.all([
        store.writeSave(playerId, 0, randomUUID(), state),
        store.writeSave(playerId, 0, randomUUID(), { ...state, money: 75 }),
      ]);
      assert.equal(attempts.filter((r) => !r.conflict).length, 1);
      assert.equal(attempts.filter((r) => r.conflict).length, 1);
      const current = (await store.readSave(playerId))!;
      assert.equal(current.revision, 1);
      const retry = await store.writeSave(playerId, 0, current.mutationId, current.state);
      assert.equal(retry.conflict, false);
      assert.equal(retry.save!.revision, 1);
      assert.equal(
        (await store.writeSave(playerId, 1, current.mutationId, { ...current.state, money: 999 }))
          .conflict,
        true,
      );
      for (let revision = 1; revision < 9; revision++) {
        const next = await store.writeSave(playerId, revision, randomUUID(), {
          ...state,
          money: revision * 100,
        });
        assert.equal(next.conflict, false);
        assert.equal(next.save!.revision, revision + 1);
      }
      assert.equal((await store.writeSave(playerId, 1, randomUUID(), state)).conflict, true);
      const rows = await pool.query(
        'SELECT revision, state FROM player_save_history WHERE player_id = $1 ORDER BY revision',
        [playerId],
      );
      assert.deepEqual(
        rows.rows.map((row) => row.revision),
        [4, 5, 6, 7, 8],
      );
      assert.equal((await store.readSave(playerId))!.state.money, 800);
      // Operator recovery copies a historical snapshot into a new, CAS-checked revision.
      const recovered = await store.writeSave(playerId, 9, randomUUID(), rows.rows[0].state);
      assert.equal(recovered.save!.revision, 10);
      assert.equal(recovered.save!.state.money, 300);
    } finally {
      // Delete only this test's UUID, relying on scoped FK cascades.
      await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
      await pool.end();
      await store.close();
    }
  },
);
