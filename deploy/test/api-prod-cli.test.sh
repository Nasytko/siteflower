#!/usr/bin/env bash
# Regression: production admin CLIs must resolve in the same packaging path as
# deploy/Dockerfile.api (pnpm deploy --prod → dist/cli/*.js, no apps/api/src, no tsx).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*" >&2; }

if ! command -v docker >/dev/null 2>&1; then
  fail "docker is required for production CLI packaging probe"
fi

IMAGE="shopbuket1-api:cli-probe-$$"
cleanup() { docker rmi -f "$IMAGE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }

log "Building API image (Dockerfile.api bake-time checks include admin CLI)"
docker build -f deploy/Dockerfile.api -t "$IMAGE" .

log "Re-checking compiled CLI entrypoints inside the image"
# Git Bash otherwise rewrites /bin/sh to a Windows path that does not exist in the container.
export MSYS_NO_PATHCONV=1
docker run --rm --entrypoint /bin/sh "$IMAGE" -ec '
  set -eu
  test -f dist/cli/admin-create.js
  test -f dist/cli/admin-reset-password.js
  test -f dist/auth/crypto.util.js
  test -f dist/main.js
  test -f dist/worker-main.js
  test ! -e src
  test ! -e scripts
  test ! -e node_modules/tsx
  node -e "require(\"@nestjs/common\"); require(\"./dist/auth/crypto.util\"); require(\"argon2\");"
  set +e
  node dist/cli/admin-create.js >/tmp/ac.out 2>/tmp/ac.err
  ac=$?
  node dist/cli/admin-reset-password.js >/tmp/ar.out 2>/tmp/ar.err
  ar=$?
  set -e
  test "$ac" -ne 0
  test "$ar" -ne 0
  grep -q "Usage:" /tmp/ac.err
  if grep -q "Cannot find module" /tmp/ac.err /tmp/ac.out /tmp/ar.err /tmp/ar.out; then
    cat /tmp/ac.err /tmp/ac.out /tmp/ar.err /tmp/ar.out
    exit 1
  fi
  if grep -R --include="*.js" -n "../src/auth/crypto" dist/cli >/dev/null 2>&1; then
    echo "compiled CLI still references ../src/auth/crypto" >&2
    exit 1
  fi
'

pass "production API image: admin CLIs resolve without src/ or tsx"
