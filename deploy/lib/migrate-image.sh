#!/usr/bin/env bash
# API image selection + Prisma migration manifest verification for shopbuket1.
# shellcheck shell=bash
#
# Rehearsal and live migrate MUST use one immutable image ID built from the target Git SHA.
# Never trust shopbuket1-api:local without verifying it matches the checkout + pin.

PRISMA_MIGRATIONS_IMAGE_PATH="${PRISMA_MIGRATIONS_IMAGE_PATH:-/app/node_modules/@bouquet-one/database/prisma/migrations}"
SITEFLOWER_IMAGE_REVISION_LABEL="${SITEFLOWER_IMAGE_REVISION_LABEL:-org.opencontainers.image.revision}"

sha256_file() {
  local f="$1"
  [[ -f "$f" ]] || die "sha256_file: missing $f"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  else
    die "Need sha256sum or shasum for migration checksums"
  fi
}

api_image_ref_for_rev() {
  local rev="$1"
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "api_image_ref_for_rev expects 40-char SHA, got: ${rev}"
  printf 'shopbuket1-api:%s\n' "${rev:0:12}"
}

checkout_prisma_migrations_dir() {
  local root
  root="$(repo_root)"
  printf '%s/packages/database/prisma/migrations\n' "$root"
}

# Sorted lines: <migration_folder_or_lock>\t<sha256 of SQL (or lock)>
migration_manifest_from_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || {
    log "ERROR: migrations directory missing: $dir"
    return 1
  }
  if [[ -f "${dir}/migration_lock.toml" ]]; then
    printf 'migration_lock.toml\t%s\n' "$(sha256_file "${dir}/migration_lock.toml")"
  else
    printf 'migration_lock.toml\tMISSING\n'
  fi
  local d name
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    name="$(basename "$d")"
    if [[ -f "${d}/migration.sql" ]]; then
      printf '%s\t%s\n' "$name" "$(sha256_file "${d}/migration.sql")"
    else
      printf '%s\tNO_SQL\n' "$name"
    fi
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)
}

checkout_migration_manifest() {
  migration_manifest_from_dir "$(checkout_prisma_migrations_dir)"
}

checkout_migration_names() {
  local dir
  dir="$(checkout_prisma_migrations_dir)"
  find "$dir" -mindepth 1 -maxdepth 1 -type d \
    | while IFS= read -r d; do basename "$d"; done \
    | LC_ALL=C sort
}

checkout_migration_count() {
  checkout_migration_names | grep -c . || true
}

docker_image_id() {
  local ref="$1"
  docker image inspect -f '{{.Id}}' "$ref"
}

docker_image_git_revision() {
  local ref="$1"
  docker image inspect -f "{{index .Config.Labels \"${SITEFLOWER_IMAGE_REVISION_LABEL}\"}}" "$ref" 2>/dev/null || true
}

# Read migration manifest from a built API image (docker required).
image_migration_manifest() {
  local image="$1"
  [[ -n "$image" ]] || die "image_migration_manifest: empty image"
  # Allow sha256: digests or shopbuket1-api:* tags.
  if [[ "$image" != sha256:* ]]; then
    assert_shopbuket1_owned_name "${image%%:*}" "image-repo"
  fi
  docker image inspect "$image" >/dev/null 2>&1 \
    || die "API image not found: $image"
  # shellcheck disable=SC2016
  docker run --rm --entrypoint /bin/sh "$image" -c '
    set -eu
    DIR="'"${PRISMA_MIGRATIONS_IMAGE_PATH}"'"
    if [ ! -d "$DIR" ]; then
      echo "MISSING_MIGRATIONS_DIR" >&2
      exit 2
    fi
    if [ -f "$DIR/migration_lock.toml" ]; then
      printf "migration_lock.toml\t%s\n" "$(sha256sum "$DIR/migration_lock.toml" | awk "{print \$1}")"
    else
      printf "migration_lock.toml\tMISSING\n"
    fi
    find "$DIR" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort | while IFS= read -r d; do
      name=$(basename "$d")
      if [ -f "$d/migration.sql" ]; then
        printf "%s\t%s\n" "$name" "$(sha256sum "$d/migration.sql" | awk "{print \$1}")"
      else
        printf "%s\tNO_SQL\n" "$name"
      fi
    done
  '
}

