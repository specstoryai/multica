# Runstory sandbox scripts

Runstory checks the `apps/web` app in an isolated sandbox. Multica's web app needs
the Go API and PostgreSQL, so the saved plan (`.runstory/plan.json`) declares:

- a managed PostgreSQL database delivered as `DATABASE_URL`;
- a generated `JWT_SECRET`;
- setup commands, run from `apps/web` as `pnpm run runstory:*`, that fetch a Go
  toolchain matching `server/go.mod` when the sandbox has none, build
  `server/bin/server` and `server/bin/migrate`, and apply migrations;
- a pinned start command, `pnpm run runstory:start`, that runs the API on :8080 and
  `next start` on :3000. Readiness is `GET /health` on :3000, proxied to the API.

Inside the sandbox, sign in with any email address and verification code `888888`
(`MULTICA_DEV_VERIFICATION_CODE`, honoured because `APP_ENV` is unset). The first
sign-in creates the account and workspace through the normal onboarding flow.

Run locally against a scratch database:

```sh
export DATABASE_URL=postgres://multica:multica@localhost:5432/multica_runstory?sslmode=disable
apps/web$ pnpm run runstory:toolchain && pnpm run runstory:build-api && pnpm run runstory:migrate
apps/web$ pnpm run build && pnpm run runstory:start
```

Toolchain and Go caches live under `.cache/runstory/` (git-ignored).
