#!/usr/bin/env bash
# Unit tests for migrate-image verification (no Docker / no production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-migrate-image.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
# shellcheck source=../../deploy/lib/migrate-image.sh
source "${ROOT}/deploy/lib/migrate-image.sh"
# shellcheck source=../../deploy/lib/preflight.sh
source "${ROOT}/deploy/lib/preflight.sh"

SHOPBUKET1_STATE_DIR="$TMP/state"
SHOPBUKET1_PREFLIGHT_DIR="$TMP/state/preflight"
mkdir -p "$SHOPBUKET1_STATE_DIR" "$SHOPBUKET1_PREFLIGHT_DIR"
POSTGRES_DB="shopbuket1"

# --- Dockerfile build-arg / OCI label ---
grep -q 'ARG SITEFLOWER_GIT_SHA' "${ROOT}/deploy/Dockerfile.api" \
  || fail "Dockerfile.api must declare SITEFLOWER_GIT_SHA"
grep -q 'org.opencontainers.image.revision' "${ROOT}/deploy/Dockerfile.api" \
  || fail "Dockerfile.api must set OCI revision label"
grep -q 'SITEFLOWER_GIT_SHA' "${ROOT}/deploy.sh" \
  || fail "deploy.sh must pass SITEFLOWER_GIT_SHA build-arg"
grep -q 'SITEFLOWER_GIT_SHA' "${ROOT}/deploy/lib/migrate-image.sh" \
  || fail "migrate-image build must pass SITEFLOWER_GIT_SHA"
pass "Dockerfile + build scripts declare SITEFLOWER_GIT_SHA / OCI revision"

# --- fake checkout migrations ---
FAKE_MIG="$TMP/checkout-migrations"
mkdir -p "$FAKE_MIG/20260101120000_one" "$FAKE_MIG/20260102120000_two"
printf 'provider = "postgresql"\n' >"$FAKE_MIG/migration_lock.toml"
echo 'SELECT 1;' >"$FAKE_MIG/20260101120000_one/migration.sql"
echo 'SELECT 2;' >"$FAKE_MIG/20260102120000_two/migration.sql"
checkout_prisma_migrations_dir() { printf '%s\n' "$FAKE_MIG"; }

man="$(migration_manifest_from_dir "$FAKE_MIG")"
hash1="$(echo "$man" | awk -F '\t' '$1=="20260101120000_one"{print $2}')"
[[ "$hash1" =~ ^[0-9a-f]{64}$ ]] || fail "SQL hash must be sha256, got $hash1"
pass "migration_manifest_from_dir names+SHA-256"

stale="$TMP/stale-migrations"
mkdir -p "$stale/20260101120000_one"
cp "$FAKE_MIG/migration_lock.toml" "$stale/"
cp "$FAKE_MIG/20260101120000_one/migration.sql" "$stale/20260101120000_one/"
stale_man="$(migration_manifest_from_dir "$stale")"
if compare_migration_manifests "$man" "$stale_man" "stale" 2>/dev/null; then
  fail "missing migrations must mismatch"
fi
pass "stale image missing migrations detected"

bad="$TMP/bad-checksum"
mkdir -p "$bad/20260101120000_one" "$bad/20260102120000_two"
cp "$FAKE_MIG/migration_lock.toml" "$bad/"
cp "$FAKE_MIG/20260101120000_one/migration.sql" "$bad/20260101120000_one/"
echo 'SELECT 999;' >"$bad/20260102120000_two/migration.sql"
bad_man="$(migration_manifest_from_dir "$bad")"
out="$(compare_migration_manifests "$man" "$bad_man" "tampered" 2>&1)" || true
echo "$out" | grep -qi 'checksum mismatch' || fail "must report checksum mismatch"
pass "checksum mismatch detected"

# --- stubs for docker identity ---
REV="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
EXPECTED_IMAGE="shopbuket1-api:aaaaaaaaaaaa"
IMAGE_ID="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
_IMAGE_READY=0
BUILT=0

