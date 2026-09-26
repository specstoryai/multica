# Runstory sandbox scripts

Runstory checks the `apps/web` app in an isolated sandbox. Multica's web app needs
the Go API and PostgreSQL, so the saved plan (`.runstory/plan.json`) declares:

- a managed PostgreSQL database delivered as `DATABASE_URL`;
- a generated `JWT_SECRET`;
- setup commands, run from `apps/web` as `pnpm run runstory:*`, that fetch a Go
  toolchain matching `server/go.mod` when the sandbox has none, build
  `server/bin/server` and `server/bin/migrate`, and apply migrations;
- a pinned install, `pnpm install --frozen-lockfile --filter @multica/web...`, which installs
  `apps/web` and its workspace dependencies only. The derived command installed the whole
  monorepo, including Electron and Expo, and a cold run then outlived Runstory's 20-minute
  budget (5 min wall + 15 min grace on the standard tier);
- a pinned build, `pnpm run runstory:build`: `MULTICA_LOW_MEMORY_BUILD=1 next build`
  (Turbopack). The app's own `build` script forces webpack, which needs more than the
  sandbox's 4 GiB and never finished there. Measured locally: the Turbopack compile peaks
  near 3 GB and the in-build TypeScript pass adds 1.9 GB, so the flag makes
  `apps/web/next.config.ts` skip that pass (`pnpm typecheck` owns types) and generate
  static pages from one worker. With it the build completes under a 3.5 GiB cap in ~20 s
  and fails under 3 GiB. Production images keep the webpack build unchanged;
- a pinned start command, `pnpm run runstory:start`, that runs the API on :8080 and
  `next start` on :3000. Readiness is `GET /health` on :3000, proxied to the API.

Inside the sandbox, sign in with any email address and verification code `888888`
(`MULTICA_DEV_VERIFICATION_CODE`, honoured because `APP_ENV` is unset). The first
sign-in creates the account and workspace through the normal onboarding flow.

Run locally against a scratch database:

```sh
export DATABASE_URL=<connection string of a scratch database, e.g. the dev stack's multica_runstory>
apps/web$ pnpm run runstory:toolchain && pnpm run runstory:build-api && pnpm run runstory:migrate
apps/web$ pnpm run build && pnpm run runstory:start
```

Toolchain and Go caches live under `.cache/runstory/` (git-ignored).

Running a check by hand: `RUNSTORY_DISPATCH_WAIT_MS=2400000 runstory run`. The CLI's default
wait is the run's wall plus five minutes, which this app's setup and build exceed; without the
override the verdict does not land locally and `runstory status` shows the run as pending.
