# KurdMart server

This is a standalone service dedicated to KurdMart. It has no dependency on YallaRent. Jira remains only the project-management workspace.

The first server slice provides PostgreSQL-backed player registration, password login, cookie sessions, session restoration, logout, origin checks and rate limits. Cloud saves and leaderboards will build on the same player identity later.

## Local setup

1. Copy `.env.example` to `.env` and choose a development database password.
2. Start PostgreSQL with `POSTGRES_PASSWORD=... CLIENT_ORIGIN=http://127.0.0.1:5173 docker compose up database -d`.
3. Run `npm install` and `npm run dev` in this directory.
4. Set `VITE_API_URL=http://127.0.0.1:8787` in the game frontend.

The service applies its idempotent authentication migration on startup. Production must place the API behind HTTPS and a reverse proxy. Keep `DATABASE_URL` and the database password in the hosting provider's secret store, never in Git.

## Isolation requirements

- Use a dedicated KurdMart hosting project/account boundary where practical.
- Use a dedicated PostgreSQL database, database user, secret set and backups.
- Use a KurdMart-only API hostname, such as `api.<approved-domain>`.
- Allow credentialed requests only from the approved KurdMart game origin.
- Do not reuse YallaRent databases, cookies, domains, credentials or deployment pipelines.
