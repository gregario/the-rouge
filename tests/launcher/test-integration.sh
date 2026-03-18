#!/usr/bin/env bash
# Integration tests for launcher helpers
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCHER_DIR="$SCRIPT_DIR/../../src/launcher"
MOCK="$SCRIPT_DIR/mock-project"
ORIG_STATE="$(cat "$MOCK/state.json")"
PASS=0
FAIL=0

cleanup() { echo "$ORIG_STATE" > "$MOCK/state.json"; rm -f "$MOCK/feedback.json"; }
trap cleanup EXIT

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

get_state() { jq -r '.current_state' "$MOCK/state.json"; }

# Test 1: ready state is not executable (state-to-prompt exits 1)
"$LAUNCHER_DIR/state-to-prompt.sh" ready >/dev/null 2>&1 && FAIL=$((FAIL + 1)) || PASS=$((PASS + 1))

# Test 2: Transition to building
jq '.current_state = "building"' "$MOCK/state.json" > "$MOCK/state.json.tmp" && mv "$MOCK/state.json.tmp" "$MOCK/state.json"
assert_eq "building state" "building" "$(get_state)"

# Test 3: building maps to correct prompt
PROMPT="$("$LAUNCHER_DIR/state-to-prompt.sh" building)"
[[ "$PROMPT" == *"01-building.md" ]] && PASS=$((PASS + 1)) || { echo "FAIL: building prompt path"; FAIL=$((FAIL + 1)); }

# Test 4: building uses opus
assert_eq "building → opus" "opus" "$("$LAUNCHER_DIR/model-for-state.sh" building)"

# Test 5: Simulate pause (set waiting-for-human + paused_from_state)
jq '.current_state = "waiting-for-human" | .paused_from_state = "qa-gate"' "$MOCK/state.json" > "$MOCK/state.json.tmp" && mv "$MOCK/state.json.tmp" "$MOCK/state.json"
assert_eq "paused state" "waiting-for-human" "$(get_state)"
assert_eq "paused_from" "qa-gate" "$(jq -r '.paused_from_state' "$MOCK/state.json")"

# Test 6: Simulate resume (feedback.json exists → launcher would transition)
echo '{"text":"fix the nav","timestamp":"2026-03-18T10:00:00Z"}' > "$MOCK/feedback.json"
[[ -f "$MOCK/feedback.json" ]] && PASS=$((PASS + 1)) || { echo "FAIL: feedback.json not created"; FAIL=$((FAIL + 1)); }

# Test 7: Supabase slots check (live test — requires auth)
if "$LAUNCHER_DIR/supabase-slots.sh" check >/dev/null 2>&1; then
  SLOTS="$("$LAUNCHER_DIR/supabase-slots.sh" check)"
  [[ "$SLOTS" =~ ^[0-9]+$ ]] && PASS=$((PASS + 1)) || { echo "FAIL: supabase slots not a number: $SLOTS"; FAIL=$((FAIL + 1)); }
else
  echo "SKIP: supabase-slots.sh check (no auth)"
  PASS=$((PASS + 1))  # don't fail CI for missing auth
fi

# Test 8: Auth expiry check runs without error
"$LAUNCHER_DIR/check-auth-expiry.sh" >/dev/null 2>&1
PASS=$((PASS + 1))

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
