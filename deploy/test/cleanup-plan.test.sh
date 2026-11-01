#!/usr/bin/env bash
# Unit tests for Task 05 cleanup-plan gates (no Docker / no production).
# Run under Linux or Git Bash — not PowerShell.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-cleanup-plan.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
# shellcheck source=../../deploy/lib/cleanup-plan.sh
source "${ROOT}/deploy/lib/cleanup-plan.sh"

PLAN_PREPARED="${ROOT}/deploy/cleanup-plans/task05-seo-landing-drop.v1.json"
[[ -f "$PLAN_PREPARED" ]] || fail "missing prepared plan JSON"

load_cleanup_plan "$PLAN_PREPARED"
[[ "$CLEANUP_PLAN_ID" == "task05-seo-landing-drop.v1" ]] || fail "bad plan id"
[[ "$CLEANUP_PLAN_STATUS" == "prepared" ]] || fail "expected status=prepared"
pass "load prepared cleanup plan"

if ( validate_cleanup_plan_approval ) 2>/dev/null; then
  fail "prepared plan must not validate"
fi
pass "prepared plan rejected by validate_cleanup_plan_approval"

cp "$PLAN_PREPARED" "$TMP/approved.json"
node -e '
const fs=require("fs");
const p=process.argv[1];
const j=JSON.parse(fs.readFileSync(p,"utf8"));
j.status="approved";
fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
' "$TMP/approved.json"

load_cleanup_plan "$TMP/approved.json"
[[ "$CLEANUP_PLAN_STATUS" == "approved" ]] || fail "status rewrite failed"
export SHOPBUKET1_CLEANUP_APPROVAL_TOKEN="WRONG"
if ( validate_cleanup_plan_approval ) 2>/dev/null; then
  fail "wrong token must fail"
fi
pass "approved plan rejects wrong token"

export SHOPBUKET1_CLEANUP_APPROVAL_TOKEN="$CLEANUP_PLAN_TOKEN"
validate_cleanup_plan_approval
pass "approved plan accepts matching token"

MIG_SRC="${ROOT}/${CLEANUP_PLAN_MIG_REL}"
[[ -d "$MIG_SRC" ]] || fail "missing plan migrations at $MIG_SRC"
base="$(find "$MIG_SRC" -mindepth 1 -maxdepth 1 -type d | head -n1)"
base="$(basename "$base")"
mkdir -p "$TMP/migrations/${base}"
cp -a "${MIG_SRC}/${base}/." "$TMP/migrations/${base}/"
[[ -f "$TMP/migrations/${base}/migration.sql" ]] || fail "migration.sql not installed"
grep -q 'seo_landing_pages' "$TMP/migrations/${base}/migration.sql" \
  || fail "DROP migration content missing"
pass "cleanup migration SQL package present"

if [[ -d "${ROOT}/packages/database/prisma/migrations/20261102020000_drop_seo_landing_pages" ]]; then
  fail "SEO DROP must not live in prisma/migrations until cleanup-plan install"
fi
pass "SEO DROP absent from prisma/migrations (gated)"

[[ -f "${ROOT}/packages/database/prisma/migrations/20261102010000_drop_product_diameter_cm/migration.sql" ]] \
  || fail "diameter drop migration missing"
pass "diameter_cm drop migration in normal migrate path"

bash "${ROOT}/deploy.sh" --help 2>&1 | grep -q cleanup-plan || fail "deploy help missing --cleanup-plan"
pass "deploy.sh --help lists --cleanup-plan"

before="$(git -C "$ROOT" rev-parse HEAD)"
SHOPBUKET1_CLEANUP_PLAN="$PLAN_PREPARED" bash "${ROOT}/deploy.sh" production --dry-run >/dev/null 2>&1 \
  || fail "dry-run with cleanup plan path failed"
after="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$before" == "$after" ]] || fail "dry-run changed HEAD"
if [[ -d "${ROOT}/packages/database/prisma/migrations/20261102020000_drop_seo_landing_pages" ]]; then
  fail "dry-run must not install cleanup migrations"
fi
pass "dry-run + cleanup plan path is read-only (no migration install)"

pass "all cleanup-plan unit tests passed"
