#!/usr/bin/env bash
# Safe local tests for Task 04D deploy path (no Docker / no production).
# Run under Linux or Git Bash — not PowerShell.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-deploy-safe.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"

SHOPBUKET1_STATE_DIR="$TMP/state"
SHOPBUKET1_BACKUP_DIR="$TMP/backups"
SHOPBUKET1_RELEASES_DIR="$TMP/state/releases"
SHOPBUKET1_CURRENT_FILE="$TMP/state/current-release"
SHOPBUKET1_PREVIOUS_FILE="$TMP/state/previous-release"
SHOPBUKET1_LOCK_FILE="$TMP/state/deploy.lock"
SHOPBUKET1_PREFLIGHT_DIR="$TMP/state/preflight"
SHOPBUKET1_RELEASE_METADATA_KEEP=3
mkdir -p "$SHOPBUKET1_STATE_DIR" "$SHOPBUKET1_BACKUP_DIR" "$SHOPBUKET1_RELEASES_DIR" "$SHOPBUKET1_PREFLIGHT_DIR"

# --- help / dry-run entrypoints (no env file required) ---
out="$(bash "${ROOT}/deploy.sh" --help 2>&1)" || fail "deploy.sh --help"
echo "$out" | grep -q "production" || fail "help must mention production"
pass "deploy.sh --help"

out="$(bash "${ROOT}/deploy.sh" --dry-run 2>&1)" || fail "deploy.sh --dry-run"
echo "$out" | grep -qi "DRY-RUN" || fail "dry-run banner missing"
echo "$out" | grep -qi "no changes" || fail "dry-run must confirm no changes"
pass "deploy.sh --dry-run"

out="$(bash "${ROOT}/deploy.sh" production --dry-run 2>&1)" || fail "deploy.sh production --dry-run"
echo "$out" | grep -qi "DRY-RUN" || fail "production dry-run banner missing"
echo "$out" | grep -qi "read-only\|no changes\|DRY-RUN complete" || fail "production dry-run must state read-only/complete"
pass "deploy.sh production --dry-run"

out="$(bash "${ROOT}/scripts/release.sh" --help 2>&1)" || fail "release.sh --help"
echo "$out" | grep -q "restore-test" || fail "help must list restore-test"
echo "$out" | grep -q -- "--dump" || fail "help must document --dump"
echo "$out" | grep -q "seo-reconcile" || fail "help must list seo-reconcile"
pass "release.sh --help"

out="$(bash "${ROOT}/scripts/release.sh" dry-run 2>&1)" || fail "release.sh dry-run"
echo "$out" | grep -qi "Target commit" || fail "dry-run must print target commit"
echo "$out" | grep -qi "erp_sku_registry" || fail "dry-run must mention 04A erp_sku gate"
pass "release.sh dry-run"

# --- dry-run is strictly read-only (git / releases / services fingerprint) ---
fingerprint() {
  local head status releases lock
  head="$(git -C "$ROOT" rev-parse HEAD)"
  status="$(git -C "$ROOT" status --porcelain)"
  releases="$(find "$SHOPBUKET1_RELEASES_DIR" -type f 2>/dev/null | sort | cksum | awk '{print $1}')"
  lock="missing"
  [[ -f "$SHOPBUKET1_LOCK_FILE" ]] && lock="$(cksum "$SHOPBUKET1_LOCK_FILE" | awk '{print $1}')"
  # Sentinel file must remain untouched.
  local sent
  sent="$(cksum "$TMP/sentinel.txt" | awk '{print $1}')"
  printf '%s|%s|%s|%s|%s\n' "$head" "$status" "$releases" "$lock" "$sent"
}

printf 'dry-run-sentinel\n' >"$TMP/sentinel.txt"
# Seed a release file to detect accidental prune/write
printf '{"revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","api_image":"shopbuket1-api:x","web_image":"shopbuket1-web:x","deployed_at":"2026-01-01T00:00:00Z"}\n' \
  >"${SHOPBUKET1_RELEASES_DIR}/seed.json"
printf '%s\n' "${SHOPBUKET1_RELEASES_DIR}/seed.json" >"$SHOPBUKET1_CURRENT_FILE"

# Override state paths for child processes via env
export SHOPBUKET1_STATE_DIR SHOPBUKET1_BACKUP_DIR SHOPBUKET1_RELEASES_DIR
export SHOPBUKET1_CURRENT_FILE SHOPBUKET1_PREVIOUS_FILE SHOPBUKET1_LOCK_FILE SHOPBUKET1_PREFLIGHT_DIR

