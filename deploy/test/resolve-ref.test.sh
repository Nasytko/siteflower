#!/usr/bin/env bash
# Focused regression: resolve_ref must emit ONLY a 40-char SHA on stdout,
# even when `git pull` would print "Already up to date." on stdout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/shopbuket1-resolve-ref.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*" >&2; }

# --- fixture: bare origin + clone already up to date ---
git -c init.defaultBranch=main init --bare "$TMP/origin.git" >/dev/null
git -c init.defaultBranch=main clone "$TMP/origin.git" "$TMP/work" >/dev/null 2>&1
cd "$TMP/work"
git config user.email "test@example.com"
git config user.name "resolve-ref-test"
git config core.autocrlf false
printf 'fixture\n' >README
git add README
git commit -m "init" >/dev/null
git branch -M main
git push -u origin main >/dev/null 2>&1
# Ensure local matches origin so the next pull is a no-op ("Already up to date.").
git fetch origin >/dev/null 2>&1
git status --porcelain | grep -q . && fail "fixture worktree unexpectedly dirty"

# Source deploy helpers without running main.
# shellcheck source=../../deploy/lib/common.sh
source "${ROOT}/deploy/lib/common.sh"
# shellcheck source=../../deploy.sh
source "${ROOT}/deploy.sh"
# deploy.sh installs an ERR trap for production deploys — disable for this unit test.
trap - ERR
# deploy.sh sets SCRIPT_DIR to the real repo when sourced; point at the fixture.
SCRIPT_DIR="$TMP/work"
REF=""
NEW_API_IMAGE=""
NEW_WEB_IMAGE=""
PREV_API_IMAGE=""
PREV_WEB_IMAGE=""
DEPLOY_STARTED=0

# Capture stdout only (stderr may contain log/git noise).
rev_out="$(resolve_ref 2>"$TMP/stderr.log")"
err_out="$(cat "$TMP/stderr.log" || true)"

[[ "$rev_out" =~ ^[0-9a-f]{40}$ ]] || fail "stdout is not a 40-char SHA: [$rev_out]"
[[ "$rev_out" != *$'\n'* ]] || fail "stdout contains an embedded newline: [$rev_out]"
[[ "$rev_out" != *"Already up to date"* ]] || fail "stdout contaminated with pull message"
[[ "$rev_out" != *"Fetching"* ]] || fail "stdout contaminated with fetch/log text"
[[ "$rev_out" != *"From "* ]] || fail "stdout contaminated with git remote banner"

if grep -q "Already up to date" <<<"$err_out"; then
  pass "git pull message stayed off stdout (seen on stderr)"
else
  pass "no 'Already up to date' text on stderr (still OK if SHA is clean)"
fi

tag_images "$rev_out"
short="${rev_out:0:12}"
[[ "$NEW_API_IMAGE" == "shopbuket1-api:${short}" ]] || fail "bad API image: $NEW_API_IMAGE"
[[ "$NEW_WEB_IMAGE" == "shopbuket1-web:${short}" ]] || fail "bad WEB image: $NEW_WEB_IMAGE"
[[ "$short" =~ ^[0-9a-f]{12}$ ]] || fail "short sha invalid: $short"

# Confirm log() still writes to stderr (previous fix — do not regress).
log "hello-log" >"$TMP/log.out" 2>"$TMP/log.err"
grep -q "hello-log" "$TMP/log.err" || fail "log() did not write to stderr"
[[ ! -s "$TMP/log.out" ]] || fail "log() leaked to stdout"

pass "resolve_ref stdout is pure SHA; image tags valid; log() on stderr"
