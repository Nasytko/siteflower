#!/usr/bin/env bash
# Regression: admin-create.sh must forward --email/--name/--password to
# `node dist/cli/admin-create.js` inside `docker compose exec` (production CLI).
#
# Expected final argv shape (after docker compose ... exec [opts]):
#   api
#   node
#   dist/cli/admin-create.js
#   --email <email>
#   --name <name>
#   --password <password>
#
# There must be NO standalone `--` between `api` and `node` (OCI treats it as executable).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-admin-create-args.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*" >&2; }

mkdir -p "$TMP/bin"
CAPTURE_TXT="$TMP/docker-argv.txt"
export ADMIN_CREATE_ARGV_CAPTURE="$CAPTURE_TXT"

cat >"$TMP/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
capture="${ADMIN_CREATE_ARGV_CAPTURE:?}"
# Record full argv (one arg per line) for assertions.
: >"$capture"
for a in "$@"; do
  printf '%s\n' "$a" >>"$capture"
done

if [[ "${1:-}" == "inspect" ]]; then
  exit 0
fi

if [[ "${1:-}" == "compose" ]]; then
  # Mimic a successful exec; production CLI is not run in this unit test.
  exit 0
fi

echo "unexpected docker invocation: $*" >&2
exit 1
EOF
chmod +x "$TMP/bin/docker"

# Minimal env accepted by load_env_file + ensure_database_url.
cat >"$TMP/production.env" <<'EOF'
NODE_ENV=production
DATABASE_URL=postgresql://shopbuket1:x@postgres:5432/shopbuket1?schema=public
POSTGRES_USER=shopbuket1
POSTGRES_PASSWORD=x
POSTGRES_DB=shopbuket1
EOF

export PATH="$TMP/bin:$PATH"
export SHOPBUKET1_ENV_FILE="$TMP/production.env"

# Non-TTY stdin + --password exercises the automation path (-T + arg forward).
set +e
printf '' | "$ROOT/admin-create.sh" \
  --email 'director@example.com' \
  --name 'Director' \
  --password 'test-password-12'
rc=$?
set -e

[[ "$rc" -eq 0 ]] || fail "admin-create.sh exited $rc (expected 0 with mocked docker)"
[[ -f "$CAPTURE_TXT" ]] || fail "docker was not invoked"

grep -qx 'compose' "$CAPTURE_TXT" || fail "expected docker compose"
grep -qx 'exec' "$CAPTURE_TXT" || fail "expected compose exec"
grep -qx -- '-T' "$CAPTURE_TXT" || fail "expected compose exec -T for non-TTY"

mapfile -t argv <"$CAPTURE_TXT"

# Locate service `api` among compose exec argv.
api_idx=-1
for i in "${!argv[@]}"; do
  if [[ "${argv[$i]}" == "api" ]]; then
    api_idx=$i
    break
  fi
done
[[ "$api_idx" -ge 0 ]] || fail "expected service api"

# Exact contiguous sequence required by docker compose exec runtime:
#   api node dist/cli/admin-create.js --email ... --name ... --password ...
[[ "${argv[$((api_idx + 1))]:-}" == "node" ]] \
  || fail "expected executable 'node' immediately after api (got: ${argv[$((api_idx + 1))]:-<missing>})"
[[ "${argv[$((api_idx + 2))]:-}" == "dist/cli/admin-create.js" ]] \
  || fail "expected dist/cli/admin-create.js after node"
[[ "${argv[$((api_idx + 3))]:-}" == "--email" ]] \
  || fail "expected --email after script"
[[ "${argv[$((api_idx + 4))]:-}" == "director@example.com" ]] \
  || fail "expected email value"
[[ "${argv[$((api_idx + 5))]:-}" == "--name" ]] \
  || fail "expected --name"
[[ "${argv[$((api_idx + 6))]:-}" == "Director" ]] \
  || fail "expected name value"
[[ "${argv[$((api_idx + 7))]:-}" == "--password" ]] \
  || fail "expected --password"
[[ "${argv[$((api_idx + 8))]:-}" == "test-password-12" ]] \
  || fail "expected password value"

# `--` between api and node would be executed by OCI as the container command.
if [[ "${argv[$((api_idx + 1))]:-}" == "--" ]]; then
  fail "must not insert '--' between api and node (OCI exec: executable file not found)"
fi
# No standalone `--` anywhere after `exec` before user flags (defensive).
exec_idx=-1
for i in "${!argv[@]}"; do
  if [[ "${argv[$i]}" == "exec" ]]; then
    exec_idx=$i
    break
  fi
done
[[ "$exec_idx" -ge 0 ]] || fail "exec not found"
for ((i = exec_idx + 1; i < api_idx + 3; i++)); do
  if [[ "${argv[$i]}" == "--" ]]; then
    fail "unexpected '--' at argv[$i] near api/node (OCI would treat it as executable)"
  fi
done

# Ensure we did not fall back to tsx / source tree.
if grep -E -q 'tsx|/app/scripts/|src/cli/admin-create\.ts' "$CAPTURE_TXT"; then
  fail "docker argv must use compiled dist/cli only (no tsx/src)"
fi

# Interactive path (no user args): still ends with api node dist/cli/admin-create.js
: >"$CAPTURE_TXT"
# Force a TTY-less run without --password should die; with empty args + fake TTY is hard.
# Instead invoke the script's argv capture by calling with zero flags via a tiny wrapper
# that pretends stdin is a TTY is unreliable cross-platform — verify zero-arg array path
# by sourcing the same construction with a dry helper:
set +e
# shellcheck disable=SC2034
printf '' | "$ROOT/admin-create.sh" >/tmp/admin-create-noargs.out 2>/tmp/admin-create-noargs.err
noargs_rc=$?
set -e
# Without --password and without TTY, script must refuse (not spawn broken OCI --).
[[ "$noargs_rc" -ne 0 ]] || fail "no-arg non-TTY should fail closed"
grep -q 'Interactive TTY required' /tmp/admin-create-noargs.err \
  || fail "expected TTY required message for interactive-only path"

pass "admin-create.sh builds: api node dist/cli/admin-create.js --email/--name/--password (no OCI --)"