compare_migration_manifests() {
  local expected="$1"
  local actual="$2"
  local label="${3:-image}"
  if [[ "$expected" == "$actual" ]]; then
    return 0
  fi
  log "FAIL migration manifest mismatch (${label} vs checkout) — names and SHA-256 of SQL must match"
  local name hash act_hash
  while IFS=$'\t' read -r name hash; do
    [[ -n "$name" ]] || continue
    act_hash="$(printf '%s\n' "$actual" | awk -F '\t' -v n="$name" '$1==n {print $2; exit}')"
    if [[ -z "$act_hash" ]]; then
      log "  missing in ${label}: ${name}"
    elif [[ "$act_hash" != "$hash" ]]; then
      log "  checksum mismatch ${name}: checkout=${hash} ${label}=${act_hash}"
    fi
  done <<<"$expected"
  while IFS=$'\t' read -r name hash; do
    [[ -n "$name" ]] || continue
    if ! printf '%s\n' "$expected" | awk -F '\t' -v n="$name" '$1==n {found=1} END{exit !found}'; then
      log "  unexpected in ${label}: ${name}"
    fi
  done <<<"$actual"
  local exp_n act_n
  exp_n="$(printf '%s\n' "$expected" | grep -c . || true)"
  act_n="$(printf '%s\n' "$actual" | grep -c . || true)"
  log "counts: checkout=${exp_n} ${label}=${act_n}"
  return 1
}

assert_image_migrations_match_checkout() {
  local image="$1"
  local expected actual
  expected="$(checkout_migration_manifest)" \
    || die "Cannot build checkout migration manifest"
  actual="$(image_migration_manifest "$image")" \
    || die "Cannot read migration manifest from image ${image}"
  if [[ -z "$actual" || "$actual" == *"MISSING_MIGRATIONS_DIR"* ]]; then
    die "Image ${image} has no Prisma migrations at ${PRISMA_MIGRATIONS_IMAGE_PATH}"
  fi
  compare_migration_manifests "$expected" "$actual" "$image" \
    || die "Image ${image} migrations do not match Git checkout — rebuild from target commit"
  local n
  n="$(printf '%s\n' "$expected" | grep -vc '^migration_lock.toml' || true)"
  log "Migration manifest OK for ${image} (${n} migrations + lock; names+SHA-256)"
}

assert_image_git_revision() {
  local image="$1"
  local rev="$2"
  local labeled
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "assert_image_git_revision expects 40-char SHA"
  labeled="$(docker_image_git_revision "$image" | tr -d '\r\n')"
  if [[ -z "$labeled" || "$labeled" == "<no value>" || "$labeled" == "unknown" ]]; then
    die "Image ${image} missing ${SITEFLOWER_IMAGE_REVISION_LABEL} label — rebuild with --build-arg SITEFLOWER_GIT_SHA=${rev}"
  fi
  [[ "$labeled" == "$rev" ]] \
    || die "Image ${image} revision label '${labeled}' != target commit ${rev}"
}

# Full gate: image exists + OCI git SHA label + migration names/SHA-256 match checkout.
assert_release_api_image_matches_rev() {
  local image="$1"
  local rev="$2"
  docker image inspect "$image" >/dev/null 2>&1 \
    || die "API image unavailable: ${image}"
  assert_image_git_revision "$image" "$rev"
  assert_image_migrations_match_checkout "$image"
}

# Pin tag → immutable Id + require image label revision == full git SHA + manifest.
pin_release_api_image_identity() {
  local tag="$1"
  local rev="$2"
  local id
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "pin_release_api_image_identity expects 40-char SHA"
  assert_shopbuket1_owned_name "${tag%%:*}" "image-repo"
  [[ "$tag" != "shopbuket1-api:local" ]] \
    || die "Refusing to pin unverified shopbuket1-api:local"
  assert_release_api_image_matches_rev "$tag" "$rev"
  id="$(docker_image_id "$tag")"
  [[ "$id" == sha256:* ]] || die "Unexpected docker image id for ${tag}: ${id}"
  export SHOPBUKET1_API_IMAGE="$tag"
  export SHOPBUKET1_API_IMAGE_TAG="$tag"
  export SHOPBUKET1_API_IMAGE_ID="$id"
  export SHOPBUKET1_API_IMAGE_GIT_SHA="$rev"
  log "Pinned API image ${tag} id=${id} revision=${rev}"
}

# Fail closed if tag drifted from pinned immutable id (optional rev re-check).
assert_pinned_api_image() {
  local tag="${SHOPBUKET1_API_IMAGE:-}"
  local expect="${SHOPBUKET1_API_IMAGE_ID:-}"
  local rev="${1:-${SHOPBUKET1_API_IMAGE_GIT_SHA:-}}"
  local got
  [[ -n "$tag" ]] || die "SHOPBUKET1_API_IMAGE unset — call ensure_release_api_image first"
  [[ -n "$expect" ]] || die "SHOPBUKET1_API_IMAGE_ID unset — image was not pinned"
  [[ "$tag" != "shopbuket1-api:local" ]] \
    || die "Refusing migrate via unverified shopbuket1-api:local"
  docker image inspect "$tag" >/dev/null 2>&1 \
    || die "Pinned API image tag missing/unavailable: ${tag}"
  docker image inspect "$expect" >/dev/null 2>&1 \
    || die "Pinned API image id missing/unavailable: ${expect} — re-run preflight"
  got="$(docker_image_id "$tag")"
  [[ "$got" == "$expect" ]] \
    || die "Pinned API image drifted: tag=${tag} expected_id=${expect} got=${got}"
  if [[ -n "$rev" ]]; then
    assert_image_git_revision "$expect" "$rev"
    assert_image_migrations_match_checkout "$expect"
  fi
}

