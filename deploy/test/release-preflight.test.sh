#!/usr/bin/env bash
# Unit tests for release preflight helpers (no production Docker required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-release-preflight.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
SHOPBUKET1_STATE_DIR="$TMP/state"
SHOPBUKET1_BACKUP_DIR="$TMP/backups"
SHOPBUKET1_PREFLIGHT_DIR="$TMP/state/preflight"
SHOPBUKET1_LOCK_FILE="$TMP/state/deploy.lock"
mkdir -p "$SHOPBUKET1_STATE_DIR" "$SHOPBUKET1_BACKUP_DIR" "$SHOPBUKET1_PREFLIGHT_DIR"

# shellcheck source=../../deploy/lib/preflight.sh
source "${ROOT}/deploy/lib/preflight.sh"

POSTGRES_DB="shopbuket1"

# --- assert_preflight_db_name ---
# die() exits the shell — rejection cases must run in a subshell.
assert_preflight_db_name "shopbuket1_preflight_abc123" || fail "valid name rejected"
if ( assert_preflight_db_name "shopbuket1" ) 2>/dev/null; then
  fail "production-like name must be rejected"
fi
if ( assert_preflight_db_name "erpbuket1_preflight_x" ) 2>/dev/null; then
  fail "ERP-ish name must be rejected"
fi
if ( assert_preflight_db_name "$POSTGRES_DB" ) 2>/dev/null; then
  fail "exact production DB name must be rejected"
fi
pass "assert_preflight_db_name guards"

# --- write + require preflight report ---
rev="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
inv='{"products":1,"orders":0}'
report="$(write_preflight_report "$rev" "PASS" "$TMP/backups/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" "$inv" "3" "")"
[[ -f "$report" ]] || fail "report not written"
# fake backup file
mkdir -p "$TMP/backups"
echo "not-a-real-dump-but-large-enough-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" >"$TMP/backups/demo.dump"
# rewrite with existing backup path
report="$(write_preflight_report "$rev" "PASS" "$TMP/backups/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" "$inv" "3" "")"
require_preflight_pass "$rev" >/dev/null || fail "require_preflight_pass should accept PASS"
pass "preflight PASS report accepted"

# FAIL status rejected
write_preflight_report "$rev" "FAIL" "$TMP/backups/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" "$inv" "3" "migrate_failed" >/dev/null
if ( require_preflight_pass "$rev" ) 2>/dev/null; then
  fail "FAIL report must not authorize deploy"
fi
pass "preflight FAIL report rejected"

# Wrong revision rejected
if ( require_preflight_pass "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ) 2>/dev/null; then
  fail "missing revision report must fail"
fi
pass "missing revision rejected"

# --- release.sh help ---
bash "${ROOT}/scripts/release.sh" --help >/dev/null || fail "release.sh --help"
pass "release.sh --help"

# --- seo check helper sources ---
# shellcheck source=../../deploy/lib/health.sh
source "${ROOT}/deploy/lib/health.sh"
SHOPBUKET1_HEALTH_QUIET=1
# Without a web server, seo mode should fail (permanent or transient) — just ensure it runs.
rc=0
run_healthcheck_mode seo || rc=$?
[[ "$rc" -ne 0 ]] || fail "seo mode against missing web should not silently PASS"
pass "seo health mode fails closed without web"

pass "all release-preflight unit tests passed"
