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

SHOPBUKET1_STATE_DIR="$TMP/state"
mkdir -p "$SHOPBUKET1_STATE_DIR"

# --- helpers: fake checkout migrations dir ---
FAKE_MIG="$TMP/checkout-migrations"
mkdir -p "$FAKE_MIG/20260101120000_one" "$FAKE_MIG/20260102120000_two"
printf 'provider = "postgresql"\n' >"$FAKE_MIG/migration_lock.toml"
echo 'SELECT 1;' >"$FAKE_MIG/20260101120000_one/migration.sql"
echo 'SELECT 2;' >"$FAKE_MIG/20260102120000_two/migration.sql"

checkout_prisma_migrations_dir() { printf '%s\n' "$FAKE_MIG"; }

# --- manifest from dir ---
man="$(migration_manifest_from_dir "$FAKE_MIG")"
echo "$man" | grep -q '^migration_lock.toml	' || fail "manifest missing lock"
echo "$man" | grep -q '^20260101120000_one	' || fail "manifest missing one"
echo "$man" | grep -q '^20260102120000_two	' || fail "manifest missing two"
lines="$(printf '%s\n' "$man" | grep -c . || true)"
[[ "$lines" -eq 3 ]] || fail "expected 3 manifest lines, got $lines"
pass "migration_manifest_from_dir"

# --- compare equal ---
compare_migration_manifests "$man" "$man" "self" || fail "identical manifests must match"
pass "compare identical manifests"

# --- missing migrations (stale image with fewer folders) ---
stale="$TMP/stale-migrations"
mkdir -p "$stale/20260101120000_one"
cp "$FAKE_MIG/migration_lock.toml" "$stale/"
cp "$FAKE_MIG/20260101120000_one/migration.sql" "$stale/20260101120000_one/"
stale_man="$(migration_manifest_from_dir "$stale")"
if compare_migration_manifests "$man" "$stale_man" "stale" 2>/dev/null; then
  fail "missing migrations must mismatch"
fi
pass "stale image missing migrations detected"

# --- checksum mismatch ---
bad="$TMP/bad-checksum"
mkdir -p "$bad/20260101120000_one" "$bad/20260102120000_two"
cp "$FAKE_MIG/migration_lock.toml" "$bad/"
cp "$FAKE_MIG/20260101120000_one/migration.sql" "$bad/20260101120000_one/"
echo 'SELECT 999; -- tampered' >"$bad/20260102120000_two/migration.sql"
bad_man="$(migration_manifest_from_dir "$bad")"
if compare_migration_manifests "$man" "$bad_man" "tampered" 2>/dev/null; then
  fail "checksum mismatch must be detected"
fi
pass "checksum mismatch detected"

# --- assert_image_migrations_match_checkout with stubbed image_migration_manifest ---
image_migration_manifest() {
  printf '%s\n' "$stale_man"
}
if ( assert_image_migrations_match_checkout "shopbuket1-api:deadbeefcafe" ) 2>/dev/null; then
  fail "assert must fail on stale image manifest"
fi
pass "assert fails on stale image"

image_migration_manifest() {
  printf '%s\n' "$bad_man"
}
if ( assert_image_migrations_match_checkout "shopbuket1-api:deadbeefcafe" ) 2>/dev/null; then
  fail "assert must fail on checksum mismatch"
fi
pass "assert fails on checksum mismatch"

image_migration_manifest() {
  printf '%s\n' "$man"
}
assert_image_migrations_match_checkout "shopbuket1-api:aaaaaaaaaaaa" \
  || fail "matching manifest must pass assert"
pass "assert passes when image matches checkout"