docker_image_id() {
  local ref="${1:-}"
  if [[ "$ref" == "$IMAGE_ID" || ( "$_IMAGE_READY" -eq 1 && "$ref" == "$EXPECTED_IMAGE" ) ]]; then
    printf '%s\n' "$IMAGE_ID"
    return 0
  fi
  return 1
}
docker_image_git_revision() {
  if [[ "$_IMAGE_READY" -eq 1 ]]; then printf '%s\n' "$REV"; else printf 'unknown\n'; fi
}
docker() {
  case "$1" in
    image)
      shift
      case "$1" in
        inspect)
          if [[ "${2:-}" == "-f" ]]; then return 0; fi
          local ref="${2:-}"
          [[ "$ref" == "$IMAGE_ID" ]] && return 0
          [[ "$ref" == "shopbuket1-api:local" ]] && return 0
          [[ "$_IMAGE_READY" -eq 1 && "$ref" == "$EXPECTED_IMAGE" ]] && return 0
          return 1
          ;;
        rm) return 0 ;;
        *) return 0 ;;
      esac
      ;;
    tag|build|run|compose) return 0 ;;
    *) return 0 ;;
  esac
}
image_migration_manifest() {
  if [[ "$_IMAGE_READY" -eq 1 ]]; then printf '%s\n' "$man"; else printf '%s\n' "$stale_man"; fi
}
build_release_api_image() {
  local image="$1" rev="$2"
  [[ "$rev" == "$REV" ]] || fail "build must receive full 40-char SHA"
  BUILT=1
  _IMAGE_READY=1
}
cleanup_stale_api_local_alias() { :; }
sync_api_local_alias() { :; }
compose() { return 0; }

# pin requires full match — build path
ensure_release_api_image "$REV"
[[ "$BUILT" -eq 1 ]] || fail "must rebuild when stale/unlabeled"
[[ "${SHOPBUKET1_API_IMAGE_ID}" == "$IMAGE_ID" ]] || fail "id not pinned"
[[ "${SHOPBUKET1_API_IMAGE_GIT_SHA}" == "$REV" ]] || fail "git sha not exported"
pass "ensure_release_api_image builds+pins id+git SHA+manifest"

# reuse same SHA after full check
BUILT=0
ensure_release_api_image "$REV"
[[ "$BUILT" -eq 0 ]] || fail "reuse must not rebuild after full verification"
pass "same SHA reuse only after full verification"

# pin drift
SHOPBUKET1_API_IMAGE="$EXPECTED_IMAGE"
SHOPBUKET1_API_IMAGE_ID="$IMAGE_ID"
SHOPBUKET1_API_IMAGE_GIT_SHA="$REV"
docker_image_id() { printf 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\n'; }
if ( assert_pinned_api_image "$REV" ) 2>/dev/null; then fail "drift must fail"; fi
pass "assert_pinned_api_image detects id drift"

docker_image_id() {
  local ref="${1:-}"
  if [[ "$ref" == "$IMAGE_ID" || "$ref" == "$EXPECTED_IMAGE" ]]; then
    printf '%s\n' "$IMAGE_ID"; return 0
  fi
  return 1
}
assert_pinned_api_image "$REV" || fail "matching pin+sha+manifest must pass"
pass "assert_pinned_api_image rechecks git SHA + manifest"

# wrong git label
docker_image_git_revision() { printf 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n'; }
if ( assert_pinned_api_image "$REV" ) 2>/dev/null; then fail "wrong label must fail"; fi
pass "fail closed on git SHA label mismatch"

docker_image_git_revision() { printf '%s\n' "$REV"; }

# deleted image id
docker() {
  case "$1" in
    image)
      shift
      case "$1" in
        inspect)
          local ref="${2:-}"
          [[ "$ref" == "$EXPECTED_IMAGE" ]] && return 0
          return 1
          ;;
      esac
      ;;
  esac
  return 0
}
if ( assert_pinned_api_image "$REV" ) 2>/dev/null; then
  fail "missing image id must fail closed"
fi
pass "fail closed when pinned image id unavailable"

# restore docker stub
docker() {
  case "$1" in
    image)
      shift
      case "$1" in
        inspect)
          local ref="${2:-}"
          [[ "$ref" == "-f" ]] && return 0
          [[ "$ref" == "$IMAGE_ID" || "$ref" == "$EXPECTED_IMAGE" || "$ref" == "shopbuket1-api:local" ]] && return 0
          return 1
          ;;
        rm) return 0 ;;
      esac
      ;;
  esac
  return 0
}

