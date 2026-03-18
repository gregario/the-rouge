#!/usr/bin/env bash
set -euo pipefail

# Resolve paths
ROUGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECTS_DIR="$ROUGE_ROOT/projects"
LAUNCHER_DIR="$ROUGE_ROOT/src/launcher"
LOG_DIR="$ROUGE_ROOT/logs"
LOOP_DELAY="${ROUGE_LOOP_DELAY:-30}"

mkdir -p "$LOG_DIR"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_DIR/rouge.log"; }

is_rate_limited() {
  local log_file="$1"
  tail -20 "$log_file" 2>/dev/null | grep -qi "rate.limit\|too.many.requests\|429" && return 0
  return 1
}

run_phase() {
  local project_dir="$1"
  local project_name="$(basename "$project_dir")"
  local state_file="$project_dir/state.json"

  [[ -f "$state_file" ]] || return 0

  local state="$(jq -r '.current_state' "$state_file")"

  # Check for feedback queue (waiting-for-human with feedback.json present)
  if [[ "$state" == "waiting-for-human" && -f "$project_dir/feedback.json" ]]; then
    log "[$project_name] Feedback found, transitioning from waiting-for-human"
    local paused_from="$(jq -r '.paused_from_state // "building"' "$state_file")"
    jq --arg s "$paused_from" '.current_state = $s' "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
    state="$paused_from"
  fi

  # Get prompt and model — exits 1 for non-executable states
  local prompt_file model
  prompt_file="$("$LAUNCHER_DIR/state-to-prompt.sh" "$state" 2>/dev/null)" || return 0
  model="$("$LAUNCHER_DIR/model-for-state.sh" "$state")"

  [[ -f "$prompt_file" ]] || { log "[$project_name] Prompt file not found: $prompt_file"; return 1; }

  log "[$project_name] Running phase: $state (model: $model)"

  local prompt_content="$(cat "$prompt_file")"

  # Spawn Claude Code
  if claude -p "$prompt_content" \
    --project "$project_dir" \
    --dangerously-skip-permissions \
    --model "$model" \
    --max-turns 200 \
    >> "$LOG_DIR/${project_name}-${state}.log" 2>&1; then
    log "[$project_name] Phase $state completed successfully"
    return 0
  else
    local exit_code=$?
    log "[$project_name] Phase $state failed (exit $exit_code)"
    return $exit_code
  fi
}

# Main loop
log "Rouge launcher starting. Projects dir: $PROJECTS_DIR"

# Check auth expiry on startup
AUTH_WARNINGS="$("$LAUNCHER_DIR/check-auth-expiry.sh" 2>/dev/null)" || true
if [[ -n "$AUTH_WARNINGS" ]]; then
  log "$AUTH_WARNINGS"
  if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
    "$LAUNCHER_DIR/notify.sh" "$AUTH_WARNINGS" 2>/dev/null || true
  fi
fi

while true; do
  # Check for morning briefing trigger
  if [[ -f "$ROUGE_ROOT/trigger-briefing.json" ]]; then
    log "Morning briefing triggered"
    rm "$ROUGE_ROOT/trigger-briefing.json"
    if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
      briefing=""
      for pdir in "$PROJECTS_DIR"/*/; do
        [[ -d "$pdir" ]] || continue
        pname="$(basename "$pdir")"
        pstate="$pdir/state.json"
        [[ -f "$pstate" ]] || continue
        pst="$(jq -r '.current_state' "$pstate")"
        pcycle="$(jq -r '.cycle_number // 0' "$pstate")"
        briefing="${briefing}• ${pname}: ${pst} (cycle ${pcycle})\n"
      done
      "$LAUNCHER_DIR/notify.sh" "$(echo -e "☀️ Morning Briefing\n${briefing}")" 2>/dev/null || true
    fi
  fi

  for project_dir in "$PROJECTS_DIR"/*/; do
    [[ -d "$project_dir" ]] || continue

    retries=0
    max_retries=3

    while [[ $retries -lt $max_retries ]]; do
      if run_phase "$project_dir"; then
        break
      else
        retries=$((retries + 1))
        project_name="$(basename "$project_dir")"
        log "[$project_name] Retry $retries/$max_retries"

        state_file="$project_dir/state.json"
        current_state="$(jq -r '.current_state' "$state_file")"

        if [[ $retries -ge $max_retries ]]; then
          log "[$project_name] Max retries reached. Transitioning to waiting-for-human."
          jq --arg s "$current_state" '.paused_from_state = $s | .current_state = "waiting-for-human"' \
            "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"

          # Notify via Slack if configured
          if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
            curl -s -X POST "$ROUGE_SLACK_WEBHOOK" \
              -H 'Content-Type: application/json' \
              -d "$(jq -n --arg t "⚠️ [$project_name] Phase $current_state failed 3 times. Moved to waiting-for-human." '{text: $t}')" \
              > /dev/null 2>&1 || true
          fi
        fi

        if is_rate_limited "$LOG_DIR/${project_name}-${current_state}.log"; then
          backoff=$((60 * retries))
          log "[$project_name] Rate limited. Backing off ${backoff}s."
          sleep "$backoff"
        else
          sleep 30
        fi
      fi
    done
  done

  log "Loop complete. Sleeping ${LOOP_DELAY}s."
  sleep "$LOOP_DELAY"
done
