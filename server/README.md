# KurdMart server

This is a standalone service dedicated to KurdMart. It has no dependency on YallaRent. Jira remains only the project-management workspace.

This standalone service provides PostgreSQL-backed registration, password login, cookie sessions, logout, origin checks, rate limits and manual cloud backups. It is not connected to a live hosting account. Guest play and local saves do not require this service. There is no public leaderboard yet: uploaded browser saves are untrusted and must never be treated as verified scores.

## Local setup

1. Copy `.env.example` to `.env` and choose a development database password.
2. Start PostgreSQL with `POSTGRES_PASSWORD=... CLIENT_ORIGIN=http://127.0.0.1:5173 docker compose up database -d`.
3. Run `npm install` and `npm run dev` in this directory.
4. Set `VITE_API_URL=http://127.0.0.1:8787` in the game frontend.

The service applies idempotent authentication and cloud-save migrations on startup. Production must place the API behind HTTPS and a reverse proxy. Use a same-site game/API deployment (for example `play.<approved-domain>` and `api.<approved-domain>`) because the session cookie is HttpOnly, Secure and SameSite=Lax. A cross-site API alongside GitHub Pages is not a supported cookie deployment. Keep `DATABASE_URL` and the database password in the hosting provider's secret store, never in Git.

## Cloud backups

- `GET /api/save` returns the signed-in player's save or `null`, with `Cache-Control: no-store`.
- `POST /api/save` accepts `{ revision, mutationId, state }`. Start at revision 0; subsequent uploads must supply the revision the player reviewed. Each logical upload uses one UUID; network retries reuse it and the identical snapshot.
- A stale revision or reused mutation ID with changed data returns HTTP 409 without overwriting the current save. The client asks the player to check and review the cloud market again.
- Transactions lock the player row, so simultaneous first uploads cannot bypass the revision check. Five prior revisions are retained in `player_save_history` for operator recovery. This is not a substitute for external database backups.
- Save endpoints require a session, uploads require the exact approved Origin, and upload bodies are limited to 2 MB. Uploads are rate-limited to 12/minute.
- Account UI never downloads over a local game automatically. Restoring previews the selected market, requires confirmation, validates it with the game save validator and keeps a separate local recovery copy.
- Upload retry is explicit, not background auto-sync. Do not describe it as offline cloud sync or a verified competitive service.

Run `npm run build` and `npm test` before deployment. In sandboxes where the `tsx` command cannot create its IPC socket, `node --import tsx --test tests/*.test.ts` runs the same tests without that launcher. API tests use an in-memory store. Set `KURDMART_TEST_DATABASE_URL` to a disposable database to opt into real PostgreSQL migration, concurrent-write and history-recovery tests; never use a production database. A two-device save conflict, TLS/cookie flow and off-server database restore drill must pass on staging before public activation.

## Isolation requirements

- Use a dedicated KurdMart hosting project/account boundary where practical.
- Use a dedicated PostgreSQL database, database user, secret set and backups.
- Use a KurdMart-only API hostname, such as `api.<approved-domain>`.
- Allow credentialed requests only from the approved KurdMart game origin.
- Do not reuse YallaRent databases, cookies, domains, credentials or deployment pipelines.