# Run a compose migrate using the immutable image id (not a mutable tag).
compose_migrate_with_pinned_api_image() {
  local database_url="$1"
  local tag="${SHOPBUKET1_API_IMAGE_TAG:-${SHOPBUKET1_API_IMAGE:-}}"
  local id="${SHOPBUKET1_API_IMAGE_ID:-}"
  local rev="${SHOPBUKET1_API_IMAGE_GIT_SHA:-}"
  [[ -n "$id" ]] || die "compose_migrate_with_pinned_api_image: SHOPBUKET1_API_IMAGE_ID unset"
  assert_pinned_api_image "$rev"
  log "Compose migrate via immutable id=${id} (tag=${tag})"
  # Force service image to the pinned digest/id for this invocation only.
  SHOPBUKET1_API_IMAGE="$id" compose run --rm --no-deps \
    -e "DATABASE_URL=${database_url}" \
    api \
    sh -lc 'cd /app/node_modules/@bouquet-one/database && exec /app/node_modules/.bin/prisma migrate deploy'
  assert_pinned_api_image "$rev"
}

# True when image exists, label matches rev, and migration manifest matches checkout (no die).
release_api_image_usable() {
  local image="$1"
  local rev="${2:-}"
  local expected actual labeled
  docker image inspect "$image" >/dev/null 2>&1 || return 1
  if [[ -n "$rev" ]]; then
    labeled="$(docker_image_git_revision "$image" | tr -d '\r\n')"
    [[ "$labeled" == "$rev" ]] || return 1
  fi
  expected="$(checkout_migration_manifest 2>/dev/null)" || return 1
  actual="$(image_migration_manifest "$image" 2>/dev/null)" || return 1
  [[ -n "$actual" && "$actual" != *"MISSING_MIGRATIONS_DIR"* ]] || return 1
  [[ "$expected" == "$actual" ]] || return 1
  return 0
}

build_release_api_image() {
  local image="$1"
  local rev="$2"
  local root
  root="$(repo_root)"
  [[ "$rev" =~ ^[0-9a-f]{40}$ ]] || die "build_release_api_image expects 40-char SHA"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"
  log "Building API image ${image} from checkout (SITEFLOWER_GIT_SHA=${rev})"
  docker build \
    -f "${root}/deploy/Dockerfile.api" \
    --build-arg "SITEFLOWER_GIT_SHA=${rev}" \
    -t "$image" \
    "$root"
}

# Point shopbuket1-api:local at the verified SHA image (alias only — never a source of truth).
sync_api_local_alias() {
  local image="$1"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"
  docker tag "$image" shopbuket1-api:local
  log "Aliased shopbuket1-api:local → ${image}"
}

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
    log "Removing stale shopbuket1-api:local (id != ${verified})"
    docker image rm shopbuket1-api:local 2>/dev/null || true
  fi
}

# Ensure SHOPBUKET1_API_IMAGE is SHA-tagged, labeled with full rev, pinned by Id, migrations match.
# Never reuses unverified shopbuket1-api:local.
ensure_release_api_image() {
  local rev="$1"
  local image
  image="$(api_image_ref_for_rev "$rev")"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"

  if release_api_image_usable "$image" "$rev"; then
    log "Using verified API image ${image} (label+migrations match ${rev})"
    cleanup_stale_api_local_alias "$image"
    sync_api_local_alias "$image"
    pin_release_api_image_identity "$image" "$rev"
    return 0
  fi

  if docker image inspect shopbuket1-api:local >/dev/null 2>&1; then
    log "Ignoring shopbuket1-api:local until rebuilt/verified for ${image}"
  fi

  build_release_api_image "$image" "$rev"
  assert_image_migrations_match_checkout "$image" \
    || die "Freshly built ${image} still mismatches checkout — aborting"
  cleanup_stale_api_local_alias "$image"
  sync_api_local_alias "$image"
  pin_release_api_image_identity "$image" "$rev"
  log "Release API image ready: ${SHOPBUKET1_API_IMAGE} id=${SHOPBUKET1_API_IMAGE_ID}"
}

