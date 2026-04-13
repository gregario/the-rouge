#!/usr/bin/env bash
# rouge-safety-check.sh — Safety hooks for The Rouge autonomous loop.
# Called by Claude Code hooks before/after tool use.
#
# Exit codes:
#   0 = ALLOW (proceed with tool use)
#   2 = BLOCK (Claude Code hook convention: reject the tool call)
#
# Usage:
#   rouge-safety-check.sh pre-bash  "$TOOL_INPUT"
#   rouge-safety-check.sh pre-write "$TOOL_INPUT"
#   rouge-safety-check.sh post-bash "$TOOL_OUTPUT"

set -euo pipefail

AUDIT_DIR="$HOME/.rouge"
AUDIT_LOG="$AUDIT_DIR/audit-log.jsonl"
CONFIG_FILE="rouge.config.json"

# Ensure audit directory and log file exist with owner-only perms.
# The log captures command summaries and stdout/stderr snippets — tighten
# defaults so it isn't world-readable on shared boxes.
mkdir -p "$AUDIT_DIR"
chmod 700 "$AUDIT_DIR" 2>/dev/null || true
if [[ ! -f "$AUDIT_LOG" ]]; then
  touch "$AUDIT_LOG"
  chmod 600 "$AUDIT_LOG" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_entry() {
  local hook="$1" verdict="$2" summary="$3" reason="${4:-}"
  local project_name
  project_name="$(basename "$PWD")"

  local entry
  entry=$(jq -cn \
    --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg hook "$hook" \
    --arg project "$project_name" \
    --arg summary "$summary" \
    --arg verdict "$verdict" \
    --arg reason "$reason" \
    '{timestamp: $ts, hook: $hook, project: $project, command_summary: $summary, verdict: $verdict, reason: $reason}')

  echo "$entry" >> "$AUDIT_LOG"
}

block() {
  local hook="$1" summary="$2" reason="$3"
  log_entry "$hook" "BLOCK" "$summary" "$reason"
  echo "[rouge-safety] BLOCKED: $reason" >&2
  exit 2
}

allow() {
  local hook="$1" summary="$2"
  log_entry "$hook" "ALLOW" "$summary"
  exit 0
}

# Load custom blocked commands from rouge.config.json if it exists
load_custom_blocked() {
  if [[ -f "$CONFIG_FILE" ]]; then
    jq -r '.safety.blocked_commands // [] | .[]' "$CONFIG_FILE" 2>/dev/null || true
  fi
}