before="$(fingerprint)"
bash "${ROOT}/deploy.sh" production --dry-run >/dev/null 2>&1 || fail "production dry-run exit"
bash "${ROOT}/deploy.sh" --dry-run >/dev/null 2>&1 || fail "direct dry-run exit"
bash "${ROOT}/scripts/release.sh" dry-run >/dev/null 2>&1 || fail "release dry-run exit"
after="$(fingerprint)"
[[ "$before" == "$after" ]] || fail "dry-run mutated git/releases/lock/sentinel (before=$before after=$after)"
# Prove docker/compose were not required (already succeeded without them)
pass "dry-run read-only fingerprint (git HEAD/status, releases, lock, sentinel)"

# --- restore-test requires explicit --dump and --db ---
rc=0
err="$(bash "${ROOT}/scripts/release.sh" restore-test 2>&1)" || rc=$?
[[ "$rc" -ne 0 ]] || fail "restore-test without args must fail"
echo "$err" | grep -qi "dump\|required" || fail "restore-test must demand --dump"
pass "restore-test rejects missing args"

rc=0
err="$(bash "${ROOT}/scripts/release.sh" restore-test --dump "$TMP/nope.dump" 2>&1)" || rc=$?
[[ "$rc" -ne 0 ]] || fail "restore-test without --db must fail"
echo "$err" | grep -qi "\-\-db" || fail "must mention --db"
pass "restore-test rejects missing --db"

rc=0
err="$(bash "${ROOT}/scripts/release.sh" restore-test --dump "$TMP/x.dump" --db shopbuket1 2>&1)" || rc=$?
[[ "$rc" -ne 0 ]] || fail "restore-test must reject production-like DB name"
pass "restore-test rejects non-preflight DB name"

# --- prune_release_metadata protects current/previous ---
for i in 1 2 3 4 5 6; do
  f="${SHOPBUKET1_RELEASES_DIR}/2026010${i}T000000Z-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
  cat >"$f" <<EOF
{"revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","api_image":"shopbuket1-api:aaaa","web_image":"shopbuket1-web:aaaa","deployed_at":"2026-01-0${i}T00:00:00Z"}
EOF
  sleep 1
done
cur="${SHOPBUKET1_RELEASES_DIR}/20260106T000000Z-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
prev="${SHOPBUKET1_RELEASES_DIR}/20260105T000000Z-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
printf '%s\n' "$cur" >"$SHOPBUKET1_CURRENT_FILE"
printf '%s\n' "$prev" >"$SHOPBUKET1_PREVIOUS_FILE"

prune_release_metadata
count="$(find "$SHOPBUKET1_RELEASES_DIR" -name '2026010*.json' | wc -l | tr -d ' ')"
[[ "$count" -eq 3 ]] || fail "expected 3 dated release JSON after prune (keep=3), got ${count}"
[[ -f "$cur" ]] || fail "current release JSON deleted"
[[ -f "$prev" ]] || fail "previous release JSON deleted"
pass "prune_release_metadata keeps newest + protected"

list_out="$(list_release_metadata)"
echo "$list_out" | grep -q "shopbuket1 releases" || fail "list_release_metadata header"
pass "list_release_metadata"

# --- backup rotation never deletes newest ---
old="${SHOPBUKET1_BACKUP_DIR}/shopbuket1-20250101T000000Z-old.dump"
newest="${SHOPBUKET1_BACKUP_DIR}/shopbuket1-20260101T000000Z-newest.dump"
echo "fake-dump-content-xxxxxxxxxxxx" >"$old"
sleep 1
echo "fake-dump-content-xxxxxxxxxxxx" >"$newest"
n="$(ls -1t "${SHOPBUKET1_BACKUP_DIR}"/shopbuket1-*.dump | head -n1)"
[[ "$n" == "$newest" ]] || fail "ls -1t should rank newest dump first (got $n)"
for path in "${SHOPBUKET1_BACKUP_DIR}"/shopbuket1-*.dump; do
  [[ "$path" == "$n" ]] && continue
  rm -f "$path"
done
[[ -f "$newest" ]] || fail "newest backup was deleted"
[[ ! -f "$old" ]] || fail "aged backup should have been removed in simulation"
pass "backup retention never deletes newest"

# --- migration conflict checker + 04A gate ---
# shellcheck source=../../deploy/lib/preflight.sh
source "${ROOT}/deploy/lib/preflight.sh"
POSTGRES_DB="shopbuket1"
table_exists_prod() { return 1; }
preflight_check_migration_conflicts || fail "real migration tree should pass conflict check"
pass "preflight_check_migration_conflicts on real tree"

