#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../../src/launcher" && pwd)"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — expected to contain '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit_code() {
  local desc="$1" expected="$2"
  shift 2
  set +e
  "$@" >/dev/null 2>&1
  local actual=$?
  set -e
  if [[ "$expected" -eq "$actual" ]]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — expected exit $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

# state-to-prompt: executable states return correct prompt files
assert_contains "building → 01-building.md" "01-building.md" "$("$SCRIPT_DIR/state-to-prompt.sh" building)"
assert_contains "qa-gate → 02b-qa-gate.md" "02b-qa-gate.md" "$("$SCRIPT_DIR/state-to-prompt.sh" qa-gate)"
assert_contains "seeding → 00-swarm-orchestrator.md" "00-swarm-orchestrator.md" "$("$SCRIPT_DIR/state-to-prompt.sh" seeding)"
assert_contains "promoting → 07-ship-promote.md" "07-ship-promote.md" "$("$SCRIPT_DIR/state-to-prompt.sh" promoting)"
assert_contains "rolling-back → 07-ship-promote.md" "07-ship-promote.md" "$("$SCRIPT_DIR/state-to-prompt.sh" rolling-back)"
assert_contains "analyzing → 04-analyzing.md" "04-analyzing.md" "$("$SCRIPT_DIR/state-to-prompt.sh" analyzing)"

# state-to-prompt: non-executable states exit 1
assert_exit_code "ready exits 1" 1 "$SCRIPT_DIR/state-to-prompt.sh" ready
assert_exit_code "waiting-for-human exits 1" 1 "$SCRIPT_DIR/state-to-prompt.sh" waiting-for-human
assert_exit_code "complete exits 1" 1 "$SCRIPT_DIR/state-to-prompt.sh" complete
assert_exit_code "bogus exits 1" 1 "$SCRIPT_DIR/state-to-prompt.sh" bogus

# model-for-state: opus vs sonnet mapping
assert_eq "building → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" building)"
assert_eq "qa-fixing → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" qa-fixing)"
assert_eq "po-reviewing → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" po-reviewing)"
assert_eq "analyzing → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" analyzing)"
assert_eq "generating-change-spec → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" generating-change-spec)"
assert_eq "vision-checking → opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" vision-checking)"
assert_eq "qa-gate → sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" qa-gate)"
assert_eq "test-integrity → sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" test-integrity)"
assert_eq "promoting → sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" promoting)"
assert_eq "rolling-back → sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" rolling-back)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