load_allowed_deploy_targets() {
  if [[ -f "$CONFIG_FILE" ]]; then
    jq -r '.safety.allowed_deploy_targets // [] | .[]' "$CONFIG_FILE" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# pre-bash: Check a Bash command before execution
# ---------------------------------------------------------------------------

pre_bash() {
  local tool_input="$1"
  local cmd
  cmd=$(echo "$tool_input" | jq -r '.command // empty')

  if [[ -z "$cmd" ]]; then
    allow "pre-bash" "(empty command)"
  fi

  # Truncate for logging
  local summary="${cmd:0:200}"

  # --- Dangerous rm patterns ---
  # Block rm -rf / or rm -rf /* or rm with path traversal outside project
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)rm[[:space:]]+.*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*[[:space:]]+/($|[[:space:]]|;|\*)'; then
    block "pre-bash" "$summary" "Blocked: rm -rf targeting root filesystem"
  fi
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)rm[[:space:]]+.*-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*[[:space:]]+/($|[[:space:]]|;|\*)'; then
    block "pre-bash" "$summary" "Blocked: rm -rf targeting root filesystem"
  fi
  # Block rm -rf with path traversal (../)
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)rm[[:space:]]+.*-[a-zA-Z]*r[a-zA-Z]*[[:space:]]+.*\.\.\/'; then
    block "pre-bash" "$summary" "Blocked: rm with path traversal outside project"
  fi

  # --- Git force push to production branches ---
  if echo "$cmd" | grep -qE -e 'git[[:space:]]+push[[:space:]]+.*--force' || echo "$cmd" | grep -qE -e 'git[[:space:]]+push[[:space:]]+-f[[:space:]]'; then
    # Check if pushing to production branches
    if echo "$cmd" | grep -qwE '(main|master|production)'; then
      block "pre-bash" "$summary" "Blocked: git push --force to production branch"
    fi
  fi

  # --- Wrangler deploy without staging ---
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)wrangler[[:space:]]+deploy'; then
    # Check allowed deploy targets: defaults + config
    local has_allowed=false
    if echo "$cmd" | grep -qE -e '--env[[:space:]]+(staging|preview)'; then
      has_allowed=true
    fi

    # Also check config-defined allowed targets
    if [[ "$has_allowed" != "true" ]]; then
      local allowed_targets
      allowed_targets=$(load_allowed_deploy_targets)
      while IFS= read -r target; do
        [[ -z "$target" ]] && continue
        if echo "$cmd" | grep -qE -e "--env[[:space:]]+$target"; then
          has_allowed=true
          break
        fi
      done <<< "$allowed_targets"
    fi

    if [[ "$has_allowed" != "true" ]]; then
      block "pre-bash" "$summary" "Blocked: wrangler deploy without --env staging (production deploy guard)"
    fi
  fi

  # --- Vercel deploy ---
  # Our Vercel handler intentionally uses --prod (Hobby tier preview URLs are
  # auth-walled and break health checks). Allow the expected handler form
  # (`vercel deploy --yes --prod` or `vercel --prod`) and any deploy targeting
  # an allowlisted environment via --target. Block bare `vercel deploy` to
  # production from a prompt context — production deploys must come through
  # the deploy-to-staging.js handler so retry/health-check/rollback wrap them.
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)(npx[[:space:]]+)?vercel([[:space:]]|$)'; then
    local v_allowed=false
    # Expected handler invocation: must include --yes (non-interactive) AND --prod.
    if echo "$cmd" | grep -qE -e '--yes' && echo "$cmd" | grep -qE -e '--prod'; then
      v_allowed=true
    fi
    # Or an explicit --target from the configured allowed list.
    if [[ "$v_allowed" != "true" ]]; then
      local allowed_targets
      allowed_targets=$(load_allowed_deploy_targets)
      while IFS= read -r target; do
        [[ -z "$target" ]] && continue
        if echo "$cmd" | grep -qE -e "--target[[:space:]]+$target"; then
          v_allowed=true
          break
        fi
      done <<< "$allowed_targets"
    fi
    # Read-only subcommands are fine (list, inspect, env, login, link, whoami...).
    if echo "$cmd" | grep -qE -e 'vercel[[:space:]]+(ls|list|inspect|env|login|logout|link|whoami|teams|switch|domains|certs|logs|pull|build([[:space:]]|$))'; then
      v_allowed=true
    fi
    if [[ "$v_allowed" != "true" ]]; then
      block "pre-bash" "$summary" "Blocked: vercel deploy must go through deploy-to-staging.js (expected: --yes --prod) or use --target from allowed_deploy_targets"
    fi
  fi

  # --- Stripe without test mode ---
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)stripe[[:space:]]'; then
    if ! echo "$cmd" | grep -qE -e '(--test-mode|sk_test_|rk_test_)'; then
      block "pre-bash" "$summary" "Blocked: stripe command without --test-mode or test API key"
    fi
  fi

  # --- Supabase drop/delete database ---
  if echo "$cmd" | grep -qE '(^|[[:space:]]|;|&&|\|\|)supabase[[:space:]]'; then
    if echo "$cmd" | grep -qiE '(db[[:space:]]+reset|db[[:space:]]+drop|drop[[:space:]]+database|delete[[:space:]]+database|DROP[[:space:]]+TABLE|DROP[[:space:]]+SCHEMA)'; then
      block "pre-bash" "$summary" "Blocked: supabase command that drops/deletes database"
    fi
  fi

  # --- Custom blocked commands from config ---
  local custom_blocked
  custom_blocked=$(load_custom_blocked)
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if echo "$cmd" | grep -qF "$pattern"; then
      block "pre-bash" "$summary" "Blocked by custom rule: $pattern"
    fi
  done <<< "$custom_blocked"

  allow "pre-bash" "$summary"
}

# ---------------------------------------------------------------------------
# pre-write: Check a file write before execution
# ---------------------------------------------------------------------------