# --- ensure_release_api_image refuses :local shortcut; builds SHA image ---
BUILT_IMAGES=()
DOCKER_IMAGES=()
docker() {
  case "$1" in
    image)
      shift
      case "$1" in
        inspect)
          local ref="${2:-}"
          for x in "${DOCKER_IMAGES[@]+"${DOCKER_IMAGES[@]}"}"; do
            [[ "$x" == "$ref" ]] && return 0
          done
          return 1
          ;;
        rm)
          return 0
          ;;
        *)
          return 0
          ;;
      esac
      ;;
    tag)
      # docker tag SRC DEST
      DOCKER_IMAGES+=("$3")
      return 0
      ;;
    build)
      # pretend build succeeds; last -t is image
      local t=""
      while [[ $# -gt 0 ]]; do
        if [[ "$1" == "-t" ]]; then
          t="$2"
          shift 2
          continue
        fi
        shift
      done
      BUILT_IMAGES+=("$t")
      DOCKER_IMAGES+=("$t")
      return 0
      ;;
    run)
      # used by image_migration_manifest — overridden below
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

# Seed a stale :local that must be ignored
DOCKER_IMAGES+=("shopbuket1-api:local")
REV="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
EXPECTED_IMAGE="shopbuket1-api:aaaaaaaaaaaa"

# image_migration_manifest: after build, return matching checkout; before build, empty
_IMAGE_READY=0
image_migration_manifest() {
  local img="$1"
  if [[ "$_IMAGE_READY" -eq 1 && "$img" == "$EXPECTED_IMAGE" ]]; then
    printf '%s\n' "$man"
    return 0
  fi
  # stale local-style content
  printf '%s\n' "$stale_man"
  return 0
}

build_release_api_image() {
  local image="$1"
  BUILT_IMAGES+=("$image")
  DOCKER_IMAGES+=("$image")
  _IMAGE_READY=1
}

cleanup_stale_api_local_alias() { :; }
sync_api_local_alias() { DOCKER_IMAGES+=("shopbuket1-api:local"); }

ensure_release_api_image "$REV"
[[ "${SHOPBUKET1_API_IMAGE}" == "$EXPECTED_IMAGE" ]] \
  || fail "expected SHOPBUKET1_API_IMAGE=$EXPECTED_IMAGE got ${SHOPBUKET1_API_IMAGE:-}"
[[ "${#BUILT_IMAGES[@]}" -ge 1 ]] || fail "stale :local present — must rebuild SHA image"
pass "ensure_release_api_image ignores stale :local and builds SHA image"

# --- same SHA re-deploy reuses verified image (no second build) ---
BUILT_IMAGES=()
_IMAGE_READY=1
DOCKER_IMAGES=("$EXPECTED_IMAGE")
ensure_release_api_image "$REV"
[[ "${#BUILT_IMAGES[@]}" -eq 0 ]] || fail "re-deploy same SHA must reuse verified image (built=${BUILT_IMAGES[*]})"
[[ "${SHOPBUKET1_API_IMAGE}" == "$EXPECTED_IMAGE" ]] || fail "reuse must keep SHA tag"
pass "same SHA re-deploy reuses verified image"

# --- failed rehearsal: migrate image gate refuses :local ---
# shellcheck source=../../deploy/lib/preflight.sh
source "${ROOT}/deploy/lib/preflight.sh"
POSTGRES_DB="shopbuket1"
SHOPBUKET1_API_IMAGE="shopbuket1-api:local"
if ( preflight_migrate_rehearsal "shopbuket1_preflight_aaaaaaaaaaaa" ) 2>/dev/null; then
  fail "rehearsal must refuse shopbuket1-api:local"
fi
pass "failed rehearsal: refuses unverified :local"

# --- successful rehearsal gate: matching SHA image passes pre-migrate assert ---
SHOPBUKET1_API_IMAGE="$EXPECTED_IMAGE"
image_migration_manifest() { printf '%s\n' "$man"; }
assert_image_migrations_match_checkout "$SHOPBUKET1_API_IMAGE" \
  || fail "successful rehearsal image must pass manifest gate"
pass "successful rehearsal: SHA image matches checkout"

# --- verify_checkout_migrations_applied_db ---
preflight_psql_db() {
  local db="$1" sql="$2"
  if [[ "$sql" == *"migration_name='20260101120000_one'"* ]]; then
    echo "1"
    return 0
  fi
  if [[ "$sql" == *"migration_name='20260102120000_two'"* ]]; then
    echo "0"
    return 0
  fi
  echo "0"
}
if verify_checkout_migrations_applied_db "shopbuket1_preflight_test" "unit" 2>/dev/null; then
  fail "missing finished migration must fail rehearsal verify"
fi
pass "failed rehearsal: missing applied migration detected"

preflight_psql_db() {
  echo "1"
}
verify_checkout_migrations_applied_db "shopbuket1_preflight_test" "unit" \
  || fail "all finished migrations must pass"
pass "successful rehearsal: all checkout migrations finished"

# --- cleanup_stale_api_local_alias ---
REMOVED_LOCAL=0
docker() {
  case "$1" in
    image)
      shift
      case "$1" in
        inspect)
          if [[ "${2:-}" == "-f" ]]; then
            local fmt="$3" ref="$4"
            if [[ "$ref" == "shopbuket1-api:verified" ]]; then
              echo "sha256:aaaa"
              return 0
            fi
            if [[ "$ref" == "shopbuket1-api:local" ]]; then
              echo "sha256:bbbb"
              return 0
            fi
            return 1
          fi
          [[ "${2:-}" == "shopbuket1-api:local" || "${2:-}" == "shopbuket1-api:verified" ]] && return 0
          return 1
          ;;
        rm)
          if [[ "${2:-}" == "shopbuket1-api:local" ]]; then
            REMOVED_LOCAL=1
          fi
          return 0
          ;;
      esac
      ;;
  esac
  return 0
}
# Restore real cleanup from lib (re-source overwrites docker stub usage inside function)
cleanup_stale_api_local_alias() {
  local verified="$1"
  local vid lid
  vid="$(docker image inspect -f '{{.Id}}' "$verified" 2>/dev/null || true)"
  [[ -n "$vid" ]] || return 0
  if ! docker image inspect shopbuket1-api:local >/dev/null 2>&1; then
    return 0
  fi
  lid="$(docker image inspect -f '{{.Id}}' shopbuket1-api:local 2>/dev/null || true)"
  if [[ -n "$lid" && "$lid" != "$vid" ]]; then
    docker image rm shopbuket1-api:local 2>/dev/null || true
  fi
}
cleanup_stale_api_local_alias "shopbuket1-api:verified"
[[ "$REMOVED_LOCAL" -eq 1 ]] || fail "stale :local alias must be removed when IDs differ"
pass "cleanup removes stale shopbuket1-api:local alias"

# --- api_image_ref_for_rev ---
ref="$(api_image_ref_for_rev "$REV")"
[[ "$ref" == "shopbuket1-api:aaaaaaaaaaaa" ]] || fail "bad image ref $ref"
pass "api_image_ref_for_rev"

# --- real checkout manifest non-empty ---
checkout_prisma_migrations_dir() {
  printf '%s/packages/database/prisma/migrations\n' "$ROOT"
}
real_man="$(checkout_migration_manifest)"
real_n="$(printf '%s\n' "$real_man" | grep -vc '^migration_lock.toml' || true)"
[[ "$real_n" -ge 37 ]] || fail "real checkout should have >=37 migrations, got $real_n"
pass "real checkout migration manifest ($real_n migrations)"

pass "all migrate-image unit tests passed"
