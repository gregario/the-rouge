#!/usr/bin/env bash
# safety-hooks.test.sh — Tests for rouge-safety-check.sh
#
# Run: bash tests/safety-hooks.test.sh
# All tests should pass with 0 failures.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SAFETY_CHECK="$SCRIPT_DIR/src/launcher/rouge-safety-check.sh"

# Use temp dir for audit log to avoid polluting real log
TEST_TMPDIR="$(mktemp -d)"
export HOME="$TEST_TMPDIR"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

assert_blocked() {
  local desc="$1"
  shift
  local exit_code=0
  "$@" >/dev/null 2>&1 || exit_code=$?
  if [[ "$exit_code" -eq 2 ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected exit 2, got $exit_code)"
  fi
}

assert_allowed() {
  local desc="$1"
  shift
  local exit_code=0
  "$@" >/dev/null 2>&1 || exit_code=$?
  if [[ "$exit_code" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected exit 0, got $exit_code)"
  fi
}

# ---------------------------------------------------------------------------
# PRE-BASH TESTS
# ---------------------------------------------------------------------------

echo ""
echo "=== pre-bash: dangerous command blocking ==="

# rm -rf /
assert_blocked "rm -rf /" \
  "$SAFETY_CHECK" pre-bash '{"command": "rm -rf /"}'

assert_blocked "rm -rf /*" \
  "$SAFETY_CHECK" pre-bash '{"command": "rm -rf /*"}'

assert_blocked "rm -rf / (with sudo)" \
  "$SAFETY_CHECK" pre-bash '{"command": "sudo rm -rf /"}'

assert_blocked "rm -fr /" \
  "$SAFETY_CHECK" pre-bash '{"command": "rm -fr /"}'

assert_blocked "rm with path traversal" \
  "$SAFETY_CHECK" pre-bash '{"command": "rm -rf ../../"}'

# git push --force to production
assert_blocked "git push --force main" \
  "$SAFETY_CHECK" pre-bash '{"command": "git push --force origin main"}'

assert_blocked "git push -f master" \
  "$SAFETY_CHECK" pre-bash '{"command": "git push -f origin master"}'

assert_blocked "git push --force production" \
  "$SAFETY_CHECK" pre-bash '{"command": "git push --force origin production"}'

# wrangler deploy without staging
assert_blocked "wrangler deploy (no env)" \
  "$SAFETY_CHECK" pre-bash '{"command": "wrangler deploy"}'

assert_blocked "wrangler deploy --env production" \
  "$SAFETY_CHECK" pre-bash '{"command": "wrangler deploy --env production"}'

# stripe without test mode
assert_blocked "stripe command without test mode" \
  "$SAFETY_CHECK" pre-bash '{"command": "stripe charges list"}'

assert_blocked "stripe create charge" \
  "$SAFETY_CHECK" pre-bash '{"command": "stripe charges create --amount 1000"}'

# supabase drop/delete
assert_blocked "supabase db reset" \
  "$SAFETY_CHECK" pre-bash '{"command": "supabase db reset"}'

assert_blocked "supabase db drop" \
  "$SAFETY_CHECK" pre-bash '{"command": "supabase db drop"}'

assert_blocked "supabase DROP TABLE" \
  "$SAFETY_CHECK" pre-bash '{"command": "supabase db execute \"DROP TABLE users\""}'

echo ""
echo "=== pre-bash: safe commands allowed ==="

assert_allowed "normal ls" \
  "$SAFETY_CHECK" pre-bash '{"command": "ls -la"}'

assert_allowed "git push to feature branch" \
  "$SAFETY_CHECK" pre-bash '{"command": "git push origin feature/my-branch"}'

assert_allowed "git push --force to feature branch" \
  "$SAFETY_CHECK" pre-bash '{"command": "git push --force origin feature/safety-hooks"}'

assert_allowed "wrangler deploy --env staging" \
  "$SAFETY_CHECK" pre-bash '{"command": "wrangler deploy --env staging"}'

assert_allowed "wrangler deploy --env preview" \
  "$SAFETY_CHECK" pre-bash '{"command": "wrangler deploy --env preview"}'

assert_allowed "stripe with --test-mode" \
  "$SAFETY_CHECK" pre-bash '{"command": "stripe charges list --test-mode"}'

assert_allowed "stripe with test key" \
  "$SAFETY_CHECK" pre-bash '{"command": "stripe charges list --api-key sk_test_abc123"}'

assert_allowed "stripe with restricted test key" \
  "$SAFETY_CHECK" pre-bash '{"command": "stripe charges list --api-key rk_test_abc123"}'

assert_allowed "npm install" \
  "$SAFETY_CHECK" pre-bash '{"command": "npm install express"}'

assert_allowed "empty command" \
  "$SAFETY_CHECK" pre-bash '{"command": ""}'

assert_allowed "rm in project (no root)" \
  "$SAFETY_CHECK" pre-bash '{"command": "rm -rf ./dist"}'

assert_allowed "supabase status" \
  "$SAFETY_CHECK" pre-bash '{"command": "supabase status"}'

# ---------------------------------------------------------------------------
# PRE-WRITE TESTS
# ---------------------------------------------------------------------------

echo ""
echo "=== pre-write: blocking dangerous writes ==="

assert_blocked "write to .env" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/.env\", \"content\": \"SECRET=abc\"}"

assert_blocked "write to .env.local" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/.env.local\", \"content\": \"SECRET=abc\"}"

assert_blocked "write to .env.production" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/.env.production\", \"content\": \"SECRET=abc\"}"

assert_blocked "write outside project (absolute)" \
  "$SAFETY_CHECK" pre-write '{"file_path": "/etc/passwd", "content": "hacked"}'

assert_blocked "write with path traversal" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/../../etc/passwd\", \"content\": \"hacked\"}"

assert_blocked "write to telemetry-consent" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$TEST_TMPDIR/.rouge/telemetry-consent\", \"content\": \"yes\"}"

echo ""
echo "=== pre-write: safe writes allowed ==="

assert_allowed "write to src file" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/src/index.ts\", \"content\": \"console.log('hi')\"}"

assert_allowed "write to README" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/README.md\", \"content\": \"# Hello\"}"

assert_allowed "write to package.json" \
  "$SAFETY_CHECK" pre-write "{\"file_path\": \"$(pwd)/package.json\", \"content\": \"{}\"}"

# ---------------------------------------------------------------------------
# POST-BASH TESTS
# ---------------------------------------------------------------------------

echo ""
echo "=== post-bash: logging ==="

# Clear audit log
rm -f "$TEST_TMPDIR/.rouge/audit-log.jsonl"

assert_allowed "post-bash logs successfully" \
  "$SAFETY_CHECK" post-bash '{"stdout": "hello world", "stderr": "", "exitCode": 0}'

# Verify audit log was written
if [[ -f "$TEST_TMPDIR/.rouge/audit-log.jsonl" ]]; then
  local_lines=$(wc -l < "$TEST_TMPDIR/.rouge/audit-log.jsonl" | tr -d ' ')
  if [[ "$local_lines" -ge 1 ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: audit log contains entries after post-bash"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: audit log is empty after post-bash"
  fi
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: audit log file not created"
fi

assert_allowed "post-bash with error exit code" \
  "$SAFETY_CHECK" post-bash '{"stdout": "", "stderr": "command not found", "exitCode": 127}'

# Test credential issue detection (should still exit 0 but warn)
output=$("$SAFETY_CHECK" post-bash '{"stdout": "", "stderr": "Error: 401 unauthorized", "exitCode": 1}' 2>&1) || true
if echo "$output" | grep -q "credential issue"; then
  PASS=$((PASS + 1))
  echo "  PASS: post-bash detects credential issues in stderr"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: post-bash should detect credential issues"
fi

# ---------------------------------------------------------------------------
# CUSTOM BLOCKED COMMANDS TESTS
# ---------------------------------------------------------------------------

echo ""
echo "=== custom blocked commands from rouge.config.json ==="

# Create a temporary config
ORIG_DIR="$(pwd)"
CUSTOM_TEST_DIR="$(mktemp -d)"
cat > "$CUSTOM_TEST_DIR/rouge.config.json" << 'CONFIGEOF'
{
  "safety": {
    "blocked_commands": ["docker rm", "kubectl delete"],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": []
  }
}
CONFIGEOF

cd "$CUSTOM_TEST_DIR"

assert_blocked "custom blocked: docker rm" \
  "$SAFETY_CHECK" pre-bash '{"command": "docker rm my-container"}'

assert_blocked "custom blocked: kubectl delete" \
  "$SAFETY_CHECK" pre-bash '{"command": "kubectl delete pod my-pod"}'

assert_allowed "custom: docker ps (not blocked)" \
  "$SAFETY_CHECK" pre-bash '{"command": "docker ps"}'

cd "$ORIG_DIR"

# ---------------------------------------------------------------------------
# AUDIT LOG FORMAT TEST
# ---------------------------------------------------------------------------

echo ""
echo "=== audit log format ==="

# Check that log entries are valid JSON
AUDIT_FILE="$TEST_TMPDIR/.rouge/audit-log.jsonl"
if [[ -f "$AUDIT_FILE" ]]; then
  invalid=0
  while IFS= read -r line; do
    if ! echo "$line" | jq . >/dev/null 2>&1; then
      invalid=$((invalid + 1))
    fi
  done < "$AUDIT_FILE"
  if [[ "$invalid" -eq 0 ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: all audit log entries are valid JSON"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $invalid invalid JSON entries in audit log"
  fi

  # Check that entries have required fields
  first_entry=$(head -1 "$AUDIT_FILE")
  has_fields=true
  for field in timestamp hook project verdict; do
    if ! echo "$first_entry" | jq -e ".$field" >/dev/null 2>&1; then
      has_fields=false
      break
    fi
  done
  if [[ "$has_fields" == "true" ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: audit log entries have required fields"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: audit log entries missing required fields"
  fi
else
  FAIL=$((FAIL + 2))
  echo "  FAIL: audit log file not found"
fi

# ---------------------------------------------------------------------------
# Cleanup & Summary
# ---------------------------------------------------------------------------

rm -rf "$TEST_TMPDIR"
rm -rf "$CUSTOM_TEST_DIR"

echo ""
echo "=============================="
echo "  Results: $PASS passed, $FAIL failed"
echo "=============================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