pre_write() {
  local tool_input="$1"
  local file_path
  file_path=$(echo "$tool_input" | jq -r '.file_path // empty')

  if [[ -z "$file_path" ]]; then
    allow "pre-write" "(empty file_path)"
  fi

  local summary="write: $file_path"
  local project_dir
  project_dir="$(pwd)"

  # --- Block writes outside project directory ---
  # Resolve to absolute path for comparison
  local resolved_path="$file_path"
  # If relative, prepend project dir
  if [[ "$file_path" != /* ]]; then
    resolved_path="$project_dir/$file_path"
  fi

  # Normalize path (resolve ..)
  # Use a simple check: does the resolved path start with the project dir?
  # Also check for .. traversal
  if echo "$resolved_path" | grep -qE '\.\.'; then
    block "pre-write" "$summary" "Blocked: write path contains traversal (..)"
  fi

  if [[ "$resolved_path" != "$project_dir"* ]]; then
    block "pre-write" "$summary" "Blocked: write outside project directory ($project_dir)"
  fi

  # --- Block writes to .env files ---
  local basename
  basename=$(basename "$file_path")
  if [[ "$basename" == ".env" ]] || echo "$basename" | grep -qE '^\.env(\..+)?$'; then
    block "pre-write" "$summary" "Blocked: write to .env file (credentials must be set manually)"
  fi

  # --- Block writes to telemetry consent ---
  if [[ "$resolved_path" == *"/.rouge/telemetry-consent"* ]]; then
    block "pre-write" "$summary" "Blocked: write to telemetry-consent (user sets this manually)"
  fi

  # --- V3: Block writes to safety-critical files ---
  local safety_blocklist=(
    "src/launcher/rouge-loop.js"
    "src/launcher/safety.js"
    "src/launcher/checkpoint.js"
    "src/launcher/rouge-safety-check.sh"
    ".claude/settings.json"
    "rouge.config.json"
  )
  for blocked_file in "${safety_blocklist[@]}"; do
    if [[ "$resolved_path" == *"$blocked_file" ]]; then
      block "pre-write" "$summary" "Blocked: write to safety-critical file ($blocked_file)"
    fi
  done

  allow "pre-write" "$summary"
}

# ---------------------------------------------------------------------------
# post-bash: Log output after execution
# ---------------------------------------------------------------------------

post_bash() {
  local tool_output="$1"
  local exit_code
  exit_code=$(echo "$tool_output" | jq -r '.exitCode // 0')
  local stdout
  stdout=$(echo "$tool_output" | jq -r '.stdout // empty')
  local stderr
  stderr=$(echo "$tool_output" | jq -r '.stderr // empty')

  # Truncate output for logging
  local truncated_stdout="${stdout:0:500}"
  local truncated_stderr="${stderr:0:500}"

  local summary="exit=$exit_code stdout_len=${#stdout} stderr_len=${#stderr}"

  local project_name
  project_name="$(basename "$PWD")"

  local entry
  entry=$(jq -cn \
    --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg hook "post-bash" \
    --arg project "$project_name" \
    --arg summary "$summary" \
    --arg verdict "LOG" \
    --arg exit_code "$exit_code" \
    --arg stdout "$truncated_stdout" \
    --arg stderr "$truncated_stderr" \
    '{timestamp: $ts, hook: $hook, project: $project, command_summary: $summary, verdict: $verdict, exit_code: ($exit_code | tonumber), stdout: $stdout, stderr: $stderr}')

  echo "$entry" >> "$AUDIT_LOG"

  # Detect credential issues in stderr
  if echo "$stderr" | grep -qiE '(unauthorized|authentication failed|invalid.*(token|key|credential)|401|403 forbidden)'; then
    echo "[rouge-safety] WARNING: Possible credential issue detected in command output" >&2
  fi

  exit 0
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  echo "Usage: rouge-safety-check.sh {pre-bash|pre-write|post-bash} <JSON>" >&2
  exit 1
fi

subcommand="$1"
input="${2:-"{}"}"

case "$subcommand" in
  pre-bash)
    pre_bash "$input"
    ;;
  pre-write)
    pre_write "$input"
    ;;
  post-bash)
    post_bash "$input"
    ;;
  *)
    echo "Unknown subcommand: $subcommand" >&2
    exit 1
    ;;
esac
