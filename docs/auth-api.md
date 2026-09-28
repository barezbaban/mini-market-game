# KurdMart authentication API contract

The web client supports sign in, registration, session restore and sign out. The dedicated implementation lives in `server/` and is independent of YallaRent. Set `VITE_API_URL` at build time to connect it. With no API URL, the account button explains that setup is pending and the game continues with its existing device save.

## Endpoints

All bodies are JSON. Successful login and registration return:

```json
{ "user": { "id": "player-id", "email": "player@example.com", "displayName": "Player" } }
```

- `GET /api/auth/session` → `{ "user": null }` or the response above.
- `POST /api/auth/login` with `{ "email", "password" }`.
- `POST /api/auth/register` with `{ "displayName", "email", "password" }`.
- `POST /api/auth/logout` → any successful JSON response.

## Required server behavior

- Store only an approved slow password hash (Argon2id preferred), never a password or reversible encryption.
- Use an opaque session cookie with `Secure`, `HttpOnly`, and an appropriate `SameSite` value. Rotate it after authentication and invalidate it on logout.
- Rate-limit login and registration by account and network source. Return generic login and registration failures to reduce account enumeration.
- Validate normalized email, a 2–24 character player name, and a 15–128 character registration password on the server. Client validation is only a convenience.
- Permit credentialed CORS only from the approved game origin if the API is hosted separately. Same-origin deployment is preferred.
- Add CSRF protection before enabling any state-changing account or cloud-save endpoint across origins.

The browser client uses `credentials: "include"` and never writes passwords or session tokens to local storage. Cloud-save ownership is a separate implementation step; signing in does not yet upload or replace the device save.