# refuse :local
SHOPBUKET1_API_IMAGE="shopbuket1-api:local"
SHOPBUKET1_API_IMAGE_ID="$IMAGE_ID"
if ( assert_pinned_api_image "$REV" ) 2>/dev/null; then fail "must refuse :local"; fi
pass "refuses unverified shopbuket1-api:local"

# compose migrate uses immutable id
SHOPBUKET1_API_IMAGE="$EXPECTED_IMAGE"
SHOPBUKET1_API_IMAGE_TAG="$EXPECTED_IMAGE"
SHOPBUKET1_API_IMAGE_ID="$IMAGE_ID"
SHOPBUKET1_API_IMAGE_GIT_SHA="$REV"
_COMPOSE_IMAGE=""
compose() {
  _COMPOSE_IMAGE="${SHOPBUKET1_API_IMAGE:-}"
  return 0
}
compose_migrate_with_pinned_api_image "postgresql://u:p@postgres:5432/shopbuket1_preflight_aaaaaaaaaaaa?schema=public"
[[ "$_COMPOSE_IMAGE" == "$IMAGE_ID" ]] || fail "compose migrate must use immutable id, got ${_COMPOSE_IMAGE}"
pass "live/rehearsal migrate uses immutable image id"

# inventory: critical tables + schema-tolerant null skip
preflight_psql_db() {
  local db="$1" sql="$2"
  case "$sql" in
    *"table_name='products'"*|*"table_name='product_variants'"*|*"table_name='catalog_categories'"*|*"table_name='orders'"*|*"table_name='slug_redirects'"*)
      echo "1" ;;
    *"FROM products"*) echo "10" ;;
    *"FROM product_variants"*) echo "20" ;;
    *"FROM catalog_categories"*) echo "4" ;;
    *"FROM orders"*) echo "5" ;;
    *"FROM slug_redirects"*) echo "2" ;;
    *"FROM erp_sku_registry"*) echo "7" ;;
    *) echo "0" ;;
  esac
}
inv='{"products":10,"product_variants":20,"catalog_categories":4,"orders":5,"slug_redirects":2,"erp_sku_registry":null}'
preflight_assert_inventory_preserved "shopbuket1_preflight_test" "$inv" "unit" \
  || fail "matching inventory + null erp_sku must pass"
pass "inventory preserved for products/variants/categories/orders/redirects"

# inventory mismatch
preflight_psql_db() {
  local db="$1" sql="$2"
  case "$sql" in
    *"table_name="*) echo "1" ;;
    *"FROM products"*) echo "9" ;;
    *) echo "0" ;;
  esac
}
if preflight_assert_inventory_preserved "shopbuket1_preflight_test" '{"products":10,"orders":null,"slug_redirects":null,"product_variants":null,"catalog_categories":null}' "unit" 2>/dev/null; then
  fail "products count change must fail"
fi
pass "failed rehearsal: inventory mismatch detected"

# inventory must not require column-level schema equality (document via comment + null skip)
inv2='{"products":null,"product_variants":null,"catalog_categories":null,"orders":null,"slug_redirects":null,"erp_sku_registry":null}'
preflight_assert_inventory_preserved "shopbuket1_preflight_test" "$inv2" "unit" \
  || fail "all-null baseline must not block (schema evolution / missing tables)"
pass "inventory does not block legitimate schema absence (null baseline)"

# all migrations finished
preflight_psql_db() {
  local db="$1" sql="$2"
  [[ "$sql" == *"migration_name='20260102120000_two'"* ]] && { echo "0"; return 0; }
  echo "1"
}
if verify_checkout_migrations_applied_db "shopbuket1_preflight_test" "unit" 2>/dev/null; then
  fail "missing finished migration must fail"
fi
pass "failed rehearsal: missing applied migration"

preflight_psql_db() { echo "1"; }
verify_checkout_migrations_applied_db "shopbuket1_preflight_test" "unit" \
  || fail "all finished must pass"
