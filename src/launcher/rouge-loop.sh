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
  tail -20 "$log_file" 2>/dev/null | grep -qi "rate.limit\|too.many.requests\|429\|hit your limit" && return 0
  return 1
}

# ============================================================================
# FIX #1: State machine transitions
# After each phase completes, advance to the next state based on the
# phase output in cycle_context.json.
# ============================================================================
advance_state() {
  local project_dir="$1"
  local project_name="$(basename "$project_dir")"
  local state_file="$project_dir/state.json"
  local context_file="$project_dir/cycle_context.json"
  local current_state="$(jq -r '.current_state' "$state_file")"
  local next_state=""

  case "$current_state" in
    building)
      # Building done → test integrity
      next_state="test-integrity"
      ;;
    test-integrity)
      # Test integrity done → QA gate
      local verdict=""
      if [[ -f "$context_file" ]]; then
        verdict="$(jq -r '.test_integrity_report.verdict // "PASS"' "$context_file")"
      fi
      if [[ "$verdict" == "FAIL" ]]; then
        # Test integrity failed — rebuild tests then retry
        next_state="test-integrity"
        log "[$project_name] Test integrity FAIL — re-running"
      else
        next_state="qa-gate"
      fi
      ;;
    qa-gate)
      # QA gate → check verdict
      local verdict=""
      if [[ -f "$context_file" ]]; then
        verdict="$(jq -r '.qa_report.verdict // "PASS"' "$context_file")"
      fi
      if [[ "$verdict" == "FAIL" ]]; then
        local fix_attempts="$(jq -r '.qa_fix_attempts // 0' "$state_file")"
        if [[ "$fix_attempts" -ge 3 ]]; then
          next_state="waiting-for-human"
          log "[$project_name] QA failed 3 times — escalating to human"
        else
          next_state="qa-fixing"
          jq ".qa_fix_attempts = $((fix_attempts + 1))" "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
        fi
      else
        next_state="po-reviewing"
      fi
      ;;
    qa-fixing)
      # QA fix done → back to test integrity (then QA will re-run)
      next_state="test-integrity"
      ;;
    po-reviewing)
      # PO review done → analyzing
      next_state="analyzing"
      ;;
    analyzing)
      # Analyzer decides: promote, generate specs, rollback, or notify human
      local action=""
      if [[ -f "$context_file" ]]; then
        action="$(jq -r '.po_review_report.recommended_action // "continue"' "$context_file")"
      fi
      case "$action" in
        continue)
          next_state="vision-checking"
          ;;
        deepen*|broaden)
          next_state="generating-change-spec"
          ;;
        rollback)
          next_state="rolling-back"
          ;;
        notify-human|notify*)
          next_state="waiting-for-human"
          ;;
        *)
          next_state="vision-checking"
          ;;
      esac
      ;;
    generating-change-spec)
      # New specs generated → back to building
      next_state="building"
      # Increment cycle number
      local cycle="$(jq -r '.cycle_number // 0' "$state_file")"
      jq ".cycle_number = $((cycle + 1)) | .qa_fix_attempts = 0" "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
      ;;
    vision-checking)
      # Vision check done → promote
      next_state="promoting"
      ;;
    promoting)
      # Promoted → check if more feature areas remain
      local pending
      pending="$(jq '[.feature_areas[] | select(.status == "pending")] | length' "$state_file")"
      if [[ "$pending" -gt 0 ]]; then
        # Advance to next feature area
        local next_area
        next_area="$(jq -r '[.feature_areas[] | select(.status == "pending")][0].name' "$state_file")"
        jq --arg area "$next_area" '
          .current_feature_area = $area |
          (.feature_areas[] | select(.name == $area)).status = "in-progress" |
          .cycle_number = (.cycle_number + 1) |
          .qa_fix_attempts = 0
        ' "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
        next_state="building"
        log "[$project_name] Advancing to feature area: $next_area"
      else
        next_state="complete"
        log "[$project_name] All feature areas complete!"
      fi
      ;;
    rolling-back)
      # Rolled back → waiting for human
      next_state="waiting-for-human"
      ;;
    *)
      # Unknown or non-transitional state
      return 0
      ;;
  esac

  if [[ -n "$next_state" ]]; then
    log "[$project_name] State transition: $current_state → $next_state"
    jq --arg s "$next_state" '.current_state = $s' "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"

    # Notify on significant transitions
    if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
      case "$next_state" in
        qa-gate)
          "$LAUNCHER_DIR/notify.sh" "🔍 [$project_name] Build complete → QA gate starting" 2>/dev/null || true ;;
        po-reviewing)
          "$LAUNCHER_DIR/notify.sh" "👀 [$project_name] QA passed → PO review starting" 2>/dev/null || true ;;
        promoting)
          "$LAUNCHER_DIR/notify.sh" "🚀 [$project_name] Vision check passed → promoting to production" 2>/dev/null || true ;;
        complete)
          "$LAUNCHER_DIR/notify.sh" "✅ [$project_name] All feature areas complete! Product ready." 2>/dev/null || true ;;
        waiting-for-human)
          "$LAUNCHER_DIR/notify.sh" "⏸️ [$project_name] Needs human input (from: $current_state)" 2>/dev/null || true ;;
      esac
    fi
  fi
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

  # FIX #6: Count files before phase for visibility
  local files_before
  files_before="$(find "$project_dir" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l | tr -d ' ')"

  # FIX #3 & #4: Run Claude from project dir, prompt via stdin
  local phase_log="$LOG_DIR/${project_name}-${state}.log"
  pushd "$project_dir" > /dev/null
  local claude_exit=0
  cat "$prompt_file" | claude -p \
    --dangerously-skip-permissions \
    --model "$model" \
    --max-turns 200 \
    >> "$phase_log" 2>&1 || claude_exit=$?
  popd > /dev/null
  if [[ $claude_exit -eq 0 ]]; then

    # FIX #6: Count files after and log delta
    local files_after
    files_after="$(find "$project_dir" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l | tr -d ' ')"
    local delta=$((files_after - files_before))
    log "[$project_name] Phase $state completed (files: $files_before → $files_after, delta: +$delta)"

    # FIX #5: Log last meaningful line from phase output
    local last_line
    last_line="$(tail -5 "$phase_log" 2>/dev/null | grep -v '^$' | tail -1 | head -c 200)"
    if [[ -n "$last_line" ]]; then
      log "[$project_name] Phase output: $last_line"
    fi

    # FIX #1: Advance the state machine
    advance_state "$project_dir"
    return 0
  else
    log "[$project_name] Phase $state failed (exit $claude_exit)"

    # FIX #5: Log error context
    local error_line
    error_line="$(tail -3 "$phase_log" 2>/dev/null | grep -v '^$' | tail -1 | head -c 200)"
    if [[ -n "$error_line" ]]; then
      log "[$project_name] Error context: $error_line"
    fi

    return $claude_exit
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

          if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
            "$LAUNCHER_DIR/notify.sh" "⚠️ [$project_name] Phase $current_state failed 3 times. Moved to waiting-for-human." 2>/dev/null || true
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
