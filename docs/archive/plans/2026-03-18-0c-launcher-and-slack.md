# 0c: Launcher & Slack Control Plane — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Rouge launcher (bash loop + state machine) and Slack control plane (bot for commands, notifications, and seeding relay).

**Architecture:** Two processes run side-by-side: `rouge-loop.sh` (bash, iterates projects, spawns `claude -p`) and a Slack bot (Node.js/Bolt.js, Socket Mode). They communicate via the filesystem — the bot writes `feedback.json`, the launcher reads it. State lives in `state.json` per project. Notifications go out via Slack webhook (curl from launcher) or `chat.postMessage` (from bot).

**Tech Stack:** Bash, Node.js, @slack/bolt, jq (for JSON parsing in bash)

---

## Milestone 1: Core Launcher (0c.1-0c.5)

### Task 1: Project scaffolding and state.json schema (0c.1 prep)

**Files:**
- Create: `src/launcher/rouge-loop.sh`
- Create: `src/launcher/state-to-prompt.sh`
- Create: `src/launcher/model-for-state.sh`
- Create: `tests/launcher/test-state-to-prompt.sh`
- Create: `projects/.gitkeep`

**Step 1: Create directory structure**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
mkdir -p src/launcher tests/launcher projects
```

**Step 2: Write the state-to-prompt mapping (helper script)**

Create `src/launcher/state-to-prompt.sh`:
```bash
#!/usr/bin/env bash
# Maps a state name to its phase prompt file path.
# Usage: state-to-prompt.sh <state>
# Returns: path to the prompt file, or exits 1 if unknown state.

set -euo pipefail

PROMPT_DIR="$(cd "$(dirname "$0")/../prompts" && pwd)"
STATE="${1:?Usage: state-to-prompt.sh <state>}"

case "$STATE" in
  seeding)           echo "$PROMPT_DIR/seeding/00-swarm-orchestrator.md" ;;
  building)          echo "$PROMPT_DIR/loop/01-building.md" ;;
  test-integrity)    echo "$PROMPT_DIR/loop/02a-test-integrity.md" ;;
  qa-gate)           echo "$PROMPT_DIR/loop/02b-qa-gate.md" ;;
  qa-fixing)         echo "$PROMPT_DIR/loop/03-qa-fixing.md" ;;
  po-reviewing)      echo "$PROMPT_DIR/loop/02c-po-review.md" ;;
  analyzing)         echo "$PROMPT_DIR/loop/04-analyzing.md" ;;
  generating-change-spec) echo "$PROMPT_DIR/loop/05-change-spec-generation.md" ;;
  vision-checking)   echo "$PROMPT_DIR/loop/06-vision-check.md" ;;
  promoting)         echo "$PROMPT_DIR/loop/07-ship-promote.md" ;;
  rolling-back)      echo "$PROMPT_DIR/loop/07-ship-promote.md" ;;  # same prompt, reads state
  ready|waiting-for-human|complete) exit 1 ;;  # not executable states
  *)                 echo "Unknown state: $STATE" >&2; exit 1 ;;
esac
```

**Step 3: Write the model selection helper**

Create `src/launcher/model-for-state.sh`:
```bash
#!/usr/bin/env bash
# Maps a state to the Claude model to use.
# Usage: model-for-state.sh <state>

set -euo pipefail

STATE="${1:?Usage: model-for-state.sh <state>}"

case "$STATE" in
  building|qa-fixing|po-reviewing|analyzing|generating-change-spec|vision-checking)
    echo "opus" ;;
  test-integrity|qa-gate|promoting|rolling-back)
    echo "sonnet" ;;
  *)
    echo "sonnet" ;;  # safe default
esac
```

**Step 4: Write tests for the helpers**

Create `tests/launcher/test-helpers.sh`:
```bash
#!/usr/bin/env bash
# Test state-to-prompt and model-for-state mappings
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../../src/launcher" && pwd)"
PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    ((PASS++))
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'"
    ((FAIL++))
  fi
}

