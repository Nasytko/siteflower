#!/usr/bin/env bash
# Regression: admin-create.sh must forward --email/--name/--password to
# `node dist/cli/admin-create.js` inside `docker compose exec` (production CLI).
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
grep -qx 'api' "$CAPTURE_TXT" || fail "expected service api"
grep -qx -- '--' "$CAPTURE_TXT" || fail "expected -- before container command"
grep -qx 'node' "$CAPTURE_TXT" || fail "expected node"
grep -qx 'dist/cli/admin-create.js' "$CAPTURE_TXT" || fail "expected dist/cli/admin-create.js"

# Critical: user flags must appear AFTER the production CLI entrypoint.
cli_line="$(grep -n -x 'dist/cli/admin-create.js' "$CAPTURE_TXT" | head -n1 | cut -d: -f1)"
[[ -n "$cli_line" ]] || fail "CLI path not found in docker argv"
email_line="$(grep -n -x -- '--email' "$CAPTURE_TXT" | head -n1 | cut -d: -f1)"
name_line="$(grep -n -x -- '--name' "$CAPTURE_TXT" | head -n1 | cut -d: -f1)"
password_line="$(grep -n -x -- '--password' "$CAPTURE_TXT" | head -n1 | cut -d: -f1)"
[[ -n "$email_line" ]] || fail "missing --email in docker argv"
[[ -n "$name_line" ]] || fail "missing --name in docker argv"
[[ -n "$password_line" ]] || fail "missing --password in docker argv"
[[ "$email_line" -gt "$cli_line" ]] || fail "--email must follow dist/cli/admin-create.js"
[[ "$name_line" -gt "$cli_line" ]] || fail "--name must follow dist/cli/admin-create.js"
[[ "$password_line" -gt "$cli_line" ]] || fail "--password must follow dist/cli/admin-create.js"

grep -qx 'director@example.com' "$CAPTURE_TXT" || fail "missing email value"
grep -qx 'Director' "$CAPTURE_TXT" || fail "missing name value"
grep -qx 'test-password-12' "$CAPTURE_TXT" || fail "missing password value"

# Ensure we did not fall back to tsx / source tree.
if grep -E -q 'tsx|/app/scripts/|src/cli/admin-create\.ts' "$CAPTURE_TXT"; then
  fail "docker argv must use compiled dist/cli only (no tsx/src)"
fi

pass "admin-create.sh forwards --email/--name/--password to node dist/cli/admin-create.js"
