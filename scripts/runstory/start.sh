#!/usr/bin/env bash
# Runstory sandbox start for Multica: run the Go API on :8080, then serve the
# built Next.js app on :3000 with same-origin proxying to the API. Readiness is
# GET /health on :3000, which Next forwards to the API, so it proves both are up.
# Sign-in inside the sandbox: any email, verification code 888888 (dev code;
# APP_ENV is unset so it is honoured). See scripts/runstory/README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cache="${RUNSTORY_MULTICA_CACHE:-$repo/.cache/runstory}"
api_port="${MULTICA_RUNSTORY_API_PORT:-8080}"
web_port="${MULTICA_RUNSTORY_WEB_PORT:-3000}"

: "${DATABASE_URL:?DATABASE_URL is required}"
[ -x "$repo/server/bin/server" ] || { echo "runstory: server/bin/server missing; run setup build" >&2; exit 1; }
mkdir -p "$cache/uploads"

api_env=(
  "PORT=$api_port"
  "APP_ENV="
  "MULTICA_DEV_VERIFICATION_CODE=888888"
  "FRONTEND_ORIGIN=http://localhost:$web_port"
  "CORS_ALLOWED_ORIGINS=http://localhost:$web_port,http://127.0.0.1:$web_port"
  "MULTICA_APP_URL=http://localhost:$web_port"
  "MULTICA_PUBLIC_URL=http://localhost:$api_port"
  "LOCAL_UPLOAD_DIR=$cache/uploads"
  "LOCAL_UPLOAD_BASE_URL=http://localhost:$api_port"
  "MULTICA_SERVER_URL=ws://localhost:$api_port/ws"
)
[ -n "${JWT_SECRET:-}" ] && api_env+=("JWT_SECRET=$JWT_SECRET")

echo "runstory: starting API on :$api_port"
( cd "$repo/server" && exec env -i PATH="$PATH" HOME="${HOME:-/tmp}" DATABASE_URL="$DATABASE_URL" "${api_env[@]}" ./bin/server ) &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM

for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$api_port/health" >/dev/null 2>&1; then break; fi
  kill -0 "$api_pid" 2>/dev/null || { echo "runstory: API exited before becoming healthy" >&2; exit 1; }
  sleep 1
done
curl -fsS "http://127.0.0.1:$api_port/health" >/dev/null || { echo "runstory: API not healthy after 60 s" >&2; exit 1; }
echo "runstory: API healthy. Sign in with any email and verification code 888888."

cd "$repo/apps/web"
[ -d .next ] || { echo "runstory: apps/web/.next missing; run the build first" >&2; exit 1; }
export REMOTE_API_URL="http://127.0.0.1:$api_port"
export NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL=""
export HOSTNAME=0.0.0.0
echo "runstory: starting web on :$web_port"
exec node_modules/.bin/next start --port "$web_port"