assert_exit() {
  local desc="$1" expected_code="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then
    local actual=0
  else
    local actual=$?
  fi
  if [[ "$expected_code" == "$actual" ]]; then
    ((PASS++))
  else
    echo "FAIL: $desc — expected exit $expected_code, got $actual"
    ((FAIL++))
  fi
}

# state-to-prompt tests
assert_eq "building maps to building prompt" \
  "$(echo "$SCRIPT_DIR/../prompts/loop/01-building.md")" \
  "" # placeholder — we test it returns a path containing the expected filename
RESULT=$("$SCRIPT_DIR/state-to-prompt.sh" building)
[[ "$RESULT" == *"01-building.md" ]] && ((PASS++)) || { echo "FAIL: building prompt path"; ((FAIL++)); }

RESULT=$("$SCRIPT_DIR/state-to-prompt.sh" qa-gate)
[[ "$RESULT" == *"02b-qa-gate.md" ]] && ((PASS++)) || { echo "FAIL: qa-gate prompt path"; ((FAIL++)); }

assert_exit "ready is not executable" 1 "$SCRIPT_DIR/state-to-prompt.sh" ready
assert_exit "waiting-for-human is not executable" 1 "$SCRIPT_DIR/state-to-prompt.sh" waiting-for-human
assert_exit "complete is not executable" 1 "$SCRIPT_DIR/state-to-prompt.sh" complete
assert_exit "unknown state fails" 1 "$SCRIPT_DIR/state-to-prompt.sh" bogus

# model-for-state tests
assert_eq "building uses opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" building)"
assert_eq "qa-gate uses sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" qa-gate)"
assert_eq "analyzing uses opus" "opus" "$("$SCRIPT_DIR/model-for-state.sh" analyzing)"
assert_eq "promoting uses sonnet" "sonnet" "$("$SCRIPT_DIR/model-for-state.sh" promoting)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
```

**Step 5: Run tests**

```bash
chmod +x src/launcher/state-to-prompt.sh src/launcher/model-for-state.sh tests/launcher/test-helpers.sh
bash tests/launcher/test-helpers.sh
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/launcher/ tests/launcher/ projects/.gitkeep
git commit -m "feat(launcher): add state-to-prompt and model-for-state helpers"
```

---

### Task 2: Core launcher loop (0c.1)

**Files:**
- Create: `src/launcher/rouge-loop.sh`

**Step 1: Write the launcher**

Create `src/launcher/rouge-loop.sh`:
```bash
#!/usr/bin/env bash
# The Rouge Launcher — Karpathy Loop of Claude Code invocations.
# Iterates projects, reads state, spawns claude -p for each active phase.
set -euo pipefail

ROUGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECTS_DIR="$ROUGE_ROOT/projects"
LAUNCHER_DIR="$ROUGE_ROOT/src/launcher"
LOG_DIR="$ROUGE_ROOT/logs"
LOOP_DELAY="${ROUGE_LOOP_DELAY:-30}"

mkdir -p "$LOG_DIR"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_DIR/rouge.log"; }

run_phase() {
  local project_dir="$1"
  local project_name
  project_name="$(basename "$project_dir")"
  local state_file="$project_dir/state.json"

  [[ -f "$state_file" ]] || return 0

  local state
  state="$(jq -r '.current_state' "$state_file")"

  # Skip non-executable states
  case "$state" in
    ready|waiting-for-human|complete) return 0 ;;
  esac

  # Check for feedback queue (waiting-for-human with feedback)
  if [[ "$state" == "waiting-for-human" && -f "$project_dir/feedback.json" ]]; then
    log "[$project_name] Feedback found, transitioning from waiting-for-human"
    local paused_from
    paused_from="$(jq -r '.paused_from_state // "building"' "$state_file")"
    jq --arg s "$paused_from" '.current_state = $s' "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"
    state="$paused_from"
  fi

  # Get prompt and model for this state
  local prompt_file model
  prompt_file="$("$LAUNCHER_DIR/state-to-prompt.sh" "$state" 2>/dev/null)" || return 0
  model="$("$LAUNCHER_DIR/model-for-state.sh" "$state")"

  [[ -f "$prompt_file" ]] || { log "[$project_name] Prompt file not found: $prompt_file"; return 1; }

  log "[$project_name] Running phase: $state (model: $model)"

  local prompt_content
  prompt_content="$(cat "$prompt_file")"

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
    log "[$project_name] Phase $state failed with exit code $exit_code"
    return $exit_code
  fi
}

