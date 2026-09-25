#!/usr/bin/env bash
# Runstory sandbox setup for Multica. Invoked from apps/web via pnpm scripts so
# each phase is a plain program under Runstory's command policy and stays inside
# the selected app root. Phases (each must finish within Runstory's 600 s cap):
#   toolchain  ensure a Go toolchain matching server/go.mod (download if absent)
#   build      compile server/bin/server and server/bin/migrate
#   migrate    apply migrations to $DATABASE_URL
# See scripts/runstory/README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cache="${RUNSTORY_MULTICA_CACHE:-$repo/.cache/runstory}"
mkdir -p "$cache"

# Go's caches must be writable; the sandbox HOME may not be.
export GOMODCACHE="$cache/gomod"
export GOCACHE="$cache/gocache"
export GOFLAGS="${GOFLAGS:--mod=mod}"
export GOTOOLCHAIN=local
mkdir -p "$GOMODCACHE" "$GOCACHE"

want_go="$(sed -nE 's/^go ([0-9]+\.[0-9]+(\.[0-9]+)?).*/\1/p' "$repo/server/go.mod" | head -1)"
local_go="$cache/go/bin/go"

go_ok() { # $1 = go binary; true when its version satisfies go.mod's `go` line
  local v; v="$("$1" version 2>/dev/null | sed -nE 's/.*go([0-9]+\.[0-9]+(\.[0-9]+)?).*/\1/p')" || return 1
  [ -n "$v" ] || return 1
  [ "$(printf '%s\n%s\n' "$want_go" "$v" | sort -V | head -1)" = "$want_go" ]
}

pick_go() {
  if [ -z "${RUNSTORY_FORCE_GO_DOWNLOAD:-}" ] && command -v go >/dev/null 2>&1 && go_ok "$(command -v go)"; then
    command -v go; return
  fi
  if [ -x "$local_go" ] && go_ok "$local_go"; then printf '%s\n' "$local_go"; return; fi
  return 1
}

phase_toolchain() {
  if g="$(pick_go)"; then echo "runstory: using $g ($("$g" version))"; return; fi
  local arch; case "$(uname -m)" in x86_64) arch=amd64;; aarch64|arm64) arch=arm64;; *) echo "unsupported arch $(uname -m)" >&2; exit 1;; esac
  local ver="go${want_go}"
  echo "runstory: no Go >= $want_go on PATH; downloading $ver linux/$arch"
  local meta sha file url
  meta="$(curl -fsSL "https://go.dev/dl/?mode=json&include=all")"
  read -r file sha < <(printf '%s' "$meta" | python3 -c '
import sys,json
ver,arch=sys.argv[1],sys.argv[2]
for r in json.load(sys.stdin):
    if r["version"]==ver:
        for f in r["files"]:
            if f["os"]=="linux" and f["arch"]==arch and f["kind"]=="archive":
                print(f["filename"], f["sha256"]); sys.exit(0)
sys.exit("no archive for "+ver+" linux/"+arch)' "$ver" "$arch")
  url="https://go.dev/dl/$file"
  curl -fsSL -o "$cache/$file" "$url"
  echo "$sha  $cache/$file" | sha256sum -c - >/dev/null
  rm -rf "$cache/go"; tar -C "$cache" -xzf "$cache/$file"; rm -f "$cache/$file"
  echo "runstory: installed $("$local_go" version) at $local_go"
}

phase_build() {
  local g; g="$(pick_go)" || { echo "runstory: run the toolchain phase first" >&2; exit 1; }
  export PATH="$(dirname "$g"):$PATH"
  cd "$repo/server"
  echo "runstory: go mod download"; go mod download
  echo "runstory: building server"; go build -o bin/server ./cmd/server
  echo "runstory: building migrate"; go build -o bin/migrate ./cmd/migrate
  ls -la bin/server bin/migrate
}

phase_migrate() {
  : "${DATABASE_URL:?DATABASE_URL is required (Runstory delivers it from setup.services.postgresql.url_env)}"
  cd "$repo/server"
  [ -x bin/migrate ] || { echo "runstory: run the build phase first" >&2; exit 1; }
  echo "runstory: migrating $(printf '%s' "$DATABASE_URL" | sed -E 's#(//[^:]+:)[^@]+@#\1***@#')"
  ./bin/migrate up
}

case "${1:-}" in
  toolchain) phase_toolchain;;
  build) phase_build;;
  migrate) phase_migrate;;
  all) phase_toolchain; phase_build; phase_migrate;;
  *) echo "usage: $0 toolchain|build|migrate|all" >&2; exit 2;;
esac