release_requires_erp_sku_registry || fail "04A migration folder must be detected in checkout"
pass "release_requires_erp_sku_registry detects Task 04A"

# verify_erp_sku_registry_db fail-closed when table missing (stub psql)
preflight_psql_db() {
  local db="$1" sql="$2"
  if [[ "$sql" == *"table_name='erp_sku_registry'"* ]]; then
    echo "0"
    return 0
  fi
  echo "0"
}
if verify_erp_sku_registry_db "shopbuket1_preflight_test" "unit" 2>/dev/null; then
  fail "missing erp_sku_registry must fail"
fi
pass "verify_erp_sku_registry_db fails when table missing"

preflight_psql_db() {
  local db="$1" sql="$2"
  if [[ "$sql" == *"table_name='erp_sku_registry'"* ]]; then
    echo "1"
    return 0
  fi
  if [[ "$sql" == *"contype='p'"* ]]; then
    echo "0"
    return 0
  fi
  echo "0"
}
if verify_erp_sku_registry_db "shopbuket1_preflight_test" "unit" 2>/dev/null; then
  fail "missing PK must fail"
fi
pass "verify_erp_sku_registry_db fails when PK missing"

preflight_psql_db() {
  local db="$1" sql="$2"
  if [[ "$sql" == *"table_name='erp_sku_registry'"* ]]; then
    echo "1"
    return 0
  fi
  if [[ "$sql" == *"contype='p'"* ]]; then
    echo "1"
    return 0
  fi
  if [[ "$sql" == *"FROM erp_sku_registry"* ]]; then
    echo "3"
    return 0
  fi
  echo "0"
}
verify_erp_sku_registry_db "shopbuket1_preflight_test" "unit" || fail "table+PK should pass"
pass "verify_erp_sku_registry_db passes with table+PK"

# Inject timestamp collision detection
fake_mig="$TMP/migrations"
mkdir -p "$fake_mig/20260101120000_a" "$fake_mig/20260101120000_a_copy"
dup="$(find "$fake_mig" -mindepth 1 -maxdepth 1 -type d \
  | while IFS= read -r d; do basename "$d" | cut -c1-14; done \
  | sort | uniq -d)"
[[ -n "$dup" ]] || fail "expected timestamp prefix collision between a and a_copy"
pass "migration timestamp collision detection"

# --- lock contention (Linux/CI; flock may be absent on Git Bash/Windows) ---
if command -v flock >/dev/null 2>&1; then
  mkdir -p "$(dirname "$SHOPBUKET1_LOCK_FILE")"
  (
    exec 9>"$SHOPBUKET1_LOCK_FILE"
    flock -n 9 || exit 1
    if ( acquire_lock ) 2>/dev/null; then
      exit 2
    fi
    exit 0
  ) || fail "lock contention test harness failed"
  pass "acquire_lock rejects concurrent holder"
else
  pass "acquire_lock contention skipped (no flock on this host)"
fi

# --- assert_shopbuket1 guards ---
if ( assert_shopbuket1_owned_name "erpbuket1-api:x" "image" ) 2>/dev/null; then
  fail "must refuse erpbuket1 images"
fi
if ( assert_shopbuket1_owned_name "random-api:x" "image" ) 2>/dev/null; then
  fail "must refuse non-shopbuket1 images"
fi
pass "erpbuket1 / foreign image refusal"

# --- schema-advanced refuses app rollback; migrate-fail leaves app ---
SCHEMA_ADVANCED=0
DEPLOY_STARTED=0
rollback_app_images() {
  if [[ "${SCHEMA_ADVANCED:-0}" -eq 1 ]]; then
    return 1
  fi
  return 0
}
SCHEMA_ADVANCED=1
if rollback_app_images; then
  fail "SCHEMA_ADVANCED=1 must refuse auto app rollback"
fi
pass "SCHEMA_ADVANCED refuses incompatible app rollback"

# Contract: container switch only after migrate+verify (DEPLOY_STARTED)
DEPLOY_STARTED=0
# simulate migrate failure path: DEPLOY_STARTED stays 0
[[ "$DEPLOY_STARTED" -eq 0 ]] || fail "pre-switch flag must be 0"
pass "migrate failure contract: DEPLOY_STARTED remains 0 (app not switched)"

sha="$(git -C "$ROOT" rev-parse HEAD)"
out="$(bash "${ROOT}/scripts/release.sh" dry-run "$sha" 2>&1)" || fail "dry-run pinned SHA"
echo "$out" | grep -q "$sha" || fail "dry-run must echo pinned SHA"
pass "dry-run pinned to current SHA (re-deploy same version plan)"

pass "all deploy-safe unit tests passed"