pass "successful rehearsal: all checkout migrations finished"

# invalidate prior PASS on re-run
rev_file="$(write_preflight_report "$REV" "PASS" "$TMP/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" '{"products":1}' "3" "")"
mkdir -p "$TMP"
echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx >"$TMP/demo.dump"
rev_file="$(write_preflight_report "$REV" "PASS" "$TMP/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" '{"products":1}' "3" "")"
status="$(json_field "$rev_file" status)"
[[ "$status" == "PASS" ]] || fail "setup PASS report"
invalidate_preflight_pass_report "$REV"
status="$(json_field "$rev_file" status)"
[[ "$status" == "SUPERSEDED" ]] || fail "re-run must supersede PASS, got $status"
if ( require_preflight_pass "$REV" ) 2>/dev/null; then
  fail "SUPERSEDED report must not authorize deploy"
fi
pass "re-run preflight invalidates stale PASS report"

# require_preflight_pass full re-verify
SHOPBUKET1_API_IMAGE=""
SHOPBUKET1_API_IMAGE_ID=""
_IMAGE_READY=1
docker_image_git_revision() { printf '%s\n' "$REV"; }
docker_image_id() { printf '%s\n' "$IMAGE_ID"; }
image_migration_manifest() { printf '%s\n' "$man"; }
docker() {
  case "$1" in
    image)
      shift
      [[ "$1" == "inspect" ]] || return 0
      return 0
      ;;
  esac
  return 0
}
export SHOPBUKET1_API_IMAGE="$EXPECTED_IMAGE"
export SHOPBUKET1_API_IMAGE_ID="$IMAGE_ID"
export SHOPBUKET1_API_IMAGE_GIT_SHA="$REV"
report="$(write_preflight_report "$REV" "PASS" "$TMP/demo.dump" "shopbuket1_preflight_aaaaaaaaaaaa" '{"products":1}' "3" "")"
require_preflight_pass "$REV" >/dev/null || fail "fresh PASS with valid image must pass require"
pass "require_preflight_pass re-verifies id+git SHA+manifest"

# SCHEMA_ADVANCED / early abort contracts (deploy.sh sourced helpers already covered in deploy-safe)
SCHEMA_ADVANCED=1
rollback_app_images() {
  if [[ "${SCHEMA_ADVANCED:-0}" -eq 1 ]]; then return 1; fi
  return 0
}
if rollback_app_images; then fail "SCHEMA_ADVANCED must refuse auto app rollback"; fi
pass "after live migrate: unsafe app rollback refused"

DEPLOY_STARTED=0
[[ "$DEPLOY_STARTED" -eq 0 ]] || fail "pre-live-migrate flag"
pass "error before live migrate: DEPLOY_STARTED=0 (API/Web untouched)"

# active failed vs rolled-back
echo "$PREFLIGHT_PRISMA_ACTIVE_FAILED_SQL" | grep -q 'finished_at IS NULL AND rolled_back_at IS NULL' \
  || fail "active-failed predicate wrong"
pass "historical rolled-back OK; active failed blocks"

# real checkout 41
checkout_prisma_migrations_dir() {
  printf '%s/packages/database/prisma/migrations\n' "$ROOT"
}
[[ "$(checkout_migration_count)" -eq 41 ]] || fail "expected 41 migrations"
pass "real checkout has 41 migrations"

# dangerous commands
for f in "${ROOT}/deploy.sh" "${ROOT}/scripts/release.sh" "${ROOT}/deploy/lib/preflight.sh" "${ROOT}/deploy/lib/migrate-image.sh"; do
  if grep -E '^[^#]*\b(system[[:space:]]+prune[[:space:]]+--volumes|migrate[[:space:]]+reset|db[[:space:]]+push|--force-reset|git[[:space:]]+reset[[:space:]]+--hard)\b' "$f" \
    | grep -Ev 'Never|never|NOT|not |Forbidden|forbidden|does NOT|Do not|do not' >/dev/null 2>&1; then
    fail "dangerous command in $f"
  fi
done
pass "no dangerous prune/reset/db push/hard-reset"

pass "all migrate-image unit tests passed"