# Main loop
log "Rouge launcher starting. Projects dir: $PROJECTS_DIR"

while true; do
  for project_dir in "$PROJECTS_DIR"/*/; do
    [[ -d "$project_dir" ]] || continue

    local_retries=0
    max_retries=3

    while [[ $local_retries -lt $max_retries ]]; do
      if run_phase "$project_dir"; then
        break
      else
        ((local_retries++))
        local project_name
        project_name="$(basename "$project_dir")"
        log "[$project_name] Retry $local_retries/$max_retries"

        if [[ $local_retries -ge $max_retries ]]; then
          log "[$project_name] Max retries reached. Transitioning to waiting-for-human."
          local state_file="$project_dir/state.json"
          local current_state
          current_state="$(jq -r '.current_state' "$state_file")"
          jq --arg s "$current_state" '.paused_from_state = $s | .current_state = "waiting-for-human"' \
            "$state_file" > "$state_file.tmp" && mv "$state_file.tmp" "$state_file"

          # Send Slack notification if webhook is configured
          if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
            curl -s -X POST "$ROUGE_SLACK_WEBHOOK" \
              -H 'Content-Type: application/json' \
              -d "{\"text\":\"⚠️ [$project_name] Phase $current_state failed 3 times. Moved to waiting-for-human.\"}" \
              > /dev/null 2>&1 || true
          fi
        fi

        sleep 30
      fi
    done
  done

  log "Loop complete. Sleeping ${LOOP_DELAY}s."
  sleep "$LOOP_DELAY"
done
```

**Step 2: Make executable and verify syntax**

```bash
chmod +x src/launcher/rouge-loop.sh
bash -n src/launcher/rouge-loop.sh  # syntax check only
```

Expected: No output (syntax OK).

**Step 3: Commit**

```bash
git add src/launcher/rouge-loop.sh
git commit -m "feat(launcher): implement core rouge-loop.sh with retry and state transitions"
```

---

### Task 3: Rate limit detection (0c.5)

**Files:**
- Modify: `src/launcher/rouge-loop.sh`

**Step 1: Add rate limit detection to run_phase**

In `rouge-loop.sh`, after the `claude -p` invocation, detect rate limit by checking the log output:

Add a function before `run_phase`:
```bash
is_rate_limited() {
  local log_file="$1"
  # Claude Code outputs rate limit messages to stderr/stdout
  tail -20 "$log_file" 2>/dev/null | grep -qi "rate.limit\|too.many.requests\|429" && return 0
  return 1
}
```

In the retry logic, after a failed phase, add rate limit backoff:
```bash
        if is_rate_limited "$LOG_DIR/${project_name}-${state}.log"; then
          local backoff=$((60 * local_retries))  # 60s, 120s, 180s
          log "[$project_name] Rate limited. Backing off ${backoff}s."
          sleep "$backoff"
        else
          sleep 30
        fi
```

**Step 2: Commit**

```bash
git add src/launcher/rouge-loop.sh
git commit -m "feat(launcher): add rate limit detection with exponential backoff"
```

---

### Task 4: Multi-project scanning and Supabase slot management (0c.3, 0c.10)

**Files:**
- Create: `src/launcher/supabase-slots.sh`

**Step 1: Write the Supabase slot manager**

Create `src/launcher/supabase-slots.sh`:
```bash
#!/usr/bin/env bash
# Supabase free tier slot management (2 active project limit).
# Usage: supabase-slots.sh check|pause <ref>|restore <ref>|status <ref>
set -euo pipefail

get_token() {
  # V1 (macOS): extract from keychain
  if command -v security &>/dev/null; then
    local raw
    raw="$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)" || true
    if [[ -n "$raw" ]]; then
      echo "$raw" | base64 -d
      return
    fi
  fi
  # V2 (Linux/Docker): env var
  echo "${SUPABASE_ACCESS_TOKEN:-}"
}

api() {
  local method="$1" path="$2"
  local token
  token="$(get_token)"
  [[ -n "$token" ]] || { echo "No Supabase token found" >&2; return 1; }
  curl -s -X "$method" "https://api.supabase.com/v1$path" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    "${@:3}"
}

case "${1:-help}" in
  check)
    # Count active projects
    api GET "/projects" | jq '[.[] | select(.status == "ACTIVE_HEALTHY")] | length'
    ;;
  pause)
    api POST "/projects/${2:?ref required}/pause"
    ;;
  restore)
    api POST "/projects/${2:?ref required}/restore"
    ;;
  status)
    api GET "/projects/${2:?ref required}" | jq -r '.status'
    ;;
  wait-for)
    # Poll until target status reached (max 5 min)
    local ref="${2:?ref required}" target="${3:?target status required}"
    for i in $(seq 1 30); do
      local current
      current="$(api GET "/projects/$ref" | jq -r '.status')"
      [[ "$current" == "$target" ]] && { echo "$target"; exit 0; }
      sleep 10
    done
    echo "Timeout waiting for $target (current: $current)" >&2
    exit 1
    ;;
  help|*)
    echo "Usage: supabase-slots.sh check|pause <ref>|restore <ref>|status <ref>|wait-for <ref> <status>"
    ;;
esac
```

**Step 2: Test token extraction**

```bash
chmod +x src/launcher/supabase-slots.sh
bash src/launcher/supabase-slots.sh check
```

Expected: `2` (both colourbookpub projects active).

**Step 3: Commit**

```bash
git add src/launcher/supabase-slots.sh
git commit -m "feat(launcher): add Supabase slot management with keychain token extraction"
```

---

### Task 5: Slack webhook notifications (0c.8)

**Files:**
- Create: `src/launcher/notify.sh`

**Step 1: Write the notification helper**

Create `src/launcher/notify.sh`:
```bash
#!/usr/bin/env bash
# Send notifications via Slack webhook.
# Usage: notify.sh <message>
#        notify.sh --block-kit <json-file>
set -euo pipefail

WEBHOOK="${ROUGE_SLACK_WEBHOOK:?Set ROUGE_SLACK_WEBHOOK env var}"

if [[ "${1:-}" == "--block-kit" ]]; then
  curl -s -X POST "$WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d @"${2:?JSON file required}"
else
  curl -s -X POST "$WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg text "$*" '{text: $text}')"
fi
```

**Step 2: Commit**

```bash
chmod +x src/launcher/notify.sh
git add src/launcher/notify.sh
git commit -m "feat(launcher): add Slack webhook notification helper"
```

---

### Task 6: Auth expiry tracking (from Stripe battle-test finding)

**Files:**
- Create: `src/launcher/check-auth-expiry.sh`

**Step 1: Write the auth expiry checker**

Create `src/launcher/check-auth-expiry.sh`:
```bash
#!/usr/bin/env bash
# Check for auth tokens approaching expiry. Run on launcher startup.
set -euo pipefail

WARN_DAYS=7
NOW=$(date +%s)

check_stripe() {
  local config="$HOME/.config/stripe/config.toml"
  [[ -f "$config" ]] || return 0
  local expiry
  expiry="$(grep 'test_mode_key_expires_at' "$config" | head -1 | cut -d"'" -f2 | tr -d '"' | tr -d ' ' | cut -d= -f2)"
  [[ -n "$expiry" ]] || return 0
  local expiry_epoch
  expiry_epoch="$(date -j -f "%Y-%m-%d" "$expiry" +%s 2>/dev/null || date -d "$expiry" +%s 2>/dev/null)" || return 0
  local days_left=$(( (expiry_epoch - NOW) / 86400 ))
  if [[ $days_left -le $WARN_DAYS ]]; then
    echo "⚠️ Stripe CLI key expires in ${days_left} days ($expiry). Run 'stripe login' to renew."
  fi
}

check_stripe
```

**Step 2: Integrate into launcher startup**

Add to the top of `rouge-loop.sh`, after `log "Rouge launcher starting..."`:
```bash
# Check auth expiry on startup
AUTH_WARNINGS="$("$LAUNCHER_DIR/check-auth-expiry.sh" 2>/dev/null)" || true
if [[ -n "$AUTH_WARNINGS" ]]; then
  log "$AUTH_WARNINGS"
  if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
    "$LAUNCHER_DIR/notify.sh" "$AUTH_WARNINGS" || true
  fi
fi
```

**Step 3: Commit**

```bash
chmod +x src/launcher/check-auth-expiry.sh
git add src/launcher/
git commit -m "feat(launcher): add auth expiry tracking with Slack notification"
```

---

## Milestone 2: Slack Bot (0c.6-0c.9, 0c.13-0c.22)

### Task 7: Slack bot scaffolding (0c.6, 0c.7)

**Files:**
- Create: `src/slack/package.json`
- Create: `src/slack/bot.js`
- Create: `src/slack/.env.example`

**Step 1: Initialize the Slack bot project**

```bash
mkdir -p src/slack
cd src/slack
npm init -y
npm install @slack/bolt
```

**Step 2: Create .env.example**

Create `src/slack/.env.example`:
```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ROUGE_PROJECTS_DIR=/path/to/The-Rouge/projects
```

**Step 3: Write the bot**

Create `src/slack/bot.js`:
```javascript
const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR || path.join(__dirname, '../../projects');

// Helper: read state.json for a project
function readState(projectName) {
  const statePath = path.join(PROJECTS_DIR, projectName, 'state.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// Helper: write state.json for a project
function writeState(projectName, state) {
  const statePath = path.join(PROJECTS_DIR, projectName, 'state.json');
  state.timestamp = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

// Helper: list all projects
function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter(d => fs.existsSync(path.join(PROJECTS_DIR, d, 'state.json')));
}

// Helper: write feedback
function writeFeedback(projectName, feedback) {
  const feedbackPath = path.join(PROJECTS_DIR, projectName, 'feedback.json');
  fs.writeFileSync(feedbackPath, JSON.stringify({
    text: feedback,
    timestamp: new Date().toISOString(),
  }, null, 2) + '\n');
}

// Command parser
app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>\s*/, '').trim().toLowerCase();
  const parts = text.split(/\s+/);
  const cmd = parts[0];
  const projectName = parts[1];

  switch (cmd) {
    case 'status': {
      const projects = listProjects();
      if (projects.length === 0) {
        await say('No projects found.');
        return;
      }
      const lines = projects.map(name => {
        const state = readState(name);
        const emoji = {
          building: '🔨', 'qa-gate': '🔍', 'po-reviewing': '👀',
          promoting: '🚀', complete: '✅', 'waiting-for-human': '⏸️',
          ready: '📋', seeding: '🌱',
        }[state?.current_state] || '❓';
        return `${emoji} *${name}*: ${state?.current_state || 'unknown'} (cycle ${state?.cycle_number || 0})`;
      });
      await say(lines.join('\n'));
      break;
    }

    case 'start': {
      if (!projectName) { await say('Usage: `rouge start <project>`'); return; }
      const state = readState(projectName);
      if (!state) { await say(`Project "${projectName}" not found.`); return; }
      if (state.current_state !== 'ready') {
        await say(`"${projectName}" is in state "${state.current_state}", not "ready". Can only start ready projects.`);
        return;
      }
      state.current_state = 'building';
      writeState(projectName, state);
      await say(`🚀 Started "${projectName}". Launcher will pick it up on next iteration.`);
      break;
    }

    case 'pause': {
      if (!projectName) { await say('Usage: `rouge pause <project>`'); return; }
      const state = readState(projectName);
      if (!state) { await say(`Project "${projectName}" not found.`); return; }
      if (state.current_state === 'waiting-for-human' || state.current_state === 'complete' || state.current_state === 'ready') {
        await say(`"${projectName}" is already in "${state.current_state}".`);
        return;
      }
      state.paused_from_state = state.current_state;
      state.current_state = 'waiting-for-human';
      writeState(projectName, state);
      await say(`⏸️ Paused "${projectName}" (was: ${state.paused_from_state}). Use \`rouge resume ${projectName}\` to continue.`);
      break;
    }

    case 'resume': {
      if (!projectName) { await say('Usage: `rouge resume <project>`'); return; }
      const state = readState(projectName);
      if (!state) { await say(`Project "${projectName}" not found.`); return; }
      if (state.current_state !== 'waiting-for-human') {
        await say(`"${projectName}" is not paused (current: ${state.current_state}).`);
        return;
      }
      const resumeTo = state.paused_from_state || 'building';
      state.current_state = resumeTo;
      delete state.paused_from_state;
      writeState(projectName, state);
      await say(`▶️ Resumed "${projectName}" → ${resumeTo}.`);
      break;
    }

    default: {
      // Check if this is feedback for a project in waiting-for-human state
      if (projectName && readState(projectName)?.current_state === 'waiting-for-human') {
        const feedback = parts.slice(1).join(' ');
        writeFeedback(projectName, feedback);
        await say(`📝 Feedback recorded for "${projectName}". Launcher will process it.`);
      } else {
        await say('Commands: `status`, `start <project>`, `pause <project>`, `resume <project>`');
      }
    }
  }
});