# After migrate: every checkout migration folder must have a finished _prisma_migrations row.
verify_checkout_migrations_applied_db() {
  local db="$1"
  local label="${2:-rehearsal}"
  local name n fails=0 expected_n checked=0
  expected_n="$(checkout_migration_count)"
  expected_n="$(echo "$expected_n" | tr -d '[:space:]')"
  [[ "$expected_n" =~ ^[1-9][0-9]*$ ]] || die "checkout migration count unavailable"
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    [[ "$name" =~ ^[0-9]{14}_[A-Za-z0-9_]+$ ]] \
      || die "Unsafe migration folder name: $name"
    n="$(preflight_psql_db "$db" "SELECT count(*)::int FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL")"
    n="$(echo "$n" | tr -d '[:space:]')"
    # count>=1: re-applied history may leave rolled_back + finished rows.
    if [[ ! "$n" =~ ^[1-9][0-9]*$ ]]; then
      log "FAIL ${label}: migration ${name} not finished in _prisma_migrations (count=${n})"
      fails=1
    else
      checked=$((checked + 1))
    fi
  done < <(checkout_migration_names)
  if [[ "$checked" -ne "$expected_n" && "$fails" -eq 0 ]]; then
    log "FAIL ${label}: finished migration count ${checked} != checkout ${expected_n}"
    fails=1
  fi
  if [[ "$fails" -eq 0 ]]; then
    log "${label}: all ${expected_n} checkout migrations finished in _prisma_migrations"
  fi
  return "$fails"
}

# Row-count preservation after restore+migrate on the isolated rehearsal DB.
#
# Exact equality (data must not shrink/grow unexpectedly):
#   products, product_variants, catalog_categories, orders, slug_redirects
#
# Documented exceptions (schema/structure changes are OK; we only compare counts):
#   - Table missing in baseline (null) → skip equality (legacy schema).
#   - erp_sku_registry: Task 04A may CREATE + backfill; allow count >= baseline when
#     baseline was numeric; when baseline was null, only table+PK gate applies elsewhere.
#   - Column add/drop/rename (e.g. diameter_cm drop) does NOT affect these counts.
#
# This check never inspects information_schema columns — legitimate DDL must not fail it.
preflight_assert_inventory_preserved() {
  local db="$1"
  local inventory_json="$2"
  local label="${3:-rehearsal}"
  local fails=0
  local table expected actual

  json_inventory_count() {
    local json="$1" key="$2"
    if printf '%s' "$json" | grep -q "\"${key}\":null"; then
      printf 'null\n'
      return 0
    fi
    printf '%s' "$json" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p" | head -n1
  }

  for table in products product_variants catalog_categories orders slug_redirects; do
    expected="$(json_inventory_count "$inventory_json" "$table")"
    expected="$(echo "$expected" | tr -d '[:space:]')"
    if [[ -z "$expected" || "$expected" == "null" ]]; then
      log "${label}: baseline ${table}=null/missing — skip equality (schema may have lacked table)"
      continue
    fi
    # Table must still exist after migrate (structure may change; presence required).
    local exists
    exists="$(preflight_psql_db "$db" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'")"
    exists="$(echo "$exists" | tr -d '[:space:]')"
    if [[ "$exists" != "1" ]]; then
      log "FAIL ${label}: critical table ${table} missing after migrate"
      fails=1
      continue
    fi
    actual="$(preflight_psql_db "$db" "SELECT count(*)::int FROM ${table}")"
    actual="$(echo "$actual" | tr -d '[:space:]')"
    if [[ "$actual" != "$expected" ]]; then
      log "FAIL ${label}: ${table} row count changed (baseline=${expected} after=${actual}) — data must be preserved"
      fails=1
    else
      log "${label}: ${table}=${actual} preserved"
    fi
  done

  expected="$(json_inventory_count "$inventory_json" "erp_sku_registry")"
  expected="$(echo "$expected" | tr -d '[:space:]')"
  if [[ -n "$expected" && "$expected" != "null" ]]; then
    actual="$(preflight_psql_db "$db" "SELECT count(*)::int FROM erp_sku_registry")"
    actual="$(echo "$actual" | tr -d '[:space:]')"
    if [[ ! "$actual" =~ ^[0-9]+$ ]] || [[ "$actual" -lt "$expected" ]]; then
      log "FAIL ${label}: erp_sku_registry shrunk (baseline=${expected} after=${actual})"
      fails=1
    else
      log "${label}: erp_sku_registry=${actual} (baseline=${expected}) preserved/grew (04A backfill allowed)"
    fi
  else
    log "${label}: baseline erp_sku_registry=null — CREATE/backfill allowed (Task 04A)"
  fi
  return "$fails"
}
