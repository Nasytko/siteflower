#!/usr/bin/env bash
# API image selection + Prisma migration manifest verification for shopbuket1.
# shellcheck shell=bash
#
# Rehearsal and live migrate MUST use an image built from the target Git commit.
# Never trust shopbuket1-api:local without verifying it matches the checkout.

PRISMA_MIGRATIONS_IMAGE_PATH="${PRISMA_MIGRATIONS_IMAGE_PATH:-/app/node_modules/@bouquet-one/database/prisma/migrations}"

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

# Sorted lines: <migration_folder_or_lock>\t<sha256>
# Includes migration_lock.toml plus each */migration.sql (or NO_SQL marker).
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

# Read migration manifest from a built API image (docker required).
image_migration_manifest() {
  local image="$1"
  [[ -n "$image" ]] || die "image_migration_manifest: empty image"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"
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
      if command -v sha256sum >/dev/null 2>&1; then
        printf "migration_lock.toml\t%s\n" "$(sha256sum "$DIR/migration_lock.toml" | awk "{print \$1}")"
      else
        printf "migration_lock.toml\t%s\n" "$(sha256sum <"$DIR/migration_lock.toml" 2>/dev/null || cat "$DIR/migration_lock.toml" | sha256sum | awk "{print \$1}")"
      fi
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
  log "FAIL migration manifest mismatch (${label} vs checkout)"
  log "--- checkout ---"
  printf '%s\n' "$expected" | while IFS= read -r line; do log "  $line"; done
  log "--- ${label} ---"
  printf '%s\n' "$actual" | while IFS= read -r line; do log "  $line"; done
  local exp_n act_n
  exp_n="$(printf '%s\n' "$expected" | grep -c . || true)"
  act_n="$(printf '%s\n' "$actual" | grep -c . || true)"
  log "counts: checkout=${exp_n} ${label}=${act_n}"
  # Highlight missing / checksum diffs for operators.
  local name
  while IFS=$'\t' read -r name _; do
    [[ -n "$name" ]] || continue
    [[ "$name" == "migration_lock.toml" ]] && continue
    if ! printf '%s\n' "$actual" | grep -qx "${name}	.*"; then
      log "  missing in ${label}: ${name}"
    fi
  done <<<"$expected"
  while IFS=$'\t' read -r name _; do
    [[ -n "$name" ]] || continue
    [[ "$name" == "migration_lock.toml" ]] && continue
    if ! printf '%s\n' "$expected" | grep -qx "${name}	.*"; then
      log "  unexpected in ${label}: ${name}"
    fi
  done <<<"$actual"
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
  log "Migration manifest OK for ${image} (${n} migrations + lock)"
}

# True when image exists and its migration manifest matches the checkout (no die).
release_api_image_usable() {
  local image="$1"
  local expected actual
  docker image inspect "$image" >/dev/null 2>&1 || return 1
  expected="$(checkout_migration_manifest 2>/dev/null)" || return 1
  actual="$(image_migration_manifest "$image" 2>/dev/null)" || return 1
  [[ -n "$actual" && "$actual" != *"MISSING_MIGRATIONS_DIR"* ]] || return 1
  [[ "$expected" == "$actual" ]] || return 1
  return 0
}

build_release_api_image() {
  local image="$1"
  local root
  root="$(repo_root)"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"
  log "Building API image ${image} from checkout $(repo_root) (Dockerfile.api)"
  docker build \
    -f "${root}/deploy/Dockerfile.api" \
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

# Remove dangling local alias if it does not resolve to the verified image ID.
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

# Ensure SHOPBUKET1_API_IMAGE is the SHA-tagged image for $rev with matching migrations.
# Never reuses unverified shopbuket1-api:local.
ensure_release_api_image() {
  local rev="$1"
  local image
  image="$(api_image_ref_for_rev "$rev")"
  assert_shopbuket1_owned_name "${image%%:*}" "image-repo"

  if release_api_image_usable "$image"; then
    log "Using verified API image ${image} (migrations match checkout)"
    cleanup_stale_api_local_alias "$image"
    sync_api_local_alias "$image"
    export SHOPBUKET1_API_IMAGE="$image"
    return 0
  fi

  # Explicitly ignore stale :local — it caused 37-vs-41 migration rehearsal failures.
  if docker image inspect shopbuket1-api:local >/dev/null 2>&1; then
    log "Ignoring shopbuket1-api:local until rebuilt/verified for ${image}"
  fi

  build_release_api_image "$image"
  assert_image_migrations_match_checkout "$image" \
    || die "Freshly built ${image} still mismatches checkout — aborting"
  cleanup_stale_api_local_alias "$image"
  sync_api_local_alias "$image"
  export SHOPBUKET1_API_IMAGE="$image"
  log "Release API image ready: ${SHOPBUKET1_API_IMAGE}"
}

# After migrate: every checkout migration folder must have a finished _prisma_migrations row.
verify_checkout_migrations_applied_db() {
  local db="$1"
  local label="${2:-rehearsal}"
  local name n fails=0
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
    fi
  done < <(checkout_migration_names)
  return "$fails"
}
