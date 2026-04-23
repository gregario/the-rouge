#!/usr/bin/env bash
# P0.5 integration test — config-protection wired into rouge-safety-check.sh
#
# Covers:
#   - pre-write with non-config file: not affected (passes regardless)
#   - pre-write to tsconfig.json with strict:false + no rationale: WARN (in warn mode)
#   - pre-write to tsconfig.json with strict:false + rationale comment: OK
#   - pre-write with mode "off": skipped entirely
#   - pre-write with mode "block" + weakening: BLOCKED
#
# Usage: bash tests/safety-check-config-protection.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SAFETY="$ROUGE_ROOT/src/launcher/rouge-safety-check.sh"

fail=0
pass=0

_run_in_tmp() {
  local mode="$1"
  local file_path="$2"
  local content="$3"
  local _tmpdir
  _tmpdir=$(mktemp -d)

  cat > "$_tmpdir/rouge.config.json" <<EOF
{
  "safety": { "blocked_commands": [], "allowed_deploy_targets": [], "custom_pre_hooks": [] },
  "config_protection": { "mode": "$mode" }
}
EOF

  local tool_input
  tool_input=$(jq -cn \
    --arg fp "$file_path" \
    --arg content "$content" \
    '{ file_path: $fp, content: $content }')

  local exit_code=0
  local stderr_out
  stderr_out=$(cd "$_tmpdir" && "$SAFETY" pre-write "$tool_input" 2>&1 >/dev/null) || exit_code=$?
  rm -rf "$_tmpdir"
  echo "$exit_code|$stderr_out"
}

check() {
  local label="$1"
  local want_exit="$2"
  local want_stderr_pattern="$3"
  local result="$4"
  local got_exit got_stderr
  got_exit="${result%%|*}"
  got_stderr="${result#*|}"

  if [[ "$got_exit" != "$want_exit" ]]; then
    echo "  FAIL [$label]: want exit $want_exit, got $got_exit (stderr: $got_stderr)" >&2
    fail=$((fail + 1))
    return
  fi
  if [[ -n "$want_stderr_pattern" ]] && ! echo "$got_stderr" | grep -qE "$want_stderr_pattern"; then
    echo "  FAIL [$label]: stderr pattern '$want_stderr_pattern' not found; got: $got_stderr" >&2
    fail=$((fail + 1))
    return
  fi
  echo "  PASS: $label"
  pass=$((pass + 1))
}

echo "[P0.5] config-protection wired into safety-check"

# 1. Non-config file: config-protection skips (no warn/block signal)
result=$(_run_in_tmp "warn" "src/app.ts" "const x = 1;")
check "non-config file allowed" "0" "" "$result"

# 2. tsconfig.json with strict:false + no rationale, warn mode: allow + stderr warn
result=$(_run_in_tmp "warn" "tsconfig.json" '{"compilerOptions":{"strict":false}}')
check "tsconfig strict:false in warn mode emits warning" "0" "WARNING.*config-protection" "$result"

# 3. tsconfig.json with strict:false + rationale: allow, no warn
result=$(_run_in_tmp "warn" "tsconfig.json" '// rationale: generated code
{"compilerOptions":{"strict":false}}')
check "rationale marker suppresses warning" "0" "" "$result"

# 4. mode "off": no config-protection involvement
result=$(_run_in_tmp "off" "tsconfig.json" '{"compilerOptions":{"strict":false}}')
check "mode:off skips config-protection" "0" "" "$result"

# 5. mode "block" with weakening: denied (exit 2)
result=$(_run_in_tmp "block" ".eslintrc.json" '{"rules":{"no-unused-vars":"off"}}')
check "mode:block denies weakening" "2" "" "$result"

# 6. mode "block" with rationale: allowed
result=$(_run_in_tmp "block" ".eslintrc.json" '// rationale: legacy test fixtures
{"rules":{"no-unused-vars":"off"}}')
check "mode:block with rationale allows" "0" "" "$result"

echo ""
echo "Results: $pass passed, $fail failed"
if [[ $fail -gt 0 ]]; then
  exit 1
fi