(async () => {
  await app.start();
  console.log('⚡ Rouge Slack bot is running (Socket Mode)');
})();
```

**Step 4: Commit**

```bash
git add src/slack/
git commit -m "feat(slack): implement Slack bot with status/start/pause/resume commands"
```

---

### Task 8: Morning briefing trigger (0c.11)

**Files:**
- Create: `src/launcher/briefing-cron.sh`

**Step 1: Write the cron helper**

Create `src/launcher/briefing-cron.sh`:
```bash
#!/usr/bin/env bash
# Writes a trigger file that the launcher detects on next iteration.
# Install via: crontab -e → 0 8 * * * /path/to/briefing-cron.sh
set -euo pipefail

ROUGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo '{"triggered_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$ROUGE_ROOT/trigger-briefing.json"
```

**Step 2: Add briefing detection to launcher**

In `rouge-loop.sh`, add before the project loop:
```bash
  # Check for morning briefing trigger
  if [[ -f "$ROUGE_ROOT/trigger-briefing.json" ]]; then
    log "Morning briefing triggered"
    rm "$ROUGE_ROOT/trigger-briefing.json"
    if [[ -n "${ROUGE_SLACK_WEBHOOK:-}" ]]; then
      # Generate briefing from all project states
      local briefing=""
      for project_dir in "$PROJECTS_DIR"/*/; do
        [[ -d "$project_dir" ]] || continue
        local name state_file
        name="$(basename "$project_dir")"
        state_file="$project_dir/state.json"
        [[ -f "$state_file" ]] || continue
        local state cycle
        state="$(jq -r '.current_state' "$state_file")"
        cycle="$(jq -r '.cycle_number // 0' "$state_file")"
        briefing="$briefing\n• $name: $state (cycle $cycle)"
      done
      "$LAUNCHER_DIR/notify.sh" "☀️ Morning Briefing$briefing" || true
    fi
  fi
```

**Step 3: Commit**

```bash
chmod +x src/launcher/briefing-cron.sh
git add src/launcher/
git commit -m "feat(launcher): add morning briefing cron trigger"
```

---

### Task 9: Integration test with mock project (0c.12)

**Files:**
- Create: `tests/launcher/test-integration.sh`
- Create: `tests/launcher/mock-project/state.json`
- Create: `tests/launcher/mock-project/cycle_context.json`

**Step 1: Create mock project state**

Create `tests/launcher/mock-project/state.json`:
```json
{
  "current_state": "ready",
  "cycle_number": 0,
  "feature_areas": [],
  "current_feature_area": null,
  "confidence_history": [],
  "timestamp": "2026-03-18T00:00:00Z"
}
```

**Step 2: Write integration test**

Create `tests/launcher/test-integration.sh`:
```bash
#!/usr/bin/env bash
# Integration test: verify launcher reads state, skips non-executable states,
# and transitions correctly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCHER_DIR="$SCRIPT_DIR/../../src/launcher"
MOCK_PROJECT="$SCRIPT_DIR/mock-project"
PASS=0
FAIL=0

assert_state() {
  local desc="$1" expected="$2"
  local actual
  actual="$(jq -r '.current_state' "$MOCK_PROJECT/state.json")"
  if [[ "$expected" == "$actual" ]]; then
    ((PASS++))
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'"
    ((FAIL++))
  fi
}

# Test: ready state is not executable
assert_state "starts as ready" "ready"
"$LAUNCHER_DIR/state-to-prompt.sh" ready >/dev/null 2>&1 && { echo "FAIL: ready should not be executable"; ((FAIL++)); } || ((PASS++))

# Test: transition to building via state.json manipulation (simulating Slack bot)
jq '.current_state = "building"' "$MOCK_PROJECT/state.json" > "$MOCK_PROJECT/state.json.tmp" && mv "$MOCK_PROJECT/state.json.tmp" "$MOCK_PROJECT/state.json"
assert_state "transitioned to building" "building"

# Test: building maps to correct prompt
PROMPT="$("$LAUNCHER_DIR/state-to-prompt.sh" building)"
[[ "$PROMPT" == *"01-building.md" ]] && ((PASS++)) || { echo "FAIL: building prompt"; ((FAIL++)); }

# Test: building uses opus
MODEL="$("$LAUNCHER_DIR/model-for-state.sh" building)"
[[ "$MODEL" == "opus" ]] && ((PASS++)) || { echo "FAIL: building model"; ((FAIL++)); }

# Test: feedback.json triggers transition from waiting-for-human
jq '.current_state = "waiting-for-human" | .paused_from_state = "qa-gate"' "$MOCK_PROJECT/state.json" > "$MOCK_PROJECT/state.json.tmp" && mv "$MOCK_PROJECT/state.json.tmp" "$MOCK_PROJECT/state.json"
echo '{"text":"fix the nav","timestamp":"2026-03-18T10:00:00Z"}' > "$MOCK_PROJECT/feedback.json"
assert_state "in waiting-for-human" "waiting-for-human"

# Reset mock
jq '.current_state = "ready"' "$MOCK_PROJECT/state.json" > "$MOCK_PROJECT/state.json.tmp" && mv "$MOCK_PROJECT/state.json.tmp" "$MOCK_PROJECT/state.json"
rm -f "$MOCK_PROJECT/feedback.json"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
```

**Step 3: Run tests**

```bash
chmod +x tests/launcher/test-integration.sh
bash tests/launcher/test-integration.sh
```

**Step 4: Commit**

```bash
git add tests/launcher/
git commit -m "test(launcher): add integration tests with mock project"
```

---

## Milestone 3: Seeding Relay (0c.18-0c.21)

> **Note:** Tasks 0c.18-0c.21 (seeding relay, timeout, completion handler) are the most complex part of 0c. They involve bidirectional message relay between Slack and a long-running `claude -p` session. This is deferred to a separate plan because:
> 1. It depends on the Slack App being created and tested (Task 7 working E2E)
> 2. It may require a different architecture than the simple bot (e.g., a separate process for the relay)
> 3. The core launcher (Milestone 1) and basic Slack commands (Milestone 2) are independently shippable

**Placeholder:** Implement as a follow-up plan after Milestones 1 and 2 are working E2E.

---

## Execution Order

1. **Tasks 1-6** (Milestone 1): Core launcher — sequential, each builds on the last
2. **Task 7** (Milestone 2): Slack bot — independent of launcher, can run in parallel
3. **Task 8**: Morning briefing — depends on launcher (Task 2)
4. **Task 9**: Integration test — depends on Tasks 1-6
5. **Seeding relay**: Separate plan after E2E validation

## Setup Required Before Execution

Before implementing, the user needs to:
1. Create a Slack App at api.slack.com (0c.6) — Socket Mode, Bot Token, App-Level Token
2. Create a Slack incoming webhook for notifications
3. Set env vars: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `ROUGE_SLACK_WEBHOOK`
