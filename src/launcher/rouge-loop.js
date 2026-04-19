#!/usr/bin/env node
/**
 * The Rouge Launcher — Karpathy Loop of Claude Code invocations.
 * Canonical launcher for The Rouge's Karpathy Loop.
 */

// Startup banner — absolute first line written to stderr so that when
// the dashboard spawns us detached with stdout/stderr redirected to
// `<project>/build.log`, any crash during require() or early init
// leaves at least this line behind for diagnosis. Previously an early
// crash resulted in a 0-byte build.log and no indication of what went
// wrong (testimonial's 13-hour silent stall). Keep this BEFORE any
// require — even a broken require on a later line still leaves this
// diagnostic.
process.stderr.write(
  `[${new Date().toISOString().slice(0, 19)}Z] [rouge-loop] starting pid=${process.pid} ` +
  `filter=${process.env.ROUGE_PROJECT_FILTER || '(none)'} ` +
  `node=${process.version} cwd=${process.cwd()}\n`
);

const { execFileSync, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadProjectSecrets } = require('./secrets.js');
const { writeCheckpoint, readLatestCheckpoint, readAllCheckpoints } = require('./checkpoint.js');
const { checkMilestoneLock, promoteMilestone, shouldEscalateForSpin, getCompletedStoryNames, isStoryDuplicate } = require('./safety.js');
const { trackPhaseCost, trackPhaseCostFromLog, checkBudgetCap } = require('./cost-tracker.js');
const { deployWithRetry, shouldBlockMilestoneCheck } = require('./deploy-blocking.js');
const { migrateV2StateToV3 } = require('./state-migration.js');
const { injectPreamble } = require('./preamble-injector.js');
const { getMilestoneTagName } = require('./branch-strategy.js');
const { getModelForPhase } = require('./model-selection.js');
const { buildClaudeEnv } = require('./auth-mode.js');
const { statePath, statePathForWrite, hasStateFile } = require('./state-path.js');
const {
  escalate,
  beginStory,
  advanceStory,
  retryStory,
  setStoryStatus,
  toMilestoneCheck,
  assertInvariants,
} = require('./state-transitions.js');

// Load .env from Rouge root (for ROUGE_SLACK_WEBHOOK, etc.)
{
  const rootEnv = path.join(path.resolve(__dirname, '../..'), '.env');
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const ROUGE_ROOT = path.resolve(__dirname, '../..');

// Resolve the projects directory.
//
// Always lives OUTSIDE the Rouge repo tree (#143). Spawned phase agents
// run with cwd set to a project dir, and Claude Code auto-loads every
// `CLAUDE.md` walking up — so anything inside the Rouge repo picks up
// Rouge's own developer instructions and the agent starts behaving like
// a Rouge contributor instead of the product-building role it was given.
// Storing projects under ~/.rouge/projects puts a clean filesystem
// boundary between the meta-system and the products it builds.
function resolveProjectsDir() {
  if (process.env.ROUGE_PROJECTS_DIR) return process.env.ROUGE_PROJECTS_DIR;
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.rouge', 'projects');
}
const PROJECTS_DIR = resolveProjectsDir();
const LOG_DIR = process.env.ROUGE_LOG_DIR || (
  fs.existsSync(path.join(ROUGE_ROOT, '.git'))
    ? path.join(ROUGE_ROOT, 'logs')
    : path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.rouge', 'logs')
);
const LOOP_DELAY = parseInt(process.env.ROUGE_LOOP_DELAY || '30', 10) * 1000;
const MAX_RETRIES = 3;

fs.mkdirSync(LOG_DIR, { recursive: true });

// --- Secrets loading ---

/**
 * Load secrets from OS credential store for a project.
 * Sets env vars for the current process so they're inherited by child processes.
 * Logs key names only — NEVER values.
 *
 * @param {string} projectDir — absolute path to the project
 * @param {string} projectName — display name for logging
 * @returns {Record<string, string>} — env vars to merge into spawn env
 */
function loadSecretsForProject(projectDir, projectName) {
  try {
    const { env, missing, loaded } = loadProjectSecrets(projectDir);
    if (loaded.length > 0) {
      log(`[${projectName}] Loaded secrets: ${loaded.join(', ')}`);
    }
    if (missing.length > 0) {
      log(`[${projectName}] Missing secrets (non-blocking): ${missing.join(', ')}`);
    }
    return env;
  } catch (err) {
    log(`[${projectName}] Secrets loading failed: ${(err.message || '').slice(0, 200)}`);
    return {};
  }
}

// --- Logging ---

const HAS_TTY = process.stdout.isTTY;
const { log: logLine } = require('./logger.js');

function log(msg) {
  const ts = new Date().toISOString().replace('T', 'T').slice(0, 19) + 'Z';
  const line = `[${ts}] ${msg}`;
  if (HAS_TTY) { try { console.log(line); } catch {} }
  logLine(line);
}

// --- State helpers ---

// --- V2 State-to-Prompt mapping (granularity refactor) ---
// Story-level building + milestone-level evaluation. Clean break from V1.
const STATE_TO_PROMPT = {
  seeding: 'seeding/00-swarm-orchestrator.md',

  // Foundation (enforced — no bypass path)
  'foundation': 'loop/00-foundation-building.md',
  'foundation-eval': 'loop/00-foundation-evaluating.md',

  // Story loop. 'story-diagnosis' was removed from the state machine:
  // full scaffolding existed (prompt, case handler, model selection,
  // cost estimate) but no code path ever transitioned into it. Its
  // intended job — post-failure root-cause before escalating — is now
  // covered by the circuit-breaker → analyzing path + the escalation
  // flow itself.
  'story-building': 'loop/01-building.md',

  // Milestone loop
  'milestone-check': 'loop/02-evaluation-orchestrator.md',
  'milestone-fix': 'loop/03-qa-fixing.md',

  // Progression
  'analyzing': 'loop/04-analyzing.md',
  'generating-change-spec': 'loop/05-change-spec-generation.md',
  'vision-check': 'loop/06-vision-check.md',
  'shipping': 'loop/07-ship-promote.md',
  'final-review': 'loop/10-final-review.md',
};

// Default to opus; override with ROUGE_MODEL env var for testing
const MODEL = process.env.ROUGE_MODEL || 'opus';

// --- Progress-based watchdog (replaces hard per-phase timeouts) ---
// Three conditions, ALL must be true to kill:
//   1. No progress events for PROGRESS_STALE_THRESHOLD
//   2. No log growth for LOG_STALE_THRESHOLD
//   3. Total elapsed time > HARD_CEILING
// This means: opus thinking silently for 15 min is fine (hard ceiling not hit),
// and an agent writing output but not advancing is caught by progress staleness.
const PROGRESS_STALE_THRESHOLD = parseInt(process.env.ROUGE_PROGRESS_STALE || '15', 10) * 60 * 1000; // 15 min no progress events
const LOG_STALE_THRESHOLD = parseInt(process.env.ROUGE_LOG_STALE || '10', 10) * 60 * 1000; // 10 min no log growth
const HARD_CEILING = parseInt(process.env.ROUGE_HARD_CEILING || '60', 10) * 60 * 1000; // 60 min absolute max

// States the loop does not actively advance — either terminal, awaiting
// human input, or pre-build. 'paused' was removed from this set after a
// codebase audit: it was listed here but no code path ever wrote it to
// current_state. If a user-initiated pause ever returns, add it back
// AND route at least one caller through a transition helper so the
// marker is real, not decorative.
const SKIP_STATES = new Set(['seeding', 'ready', 'waiting-for-human', 'escalation', 'complete']);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    // If file exists but is corrupted, try to recover from snapshot
    if (fs.existsSync(filePath)) {
      const fileName = path.basename(filePath);
      const projectDir = path.dirname(filePath);
      const snapshotDir = path.join(projectDir, '.snapshots');
      if (fs.existsSync(snapshotDir)) {
        const snapshots = fs.readdirSync(snapshotDir).sort().reverse();
        for (const snap of snapshots) {
          const snapFile = path.join(snapshotDir, snap, fileName);
          try {
            const data = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
            log(`Recovered ${fileName} from snapshot ${snap}`);
            writeJson(filePath, data); // restore the file
            return data;
          } catch { continue; }
        }
      }
      log(`${filePath} corrupted and no valid snapshot found`);
    }
    return null;
  }
}

function writeJson(filePath, data) {
  // Schema validation (warn-only). Matches filenames to the schemas
  // that live in the repo's `schemas/` dir. Failures don't block the
  // write — we prefer a bad shape on disk over a loop that refuses
  // to progress because validation found a nitpick.
  try {
    const { validate } = require('./schema-validator.js');
    const base = path.basename(filePath);
    if (base === 'state.json') {
      validate('state.json', data, `write ${filePath}`);
    } else if (base === 'cycle_context.json') {
      validate('cycle-context-v3.json', data, `write ${filePath}`);
    } else if (base === 'task_ledger.json') {
      validate('task-ledger-v3.json', data, `write ${filePath}`);
    }
  } catch {
    /* validator unavailable — skip silently */
  }
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

// Valid response types the dashboard emits. Kept here in sync with
// dashboard/src/app/api/projects/[name]/resolve-escalation/route.ts —
// if you add one, update both sides.
const VALID_HUMAN_RESPONSE_TYPES = new Set([
  'guidance',
  'manual-fix-applied',
  'dismiss-false-positive',
  'abort-story',
  // Hand-off mode: human is working through the problem in a direct
  // Claude Code session in the project dir. Keeps the project parked
  // until they submit `resume-after-handoff`.
  'hand-off',
  // User finished the hand-off session. Launcher captures any commits
  // since the escalation fired and writes them as human_resolution
  // context into cycle_context.json.
  'resume-after-handoff',
]);

/**
 * Validate a human_response object against the bidirectional contract.
 * Returns { ok: true } on valid shape, or
 * { ok: false, reason } describing the first failure.
 *
 * Anything that reaches here and fails validation should be treated as
 * malformed (see escalation case in runPhase): the field is removed so
 * the next loop tick doesn't spin on the same corrupt value, and an
 * escalation with tier=999/malformed_response is raised so the user
 * can see what happened.
 */
/**
 * Capture commits made in a project directory since an ISO timestamp.
 * Used by the escalation hand-off flow to summarise what the human
 * changed during their direct Claude Code session. Returns an array
 * of { sha, subject, files_changed[] }, newest first. Returns an
 * empty array if the project isn't a git repo or the operation fails.
 */
function captureCommitsSince(projectDir, sinceIso) {
  try {
    if (!fs.existsSync(path.join(projectDir, '.git'))) return [];
    const { execSync } = require('child_process');
    // %H short-sha | %s subject, one commit per line.
    const log = execSync(
      `git log --since="${sinceIso}" --pretty=format:"%h|%s"`,
      { cwd: projectDir, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (!log) return [];
    return log.split('\n').map((line) => {
      const [sha, ...rest] = line.split('|');
      const subject = rest.join('|');
      let files_changed = [];
      try {
        const raw = execSync(
          `git show --name-only --pretty=format: ${sha}`,
          { cwd: projectDir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        files_changed = raw.split('\n').map((s) => s.trim()).filter(Boolean);
      } catch {
        /* swallow per-commit failure */
      }
      return { sha, subject, files_changed };
    });
  } catch {
    return [];
  }
}

function validateHumanResponse(hr) {
  if (!hr || typeof hr !== 'object' || Array.isArray(hr)) {
    return { ok: false, reason: 'human_response must be an object' };
  }
  if (typeof hr.type !== 'string') {
    return { ok: false, reason: 'human_response.type must be a string' };
  }
  if (!VALID_HUMAN_RESPONSE_TYPES.has(hr.type)) {
    return { ok: false, reason: `human_response.type "${hr.type}" is not one of: ${[...VALID_HUMAN_RESPONSE_TYPES].join(', ')}` };
  }
  if (hr.submitted_at !== undefined) {
    if (typeof hr.submitted_at !== 'string' || Number.isNaN(Date.parse(hr.submitted_at))) {
      return { ok: false, reason: 'human_response.submitted_at must be an ISO-8601 string when present' };
    }
  }
  if (hr.text !== undefined && typeof hr.text !== 'string') {
    return { ok: false, reason: 'human_response.text must be a string when present' };
  }
  return { ok: true };
}

/**
 * Snapshot state.json and cycle_context.json before a phase runs.
 * Snapshots go to {project}/.snapshots/{timestamp}-{phase}/
 * Recovery: copy snapshot files back to project root.
 */
function snapshotState(projectDir, phase) {
  const projectName = path.basename(projectDir);
  const snapshotDir = path.join(projectDir, '.snapshots', `${Date.now()}-${phase}`);
  try {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const stateSrc = statePath(projectDir);
    if (fs.existsSync(stateSrc)) {
      fs.copyFileSync(stateSrc, path.join(snapshotDir, 'state.json'));
    }
    const ctxSrc = path.join(projectDir, 'cycle_context.json');
    if (fs.existsSync(ctxSrc)) {
      fs.copyFileSync(ctxSrc, path.join(snapshotDir, 'cycle_context.json'));
    }
    // Keep only last 20 snapshots to prevent disk bloat
    const snapshots = fs.readdirSync(path.join(projectDir, '.snapshots')).sort();
    while (snapshots.length > 20) {
      const old = snapshots.shift();
      const oldDir = path.join(projectDir, '.snapshots', old);
      try { fs.rmSync(oldDir, { recursive: true }); } catch {}
    }
  } catch (err) {
    log(`[${projectName}] Snapshot failed: ${(err.message || '').slice(0, 100)}`);
  }
}

function notify(msg) {
  if (!process.env.ROUGE_SLACK_WEBHOOK) return;
  try {
    execSync(
      `curl -s -X POST "$ROUGE_SLACK_WEBHOOK" -H 'Content-Type: application/json' -d '${JSON.stringify({ text: msg }).replace(/'/g, "'\\''")}'`,
      { env: process.env, timeout: 10000, stdio: 'ignore' }
    );
  } catch (err) {
    log(`Slack webhook failed: ${(err.message || '').slice(0, 150)}`);
  }
}

function notifyRich(type, args) {
  try {
    execFileSync('node', [
      path.join(__dirname, 'notify-slack.js'),
      type,
      JSON.stringify(args),
    ], { env: process.env, timeout: 15000, stdio: 'pipe' });
  } catch (err) {
    log(`Slack rich notification (${type}) failed: ${(err.message || '').slice(0, 150)}`);
  }
}

function isRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  // Only match Claude CLI rate limit messages, not application code discussing rate limiting.
  // Claude CLI outputs specific phrases like "You've hit your limit" or "Rate limit exceeded. Resets at 5pm"
  // Avoid false positives from code that implements rate limiters or discusses rate limiting.
  const cliPatterns = [
    /you'?ve hit your (?:rate )?limit/,
    /rate limit exceeded/,
    /too many requests.*try again/,
    /\b429\b.*(?:retry|wait|limit)/,
    /usage.*(?:limit|quota).*(?:reset|exceed)/,
  ];
  return cliPatterns.some(p => p.test(lower));
}

/**
 * Parse a reset time like "5pm", "10pm", "5:30pm" into a timestamp (ms).
 * Assumes the reset is today or tomorrow (if the time has already passed today).
 */
function parseResetTime(timeStr) {
  const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const ampm = match[3].toLowerCase();

  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;

  const now = new Date();
  const reset = new Date(now);
  reset.setHours(hours, minutes, 0, 0);

  // If reset time already passed today, it means tomorrow
  if (reset <= now) {
    reset.setDate(reset.getDate() + 1);
  }

  return reset.getTime();
}

function countFiles(dir) {
  try {
    const result = execSync(
      `find "${dir}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l`,
      { encoding: 'utf8', timeout: 10000 }
    );
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

// --- V2 State machine transitions (granularity refactor) ---
// Two-cadence model: story loop (fast, per-story) + milestone loop (slow, batched evaluation).
// See docs/design/state-schema-v2.md for the full state machine diagram.

/**
 * Find the next eligible story in a milestone.
 * Respects dependencies: a story is eligible only if all depends_on are 'done'.
 * Auto-blocks stories whose dependencies are blocked.
 */
function findNextStory(milestone, flatStories) {
  const doneIds = new Set(flatStories.filter(s => s.status === 'done').map(s => s.id));
  for (const s of milestone.stories || []) {
    if (s.status !== 'pending' && s.status !== 'retrying') continue;
    const deps = s.depends_on || [];
    // If any dependency is blocked, block this story too
    const blockedDep = deps.find(d => {
      const dep = flatStories.find(x => x.id === d);
      return dep && dep.status === 'blocked';
    });
    if (blockedDep) {
      s.status = 'blocked';
      s.blocked_by = `dependency:${blockedDep}`;
      continue;
    }
    if (deps.every(d => doneIds.has(d))) return s;
  }
  return null;
}

/**
 * Find the next eligible milestone (respects milestone-level dependencies).
 */
function findNextMilestone(state) {
  const completed = new Set(
    (state.milestones || [])
      .filter(m => m.status === 'complete' || m.status === 'partial')
      .map(m => m.name)
  );
  for (const m of state.milestones || []) {
    if (m.status !== 'pending') continue;
    if ((m.depends_on_milestones || []).every(d => completed.has(d))) return m;
  }
  return null;
}

/** Flat list of all stories across all milestones. */
function flatStories(state) {
  return (state.milestones || []).flatMap(m => m.stories || []);
}

/** True if every story in a milestone is done, blocked, or skipped. */
function isBatchComplete(milestone) {
  return (milestone.stories || []).every(s =>
    s.status === 'done' || s.status === 'blocked' || s.status === 'skipped'
  );
}

/** Record a fix_memory entry for a story. */
function recordFixMemory(state, storyId, entry) {
  if (!state.fix_memory) state.fix_memory = {};
  if (!state.fix_memory[storyId]) state.fix_memory[storyId] = [];
  state.fix_memory[storyId].push(entry);
}

/**
 * Start building a story — delegates to the atomic helper so story
 * status, current_milestone, and current_story move in lockstep. The
 * function kept its local signature (positional args) so existing
 * callers didn't all have to change shape when the helper landed.
 */
function startStory(state, milestone, story) {
  return beginStory(state, { milestone, story });
}

// ---------------------------------------------------------------------------
// Layer 4 (#103): Intent-based infrastructure callbacks.
//
// Claude writes intent to pending-action.json instead of running infra
// commands directly. The launcher validates the intent against the project's
// infrastructure_manifest.json / vision.json and executes on Claude's behalf.
//
// Phase 1 (this implementation): backwards-compatible. Claude CAN still run
// commands directly via --dangerously-skip-permissions. If pending-action.json
// exists after a phase, the launcher handles it. If it doesn't, nothing changes.
//
// Phase 2 (future): drop --dangerously-skip-permissions, enforce --allowedTools.
// ---------------------------------------------------------------------------

const INFRA_ACTION_HANDLERS = {
  'deploy-staging': (params, projectDir) => {
    const { deploy } = require('./deploy-to-staging.js');
    const url = deploy(projectDir);
    return url
      ? { status: 'success', result: { url, timestamp: new Date().toISOString() } }
      : { status: 'failed', reason: 'Deploy returned null — check rouge.log for details' };
  },

  'deploy-production': (params, projectDir) => {
    // Production deploy uses the same handler with explicit environment
    const { deploy } = require('./deploy-to-staging.js');
    const url = deploy(projectDir);
    return url
      ? { status: 'success', result: { url, timestamp: new Date().toISOString() } }
      : { status: 'failed', reason: 'Production deploy returned null' };
  },

  'db-migrate': (params, projectDir) => {
    const manifest = readJson(path.join(projectDir, 'infrastructure_manifest.json'));
    const provider = params.provider || manifest?.database?.provider || 'unknown';
    try {
      if (provider === 'supabase') {
        const ref = params.project_ref || readJson(path.join(projectDir, 'cycle_context.json'))?.supabase?.project_ref;
        if (!ref) return { status: 'failed', reason: 'No Supabase project ref found' };
        execSync(`supabase db push --project-ref ${ref}`, { cwd: projectDir, encoding: 'utf8', timeout: 60000 });
      } else if (provider === 'neon' || provider === 'drizzle') {
        execSync('npx drizzle-kit migrate', { cwd: projectDir, encoding: 'utf8', timeout: 60000 });
      } else {
        return { status: 'failed', reason: `Unknown database provider: ${provider}` };
      }
      return { status: 'success', result: { provider, timestamp: new Date().toISOString() } };
    } catch (err) {
      return { status: 'failed', reason: err.message.slice(0, 300) };
    }
  },

  'db-seed': (params, projectDir) => {
    const script = params.script || 'npm run seed';
    // Security: script must not contain absolute paths or ..
    if (script.includes('..') || path.isAbsolute(script)) {
      return { status: 'refused', reason: 'Script path must be relative to project dir, no ..' };
    }
    try {
      execSync(script, { cwd: projectDir, encoding: 'utf8', timeout: 60000 });
      return { status: 'success', result: { script, timestamp: new Date().toISOString() } };
    } catch (err) {
      return { status: 'failed', reason: err.message.slice(0, 300) };
    }
  },

  'git-push': (params, projectDir) => {
    const remote = params.remote || 'origin';
    const branch = params.branch || 'HEAD';
    // NEVER force push
    if (params.force) {
      return { status: 'refused', reason: 'Force push is never allowed. See #103 isolation rules.' };
    }
    try {
      execSync(`git push ${remote} ${branch}`, { cwd: projectDir, encoding: 'utf8', timeout: 30000 });
      return { status: 'success', result: { remote, branch, timestamp: new Date().toISOString() } };
    } catch (err) {
      return { status: 'failed', reason: err.message.slice(0, 300) };
    }
  },

  'git-tag': (params, projectDir) => {
    const tagName = params.tag_name;
    if (!tagName) return { status: 'refused', reason: 'tag_name is required' };
    try {
      execSync(`git tag "${tagName}"`, { cwd: projectDir, encoding: 'utf8', timeout: 10000 });
      return { status: 'success', result: { tag: tagName, timestamp: new Date().toISOString() } };
    } catch (err) {
      return { status: 'failed', reason: err.message.slice(0, 300) };
    }
  },
};

/**
 * Process a pending infrastructure action written by Claude.
 * Reads pending-action.json, validates, dispatches to the appropriate handler,
 * writes the result to action-result.json, and cleans up.
 *
 * @param {string} projectDir - absolute path to the project
 * @param {object} state - current state.json contents
 * @returns {{ handled: boolean, action?: string, result?: object }}
 */
function processInfraAction(projectDir, state) {
  const actionFile = path.join(projectDir, 'pending-action.json');
  if (!fs.existsSync(actionFile)) return { handled: false };

  const action = readJson(actionFile);
  if (!action || !action.action) {
    log(`[${path.basename(projectDir)}] Invalid pending-action.json — missing 'action' field`);
    fs.unlinkSync(actionFile);
    return { handled: false };
  }

  const actionType = action.action;
  const params = action.params || {};
  const projectName = path.basename(projectDir);

  log(`[${projectName}] Infrastructure intent: ${actionType} (reason: ${action.reason || 'none given'})`);

  const handler = INFRA_ACTION_HANDLERS[actionType];
  let result;

  if (!handler) {
    result = {
      action: actionType,
      status: 'refused',
      reason: `Unknown action type "${actionType}". Supported: ${Object.keys(INFRA_ACTION_HANDLERS).join(', ')}`,
    };
    log(`[${projectName}] Intent refused: unknown action type "${actionType}"`);
  } else {
    try {
      const handlerResult = handler(params, projectDir, state);
      result = { action: actionType, ...handlerResult };
      log(`[${projectName}] Intent ${actionType}: ${result.status}`);
    } catch (err) {
      result = { action: actionType, status: 'failed', reason: `Handler threw: ${err.message.slice(0, 300)}` };
      log(`[${projectName}] Intent ${actionType} error: ${err.message.slice(0, 200)}`);
    }
  }

  // Write result for Claude to read on next invocation
  const resultFile = path.join(projectDir, 'action-result.json');
  writeJson(resultFile, result);

  // Clean up the consumed action
  fs.unlinkSync(actionFile);

  // Log to interventions.jsonl for audit trail
  const interventionsFile = path.join(projectDir, 'interventions.jsonl');
  try {
    fs.appendFileSync(interventionsFile, JSON.stringify({
      type: 'infra-action',
      action: actionType,
      status: result.status,
      reason: action.reason || null,
      timestamp: new Date().toISOString(),
    }) + '\n');
  } catch {}

  return { handled: true, action: actionType, result };
}

async function advanceState(projectDir) {
  const projectName = path.basename(projectDir);
  const stateFile = statePath(projectDir);
  const contextFile = path.join(projectDir, 'cycle_context.json');
  const checkpointsFile = path.join(projectDir, 'checkpoints.jsonl');
  const state = readJson(stateFile);
  if (!state) return;

  const current = state.current_state;
  const flat = flatStories(state);
  let next = null;

  // V3: Write checkpoint before state transition
  // Include story_results (derived from flat stories) for dedup detection
  const storyResults = flat
    .filter(s => s.status === 'done' || s.status === 'blocked')
    .map(s => ({ name: s.name || s.id, outcome: s.status === 'done' ? 'pass' : 'blocked' }));

  writeCheckpoint(checkpointsFile, {
    phase: current,
    state: {
      current_milestone: state.current_milestone,
      current_story: state.current_story,
      promoted_milestones: state.promoted_milestones || [],
      consecutive_failures: state.consecutive_failures || 0,
      stories_executed: state.stories_executed || [],
      story_results: storyResults,
    },
    costs: state.costs || {},
  });

  switch (current) {

    // ──────────────────────────────────────────────
    // Foundation (ENFORCED — always runs evaluator)
    // ──────────────────────────────────────────────

    case 'foundation': {
      state.foundation = state.foundation || {};
      state.foundation.status = 'evaluating';
      writeJson(stateFile, state);
      next = 'foundation-eval';
      log(`[${projectName}] Foundation build done — evaluating (enforced, no bypass)`);
      break;
    }

    case 'foundation-eval': {
      const ctx = readJson(contextFile);
      const verdict = ctx?.foundation_eval_report?.verdict || 'PASS';

      if (verdict !== 'PASS') {
        next = 'foundation';
        log(`[${projectName}] Foundation eval FAIL — retrying`);
        break;
      }

      state.foundation.status = 'complete';
      state.foundation.completed_at = new Date().toISOString();
      // Load task_ledger milestones into state.milestones if they're
      // missing. V3 projects that complete seeding but don't go
      // through the approval handshake end up with state.milestones=[]
      // while task_ledger holds the real decomposition. Without this,
      // findNextMilestone below returns undefined and the foundation-
      // eval → escalation path fires for a purely synthetic reason.
      if (!Array.isArray(state.milestones) || state.milestones.length === 0) {
        try {
          const ledgerPath = path.join(projectDir, 'task_ledger.json');
          if (fs.existsSync(ledgerPath)) {
            const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
            if (Array.isArray(ledger.milestones) && ledger.milestones.length > 0) {
              state.milestones = ledger.milestones;
              log(`[${projectName}] Loaded ${ledger.milestones.length} milestones from task_ledger.json`);
            }
          }
        } catch (err) {
          log(`[${projectName}] Could not load milestones from task_ledger: ${(err.message || '').slice(0, 100)}`);
        }
      }
      // Also mark the foundation milestone as complete so findNextMilestone skips it
      const foundationMilestone = (state.milestones || []).find(m => m.name === 'foundation');
      if (foundationMilestone) foundationMilestone.status = 'complete';
      writeJson(stateFile, state);
      log(`[${projectName}] Foundation PASS`);

      // Contribute integration patterns
      try {
        const { contributeAllDrafts } = require('./contribute-pattern.js');
        const { contributed } = contributeAllDrafts(
          (msg) => log(`[${projectName}] ${msg}`),
          projectName,
        );
        if (contributed.length > 0) {
          log(`[${projectName}] Contributed ${contributed.length} pattern(s)`);
        }
      } catch (err) {
        log(`[${projectName}] Pattern contribution failed: ${(err.message || '').slice(0, 100)}`);
      }

      // FIX #19: Auto-create private GitHub repo as a safety net.
      // If the machine dies mid-build, work isn't lost. At promotion, the user
      // decides: make public, keep private, change license, transfer org.
      try {
        const hasRemote = (() => {
          try {
            execSync('git remote get-url origin', { cwd: projectDir, encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
            return true;
          } catch { return false; }
        })();
        if (!hasRemote) {
          log(`[${projectName}] Creating private GitHub repo as backup...`);
          // Ensure we have an initial commit to push
          try { execSync('git add -A && git diff --cached --quiet || git commit -m "rouge: initial project scaffold"', { cwd: projectDir, encoding: 'utf8', timeout: 30000, stdio: 'pipe', shell: true }); } catch {}
          // Resolve the GitHub owner from env > rouge.config.json >
          // `gh` CLI's authenticated user. Hardcoding a single owner here
          // was a bug — it would create every user's product repos under
          // the upstream author's account.
          const ghOwner = (() => {
            if (process.env.ROUGE_GITHUB_OWNER) return process.env.ROUGE_GITHUB_OWNER;
            try {
              const cfg = readJson(path.join(ROUGE_ROOT, 'rouge.config.json'));
              if (cfg?.github_owner) return cfg.github_owner;
            } catch {}
            try {
              return execSync('gh api user --jq .login', {
                encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
              }).trim();
            } catch { return null; }
          })();
          if (!ghOwner) {
            log(`[${projectName}] No GitHub owner resolved (set ROUGE_GITHUB_OWNER or run \`gh auth login\`) — skipping repo creation`);
          } else {
            const repoOutput = execSync(
              `gh repo create "${ghOwner}/${projectName}" --private --source=. --push 2>&1 || true`,
              { cwd: projectDir, encoding: 'utf8', timeout: 60000, stdio: 'pipe' }
            );
            if (repoOutput.includes('github.com')) {
              const repoUrl = repoOutput.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || `https://github.com/${ghOwner}/${projectName}`;
              log(`[${projectName}] Private repo created: ${repoUrl}`);
              state.github_repo = repoUrl;
              writeJson(stateFile, state);
            } else {
              log(`[${projectName}] GitHub repo creation skipped or failed (non-blocking): ${repoOutput.slice(0, 150)}`);
            }
          }
        } else {
          log(`[${projectName}] GitHub remote already exists — skipping repo creation`);
          // Push latest foundation work to existing remote
          try { execSync('git push origin HEAD 2>&1 || true', { cwd: projectDir, encoding: 'utf8', timeout: 30000, stdio: 'pipe' }); } catch {}
        }
      } catch (err) {
        log(`[${projectName}] GitHub repo setup failed (non-blocking): ${(err.message || '').slice(0, 150)}`);
      }

      // Provision cloud dev infrastructure ONCE before stories start
      log(`[${projectName}] Provisioning dev infrastructure...`);
      try {
        execFileSync('node', [path.join(__dirname, 'provision-infrastructure.js'), projectDir], {
          encoding: 'utf8', timeout: 300000, stdio: 'inherit',
        });
        // Verify we got a staging URL
        const updatedCtx = readJson(contextFile);
        if (updatedCtx?.infrastructure?.staging_url) {
          log(`[${projectName}] Staging URL: ${updatedCtx.infrastructure.staging_url}`);
        } else {
          log(`[${projectName}] WARNING: No staging URL after provisioning — milestone checks will use local dev server`);
        }
      } catch (err) {
        log(`[${projectName}] Provisioning failed: ${(err.message || '').slice(0, 200)}`);
        log(`[${projectName}] Escalating — can't build without infrastructure`);
        next = 'escalation';
        if (!state.escalations) state.escalations = [];
        state.escalations.push({
          id: 'esc-provisioning-failed',
          tier: 1,
          classification: 'infrastructure-gap',
          summary: 'Cloud infrastructure provisioning failed. Check CLOUDFLARE_API_TOKEN, SUPABASE_ACCESS_TOKEN env vars.',
          story_id: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        writeJson(stateFile, state);
        break;
      }

      // Start first milestone. Informative escalations replace the
      // old `next = 'escalation'` fallbacks so users see WHY the loop
      // stopped, not a generic placeholder.
      const milestone = findNextMilestone(state);
      if (!milestone) {
        next = escalate(state, {
          id: `esc-no-next-milestone-${Date.now()}`,
          tier: 1,
          classification: 'no-milestones-defined',
          summary:
            'Foundation is complete but no milestones are in state.milestones or task_ledger.json. ' +
            'The seeding step that decomposes the spec into milestones likely didn\'t finish. ' +
            'Reset to Ready and re-run seeding, or populate task_ledger.json manually.',
        });
        break;
      }
      milestone.status = 'in-progress';
      const story = findNextStory(milestone, flat);
      if (!story) {
        next = escalate(state, {
          id: `esc-no-next-story-${Date.now()}`,
          tier: 1,
          classification: 'empty-milestone',
          summary:
            `Foundation-eval passed but milestone "${milestone.name}" has no stories to build. ` +
            'Check task_ledger.json — every milestone should have a non-empty stories array.',
          story_id: null,
        });
        break;
      }
      next = startStory(state, milestone, story);
      log(`[${projectName}] Starting milestone "${milestone.name}", story "${story.id}"`);
      break;
    }

    // ──────────────────────────────────────────────
    // Story loop (inner, fast)
    // ──────────────────────────────────────────────

    case 'story-building': {
      const ctx = readJson(contextFile);
      const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
      if (!milestone) {
        // Happens when a story completed on the previous tick but the
        // current_milestone pointer now references something that's
        // been removed or renamed. Escalate with a concrete reason so
        // the user sees what went wrong instead of a generic
        // placeholder synthesized by the dispatcher fallback.
        next = escalate(state, {
          id: `esc-story-building-missing-milestone-${Date.now()}`,
          tier: 1,
          classification: 'state-drift',
          summary: `story-building entered but current_milestone='${state.current_milestone}' is not in state.milestones. Possible state corruption; reset to Ready and re-run.`,
        });
        break;
      }
      const story = (milestone.stories || []).find(s => s.id === state.current_story);
      if (!story) {
        // Testimonial's symptom at 15:34:14: story M1-S1.1 completed
        // successfully (+87 files), pre-dispatch advanced current_story
        // to the next pending id, then story-building re-entered
        // without claude producing a story_result — resulting in
        // "milestone found, next-story pointer valid, but the named
        // story wasn't in milestone.stories" for some timing window.
        // Escalate with context rather than silently advancing to an
        // unspecified escalation placeholder.
        next = escalate(state, {
          id: `esc-story-building-missing-story-${Date.now()}`,
          tier: 1,
          classification: 'state-drift',
          summary: `story-building entered but current_story='${state.current_story}' is not in milestone '${state.current_milestone}'. Possible pre-dispatch advance race; reset to Ready and re-run.`,
        });
        break;
      }

      const result = ctx?.story_result || {};
      const outcome = result.outcome || 'pass';

      if (outcome === 'pass') {
        story.status = 'done';
        story.completed_at = new Date().toISOString();
        story.files_changed = result.files_changed || [];
        story.env_limitations = result.env_limitations || [];
        state.consecutive_failures = 0;

        // V3: Track story execution for spin detection
        if (!state.stories_executed) state.stories_executed = [];
        state.stories_executed.push({
          name: story.name || story.id,
          delta: state.last_build_delta || 0,
          duration_ms: 0,
        });
        if (state.last_build_delta > 0) {
          state.last_meaningful_progress_at = Date.now();
        }

        // No deploy here — deploy happens once before milestone-check

        // If this story was retried (attempts > 1), extract a fix pattern
        if ((story.attempts || 0) > 1 && state.fix_memory?.[story.id]?.length > 0) {
          const lastFailure = state.fix_memory[story.id].slice(-1)[0];
          const patternKey = lastFailure.classification || 'unknown';
          if (!state.fix_patterns) state.fix_patterns = {};
          if (state.fix_patterns[patternKey]) {
            state.fix_patterns[patternKey].occurrences += 1;
          } else {
            state.fix_patterns[patternKey] = {
              pattern: patternKey,
              symptom: lastFailure.symptom || '',
              fix: lastFailure.fix || result.fix_attempted || '',
              story_id: story.id,
              first_seen: new Date().toISOString(),
              occurrences: 1,
            };
          }
        }

      } else if (outcome === 'blocked') {
        story.blocked_by = result.blocked_by || 'unknown';
        story.attempts = (story.attempts || 0) + 1;
        state.consecutive_failures = (state.consecutive_failures || 0) + 1;

        recordFixMemory(state, story.id, {
          attempt: story.attempts,
          symptom: result.symptom || '',
          diagnosis: result.diagnosis || '',
          classification: result.classification || '',
          fix: result.fix_attempted || '',
          outcome: 'blocked',
          files_changed: result.files_changed || [],
        });

        // Set status + optionally raise escalation through the atomic
        // helper. Before the helper existed, this code pushed an
        // escalation object but left current_state as 'story-building',
        // so the dashboard saw a zombie "building" project that was
        // actually blocked. The helper returns 'escalation' when an
        // escalation is attached; caller threads that into `next`.
        const transitionTo = setStoryStatus(state, {
          story,
          status: 'blocked',
          escalation: result.escalation
            ? {
                id: `esc-${story.id}-${story.attempts}`,
                tier: result.escalation.tier || 1,
                classification: result.classification || 'unknown',
                summary: result.escalation.summary || result.symptom || 'Story blocked',
              }
            : null,
        });
        if (transitionTo) next = transitionTo;

      } else {
        // fail — will be retried
        story.status = 'pending';
        story.attempts = (story.attempts || 0) + 1;
        state.consecutive_failures = (state.consecutive_failures || 0) + 1;

        recordFixMemory(state, story.id, {
          attempt: story.attempts,
          symptom: result.symptom || '',
          diagnosis: result.diagnosis || '',
          classification: result.classification || '',
          fix: result.fix_attempted || '',
          outcome: 'fail',
          files_changed: result.files_changed || [],
        });
      }

      writeJson(stateFile, state);

      // FIX #19: Push to GitHub backup after each story (non-blocking).
      // Only if a remote exists (set up during foundation-eval PASS).
      if (outcome === 'pass' && state.github_repo) {
        try {
          execSync('git push origin HEAD 2>&1 || true', { cwd: projectDir, encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
        } catch {}
      }

      // V3: Spin detection — escalate if loop is spinning without progress
      const spinReason = shouldEscalateForSpin({
        stories_executed: state.stories_executed || [],
        last_meaningful_progress_at: state.last_meaningful_progress_at || Date.now(),
      }, {
        zero_delta_threshold: 3,
        time_stall_minutes: 30,
      });
      if (spinReason) {
        log(`[${projectName}] Spin detected: ${spinReason}`);
        if (!state.escalations) state.escalations = [];
        state.escalations.push({
          id: `esc-spin-${Date.now()}`,
          tier: 2,
          classification: 'spin-detection',
          summary: spinReason,
          story_id: state.current_story || null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        writeJson(stateFile, state);
        next = 'escalation';
        break;
      }

      // Circuit breaker: 3+ consecutive failures → early diagnostic
      if ((state.consecutive_failures || 0) >= 3) {
        log(`[${projectName}] Circuit breaker: ${state.consecutive_failures} consecutive failures`);

        // Write story failures to cycle_context so analyzing has data to diagnose
        const cbCtx = readJson(contextFile);
        if (cbCtx) {
          const recentStories = (milestone.stories || [])
            .filter(s => s.status === 'blocked' || s.status === 'pending')
            .slice(-3);
          cbCtx._circuit_breaker = true;
          cbCtx.story_failures = recentStories.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status,
            attempts: s.attempts || 0,
            blocked_by: s.blocked_by || null,
            fix_memory: (state.fix_memory || {})[s.id] || [],
          }));
          writeJson(contextFile, cbCtx);
        }

        next = 'analyzing';
        break;
      }

      // Batch complete? Check if any stories actually passed.
      if (isBatchComplete(milestone)) {
        const doneCount = (milestone.stories || []).filter(s => s.status === 'done').length;
        const blockedCount = (milestone.stories || []).filter(s => s.status === 'blocked').length;

        // All blocked, none done — nothing to evaluate, escalate
        if (doneCount === 0 && blockedCount > 0) {
          log(`[${projectName}] Milestone "${milestone.name}": all ${blockedCount} stories blocked, zero done — escalating`);
          if (!state.escalations) state.escalations = [];
          state.escalations.push({
            id: `esc-milestone-all-blocked-${milestone.name}`,
            tier: 2,
            classification: 'infrastructure-gap',
            summary: `All ${blockedCount} stories in milestone "${milestone.name}" are blocked. No progress possible without resolving blockers.`,
            story_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          });
          writeJson(stateFile, state);
          next = 'escalation';
          break;
        }

        log(`[${projectName}] Milestone "${milestone.name}" batch complete (${doneCount} done, ${blockedCount} blocked) — deploying to staging`);
        // V3: Deploy with retry + blocking
        const { deploy } = require('./deploy-to-staging');
        const deployResult = await deployWithRetry(() => deploy(projectDir), { maxRetries: 3, retryDelayMs: 30000, logger: log });
        if (shouldBlockMilestoneCheck(deployResult)) {
          log(`[${projectName}] Deploy failed after retries — blocking milestone-check`);
          notifyRich('deploy-failure', {
            project: projectName,
            attempts: deployResult?.attempts || 3,
            reason: deployResult?.reason || 'Staging deploy failed',
          });
          if (!state.escalations) state.escalations = [];
          state.escalations.push({
            id: `esc-deploy-failed-${Date.now()}`,
            tier: 1,
            classification: 'deploy-failure',
            summary: deployResult?.reason || 'Staging deploy failed',
            story_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          });
          writeJson(stateFile, state);
          next = 'escalation';
        } else {
          log(`[${projectName}] Staging deploy complete: ${deployResult.url}`);
          next = 'milestone-check';
        }
        break;
      }

      // Next story (V3: skip duplicates)
      let eligible = findNextStory(milestone, flatStories(state));
      if (eligible) {
        const completedNames = getCompletedStoryNames(readAllCheckpoints(checkpointsFile));
        while (eligible && isStoryDuplicate(eligible.name || eligible.id, completedNames)) {
          log(`[${projectName}] Skipping duplicate story: ${eligible.name || eligible.id}`);
          eligible.status = 'done';
          eligible.completed_at = new Date().toISOString();
          eligible = findNextStory(milestone, flatStories(state));
        }
      }
      if (eligible) {
        next = startStory(state, milestone, eligible);
        writeJson(stateFile, state);
        log(`[${projectName}] Next story: ${eligible.id}`);
      } else {
        log(`[${projectName}] No eligible stories — milestone check`);
        next = 'milestone-check';
      }
      break;
    }

    // ──────────────────────────────────────────────
    // Milestone loop (outer, batched evaluation)
    // ──────────────────────────────────────────────

    case 'milestone-check': {
      const ctx = readJson(contextFile);
      const qaVerdict = ctx?.evaluation_report?.qa?.verdict || 'PASS';
      const designVerdict = ctx?.evaluation_report?.design?.verdict || 'PASS';
      const poVerdict = ctx?.evaluation_report?.po?.verdict || 'READY';

      // Route to milestone-fix when any lens fails hard. Prior version
      // only checked QA; PO NEEDS_IMPROVEMENT and Design FAIL silently
      // advanced to analyzing, dropping real quality signal. Audit
      // prompt-regression finding #1. Soft verdicts (PO NOT_READY,
      // Design NEEDS_IMPROVEMENT) also loop back to fixing — they're
      // intentionally distinct from "ready".
      const lensFail =
        qaVerdict === 'FAIL' ||
        designVerdict === 'FAIL' || designVerdict === 'NEEDS_IMPROVEMENT' ||
        poVerdict === 'NOT_READY' || poVerdict === 'NEEDS_IMPROVEMENT';

      if (lensFail) {
        next = 'milestone-fix';
        log(`[${projectName}] Milestone evaluation FAIL (qa=${qaVerdict}, design=${designVerdict}, po=${poVerdict}) — fixing`);
      } else {
        // V3: Capture screenshots after milestone evaluation passes
        try {
          const { captureScreenshots } = require('./capture-screenshots');
          const screenshots = captureScreenshots(projectDir, state.cycle_number || 0);
          if (screenshots.length > 0) {
            log(`[${projectName}] Captured ${screenshots.length} milestone screenshots`);
            state._last_screenshots = screenshots.map(s => s.file);
            writeJson(stateFile, state);
            notifyRich('milestone-screenshots', {
              project: projectName,
              milestone: state.current_milestone,
              screenshots: screenshots.map(s => s.file),
            });
          }
        } catch (err) {
          log(`[${projectName}] Screenshot capture failed (non-blocking): ${(err.message || '').slice(0, 200)}`);
        }
        next = 'analyzing';
        log(`[${projectName}] Milestone PASS — analyzing`);
      }
      break;
    }

    case 'milestone-fix': {
      // After fixes, go back to milestone-check which will redeploy before evaluating
      next = 'milestone-check';
      break;
    }

    // ──────────────────────────────────────────────
    // Progression
    // ──────────────────────────────────────────────

    case 'analyzing': {
      const ctx = readJson(contextFile);
      const action = ctx?.analysis_recommendation?.action
        || ctx?.analysis_result?.recommendation
        || 'continue';

      // Foundation insertion (Scale 2)
      if (action === 'insert-foundation') {
        state.foundation = state.foundation || {};
        state.foundation.status = 'pending';
        state.foundation.scope = ctx?.analysis_recommendation?.foundation_scope || [];
        writeJson(stateFile, state);
        next = 'foundation';
        log(`[${projectName}] Insert foundation: ${state.foundation.scope.join(', ')}`);
        break;
      }

      // Circuit breaker: inject corrective context and resume
      if (ctx?.analysis_recommendation?.mid_loop_correction) {
        const correction = ctx.analysis_recommendation.mid_loop_correction;
        state.milestone_learnings = state.milestone_learnings || [];
        state.milestone_learnings.push({
          source: 'circuit-breaker',
          diagnosis: correction.diagnosis,
          instruction: correction.corrective_instruction,
          timestamp: new Date().toISOString(),
        });
        state.consecutive_failures = 0;
        writeJson(stateFile, state);
        log(`[${projectName}] Circuit breaker: corrective context injected`);

        const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
        if (milestone) {
          const eligible = findNextStory(milestone, flatStories(state));
          if (eligible) {
            next = startStory(state, milestone, eligible);
            writeJson(stateFile, state);
            break;
          }
        }
        next = 'milestone-check';
        break;
      }

      // Normal progression
      if (action === 'continue' || action === 'promote') {
        // V3: Milestone lock — prevent regression to already-promoted milestones
        const latestCp = readLatestCheckpoint(checkpointsFile);
        if (latestCp && checkMilestoneLock(latestCp, state.current_milestone)) {
          log(`[${projectName}] Milestone "${state.current_milestone}" already promoted — skipping to next`);
          const nextMs = findNextMilestone(state);
          if (nextMs) {
            nextMs.status = 'in-progress';
            const eligible = findNextStory(nextMs, flatStories(state));
            if (eligible) {
              next = startStory(state, nextMs, eligible);
              writeJson(stateFile, state);
              log(`[${projectName}] Skipped to milestone: ${nextMs.name}`);
            } else {
              next = 'milestone-check';
            }
          } else {
            next = 'vision-check';
          }
          break;
        }

        // Mark milestone done
        const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
        if (milestone) {
          milestone.status = (milestone.stories || []).some(s => s.status === 'blocked')
            ? 'partial' : 'complete';
        }

        // V3: Lock promoted milestone + tag
        promoteMilestone(state, state.current_milestone);
        try {
          const tagName = getMilestoneTagName(state.current_milestone);
          execSync(`git tag "${tagName}"`, { cwd: projectDir, encoding: 'utf8', timeout: 10000 });
          log(`[${projectName}] Milestone "${state.current_milestone}" promoted, locked, tagged ${tagName}`);
        } catch (err) {
          log(`[${projectName}] Milestone "${state.current_milestone}" promoted and locked (tag failed: ${(err.message || '').slice(0, 100)})`);
        }

        // Record shipped insights before transitioning
        if (!state.shipped_insights) state.shipped_insights = [];
        state.shipped_insights.push({
          milestone: state.current_milestone,
          completed_at: new Date().toISOString(),
          story_count: (milestone.stories || []).length,
          retry_count: (milestone.stories || []).reduce((sum, s) => sum + (s.attempts || 0), 0),
          patterns_discovered: Object.keys(state.fix_patterns || {}),
        });

        // Next milestone
        const nextMs = findNextMilestone(state);
        if (nextMs) {
          nextMs.status = 'in-progress';
          state.consecutive_failures = 0;
          state.milestone_learnings = [];
          const eligible = findNextStory(nextMs, flatStories(state));
          if (eligible) {
            next = startStory(state, nextMs, eligible);
            writeJson(stateFile, state);
            log(`[${projectName}] Next milestone: ${nextMs.name}, story: ${eligible.id}`);
          } else {
            next = 'milestone-check';
          }
        } else {
          next = 'vision-check';
          log(`[${projectName}] All milestones done — vision check`);
        }
      } else if (action.startsWith('deepen') || action === 'broaden') {
        next = 'generating-change-spec';
      } else if (action.startsWith('notify') || action === 'rollback') {
        next = escalate(state, {
          id: `esc-analyze-${action}-${Date.now()}`,
          tier: 2,
          classification: `analyze-${action}`,
          summary: `Analysis recommended '${action}'. See analysis_recommendation in cycle_context.json.`,
        });
      } else {
        next = 'vision-check';
      }
      break;
    }

    case 'generating-change-spec': {
      // Read fix stories from cycle_context and add them to state.json
      const ctx = readJson(contextFile);
      const pending = ctx?.change_specs_pending || [];
      const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);

      if (milestone && pending.length > 0) {
        let added = 0;
        for (const spec of pending) {
          const storyId = spec.spec_path
            ? spec.spec_path.replace(/.*\//, '').replace(/\..*/, '')
            : `fix-${Date.now()}-${added}`;
          // Don't add duplicates
          if ((milestone.stories || []).some(s => s.id === storyId)) continue;
          milestone.stories.push({
            id: storyId,
            name: spec.approach_summary || `Fix: ${spec.gap_ids?.join(', ') || storyId}`,
            status: 'pending',
            attempts: 0,
            depends_on: [],
            affected_entities: [],
            affected_screens: spec.affected_screens || [],
            acceptance_criteria: [],
            // Provenance: marks this story as added by Rouge mid-build
            // (rather than from the seeded spec). The dashboard shows
            // an "Added by Rouge" badge on stories with a recent
            // added_at so the user notices when the plan evolves.
            added_at: new Date().toISOString(),
            added_by: 'generating-change-spec',
          });
          added++;
        }
        if (added > 0) {
          log(`[${projectName}] Added ${added} fix stories to milestone "${milestone.name}"`);
          writeJson(stateFile, state);
        }
      }

      // Now find next story (including newly added fix stories)
      if (milestone) {
        const eligible = findNextStory(milestone, flatStories(state));
        if (eligible) {
          next = startStory(state, milestone, eligible);
          writeJson(stateFile, state);
          log(`[${projectName}] Starting fix story: ${eligible.id}`);
        } else {
          log(`[${projectName}] No fix stories to build — re-evaluating milestone`);
          next = 'milestone-check';
        }
      } else {
        next = 'escalation';
      }
      break;
    }

    case 'vision-check': {
      const ctx = readJson(contextFile);
      const results = ctx?.vision_check_results || {};

      // Mirror confidence_history from cycle_context to state.json so
      // downstream readers (learn-from-project.js, slack/bot.js) keep
      // working. The vision-check prompt writes to cycle_context
      // (per CLAUDE.md contract), but legacy readers still expect
      // `state.confidence_history`. Audit prompt-regression #4.
      if (Array.isArray(ctx?.confidence_history)) {
        state.confidence_history = ctx.confidence_history;
        writeJson(stateFile, state);
      }

      if (results.trajectory === 'diverging' || results.pivot_proposal) {
        next = escalate(state, {
          id: `esc-vision-drift-${Date.now()}`,
          tier: 2,
          classification: 'vision-drift',
          summary: results.pivot_proposal
            ? `Vision check suggests a pivot: ${String(results.pivot_proposal).slice(0, 200)}`
            : 'Vision check detected the build diverging from the original vision. Review the vision_check_results in cycle_context.json before continuing.',
        });
        log(`[${projectName}] Vision drift — escalating`);
      } else {
        next = 'shipping';
        log(`[${projectName}] Vision aligned — shipping`);
      }
      break;
    }

    case 'shipping':
      next = 'final-review';
      break;

    case 'final-review': {
      const ctx = readJson(contextFile);
      const report = ctx?.final_review_report;
      if (report?.production_ready || report?.human_approved) {
        next = 'complete';
        state.final_review_attempts = 0;
        log(`[${projectName}] Final review PASSED — complete!`);
      } else if (report?.recommendation === 'major-rework') {
        next = escalate(state, {
          id: `esc-final-review-rework-${Date.now()}`,
          tier: 2,
          classification: 'final-review-major-rework',
          summary: 'Final review flagged major rework. See final_review_report in cycle_context.json for specifics.',
        });
        log(`[${projectName}] Major rework — escalating`);
      } else {
        // Refinement loop — but with a circuit breaker
        state.final_review_attempts = (state.final_review_attempts || 0) + 1;
        if (state.final_review_attempts >= 3) {
          log(`[${projectName}] Final review: 3 refinement attempts exhausted — escalating to human`);
          if (!state.escalations) state.escalations = [];
          state.escalations.push({
            id: `esc-final-review-exhausted`,
            tier: 3,
            classification: 'taste-judgment',
            summary: `Final review requested refinement ${state.final_review_attempts} times. Product may need human taste judgment to decide what's shippable vs. what's polish.`,
            story_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          });
          writeJson(stateFile, state);
          next = 'escalation';
        } else {
          log(`[${projectName}] Needs refinement (attempt ${state.final_review_attempts}/3)`);
          next = 'generating-change-spec';
        }
      }
      break;
    }

    // ──────────────────────────────────────────────
    // Escalation
    // ──────────────────────────────────────────────

    case 'escalation': {
      // Check for human_response on any pending escalation (bidirectional contract)
      const pendingEsc = (state.escalations || []).find(e => e.status === 'pending' && e.human_response);
      if (pendingEsc) {
        // Validate the response shape before dispatching. Malformed
        // responses (missing type, wrong enum value, bad timestamp) used
        // to either throw deep in the dispatch or get swallowed by the
        // "Unrecognised" branch, which re-marked the escalation as
        // pending with human_response still attached — a perpetual loop
        // of the same log line and no forward progress. Now: drop the
        // corrupt response, raise a flagging escalation so the user
        // sees *why* their input was rejected, and keep the original
        // escalation pending for a re-submission.
        const validation = validateHumanResponse(pendingEsc.human_response);
        if (!validation.ok) {
          log(`[${projectName}] Rejecting malformed human_response on escalation ${pendingEsc.id}: ${validation.reason}`);
          delete pendingEsc.human_response;
          state.escalations = state.escalations || [];
          state.escalations.push({
            id: `malformed-${Date.now()}`,
            tier: 999,
            kind: 'malformed-human-response',
            story_id: pendingEsc.story_id || null,
            raised_at: new Date().toISOString(),
            status: 'pending',
            reason: validation.reason,
            hint: 'Re-submit the escalation resolution from the dashboard. If you wrote the response directly to state.json, check your schema.',
          });
          writeJson(stateFile, state);
          break;
        }

        const hrType = pendingEsc.human_response.type;
        pendingEsc.status = 'resolved';
        pendingEsc.resolved_at = new Date().toISOString();

        // Resume target for escalations resolved while no milestone
        // exists (e.g. escalation fired during foundation/foundation-eval,
        // before any stories were created). Going to 'milestone-check'
        // in that case violates the invariant (milestone-check requires
        // current_milestone) and the loop spins. Routing to
        // 'foundation-eval' re-runs the evaluation phase, which either
        // promotes the project forward with better context OR escalates
        // again with a specific reason via the helper. Closes the gap
        // the dismiss-false-positive click on testimonial hit.
        const pickResumeTarget = () => {
          const hrMs = (state.milestones || []).find(m => m.name === state.current_milestone);
          if (hrMs) {
            const hrElig = findNextStory(hrMs, flatStories(state));
            if (hrElig) {
              const nx = startStory(state, hrMs, hrElig);
              writeJson(stateFile, state);
              return { next: nx, detail: `story: ${hrElig.id}` };
            }
            return { next: toMilestoneCheck(state), detail: 'milestone-check (milestone exists, no eligible stories)' };
          }
          // No milestone yet — pre-story escalation. Re-run foundation-eval.
          state.current_story = null;
          return { next: 'foundation-eval', detail: 'foundation-eval (no milestone yet)' };
        };

        if (hrType === 'guidance') {
          const hrCtx = readJson(contextFile) || {};
          hrCtx.human_guidance = pendingEsc.human_response.text;
          writeJson(contextFile, hrCtx);
          const hrStory = flat.find(s => s.id === pendingEsc.story_id);
          if (hrStory && (hrStory.status === 'blocked' || hrStory.status === 'pending')) hrStory.status = 'retrying';
          state.consecutive_failures = 0;
          writeJson(stateFile, state);
          const resume = pickResumeTarget();
          next = resume.next;
          log(`[${projectName}] Escalation resolved (guidance) — ${resume.detail}`);
        } else if (hrType === 'manual-fix-applied') {
          state.consecutive_failures = 0;
          const hrStory = flat.find(s => s.id === pendingEsc.story_id);
          if (hrStory && hrStory.status === 'blocked') hrStory.status = 'done';
          writeJson(stateFile, state);
          const resume = pickResumeTarget();
          next = resume.next;
          log(`[${projectName}] Escalation resolved (manual-fix-applied) — ${resume.detail}`);
        } else if (hrType === 'dismiss-false-positive') {
          state.consecutive_failures = 0;
          const hrStory = flat.find(s => s.id === pendingEsc.story_id);
          if (hrStory && (hrStory.status === 'blocked' || hrStory.status === 'pending')) hrStory.status = 'retrying';
          writeJson(stateFile, state);
          const resume = pickResumeTarget();
          next = resume.next;
          log(`[${projectName}] Escalation dismissed — ${resume.detail}`);
        } else if (hrType === 'abort-story') {
          const hrStory = flat.find(s => s.id === pendingEsc.story_id);
          if (hrStory) hrStory.status = 'blocked';
          state.consecutive_failures = 0;
          writeJson(stateFile, state);
          const resume = pickResumeTarget();
          next = resume.next;
          log(`[${projectName}] Story aborted — ${resume.detail}`);
        } else if (hrType === 'hand-off') {
          // User is working through the problem in a direct Claude Code
          // session (`rouge resume-escalation <slug>` invocation). Mark
          // the escalation as in-progress but keep the project parked
          // in `escalation` state. The launcher won't advance until
          // the user submits `resume-after-handoff`.
          //
          // We revert `status` back to 'pending' so the dashboard
          // keeps showing the escalation card (user can change their
          // mind), but we stash `handoff_started_at` so the resume
          // path knows where to slice the git log from.
          pendingEsc.status = 'pending';
          pendingEsc.handoff_started_at = new Date().toISOString();
          delete pendingEsc.resolved_at;
          delete pendingEsc.human_response; // consume so we don't re-trigger
          writeJson(stateFile, state);
          log(`[${projectName}] Escalation handed off to direct Claude Code — parked until resume`);
          // Stay in 'escalation' state.
          next = 'escalation';
        } else if (hrType === 'resume-after-handoff') {
          // User finished their hand-off session. Capture any commits
          // made since handoff_started_at, write them to
          // cycle_context.human_resolution, and resume the phase that
          // was paused when the escalation fired.
          const since = pendingEsc.handoff_started_at || pendingEsc.created_at;
          const commits = captureCommitsSince(projectDir, since);
          const resolution = {
            note: pendingEsc.human_response.text || '',
            commits,
            files_changed: Array.from(
              new Set(commits.flatMap(c => c.files_changed || []))
            ),
          };
          const resumeCtx = readJson(contextFile) || {};
          resumeCtx.human_resolution = resolution;
          writeJson(contextFile, resumeCtx);
          state.consecutive_failures = 0;
          // If the escalation was story-scoped, flip the story back to
          // retrying so the next phase actually re-attempts it with
          // the human_resolution context injected by the preamble.
          // retryStory() also repoints current_story at the retrying
          // story — previously the pointer could dangle at whatever
          // story was current before the hand-off.
          const resumeStory = flat.find(s => s.id === pendingEsc.story_id);
          if (resumeStory && (resumeStory.status === 'blocked' || resumeStory.status === 'pending')) {
            retryStory(state, { story: resumeStory });
          }
          writeJson(stateFile, state);
          const resumeMs = (state.milestones || []).find(m => m.name === state.current_milestone);
          if (resumeMs) {
            const elig = findNextStory(resumeMs, flatStories(state));
            if (elig) {
              next = startStory(state, resumeMs, elig);
              writeJson(stateFile, state);
            } else {
              next = toMilestoneCheck(state);
            }
          } else {
            next = toMilestoneCheck(state);
          }
          log(`[${projectName}] Escalation resumed after hand-off — ${commits.length} commit(s) captured`);
        } else {
          // Unrecognised response type — ignore, stay in escalation
          log(`[${projectName}] Unrecognised escalation response type: ${hrType}`);
          pendingEsc.status = 'pending';
          delete pendingEsc.resolved_at;
        }
        break;
      }

      // Legacy: feedback.json resolution
      const feedbackFile = path.join(projectDir, 'feedback.json');
      if (!fs.existsSync(feedbackFile)) break; // stays in escalation

      const feedback = readJson(feedbackFile);
      if (!feedback?.resolved) break;

      const targetId = feedback.escalation_id || null;
      let resolvedCount = 0;
      for (const esc of state.escalations || []) {
        if (esc.status !== 'pending') continue;
        if (targetId && esc.id !== targetId) continue;
        esc.status = 'resolved';
        esc.resolution = feedback.resolution || 'human-resolved';
        esc.resolved_at = new Date().toISOString();
        const story = flat.find(s => s.id === esc.story_id);
        if (story && story.status === 'blocked') story.status = 'retrying';
        resolvedCount++;
      }
      log(`[${projectName}] Resolved ${resolvedCount} escalation(s)${targetId ? ` (target: ${targetId})` : ' (all pending)'}`);
      fs.unlinkSync(feedbackFile);
      writeJson(stateFile, state);

      // Resume
      const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
      if (milestone) {
        const eligible = findNextStory(milestone, flatStories(state));
        if (eligible) {
          next = startStory(state, milestone, eligible);
          writeJson(stateFile, state);
          log(`[${projectName}] Escalation resolved — story: ${eligible.id}`);
        } else {
          next = 'milestone-check';
        }
      } else {
        next = 'milestone-check';
      }
      break;
    }
  }

  if (next) {
    log(`[${projectName}] ${current} → ${next}`);

    // Self-heal: if a case block set next='escalation' without pushing
    // a specific escalation object, synthesize a placeholder so the
    // invariant (state='escalation' ⇒ at least one pending escalation)
    // holds. Callers that use escalate() get informative messaging;
    // this is the belt-and-suspenders for older raw `next =
    // 'escalation'` sites that haven't been migrated. The WARN tag
    // makes it easy to grep for sites worth migrating.
    if (next === 'escalation') {
      const pending = (state.escalations || []).filter((e) => e && e.status === 'pending');
      if (pending.length === 0) {
        log(
          `[${projectName}] WARN: transition ${current} → escalation raised without a specific escalation object. ` +
          `Synthesizing placeholder — migrate the ${current} case handler to use escalate() for better UX.`,
        );
        if (!state.escalations) state.escalations = [];
        state.escalations.push({
          id: `esc-unspecified-${current}-${Date.now()}`,
          tier: 1,
          classification: `unspecified-from-${current}`,
          summary:
            `Rouge escalated from '${current}' but didn't record a specific reason. ` +
            `Check the launcher log around this timestamp for context.`,
          story_id: state.current_story || null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
    }

    state.current_state = next;
    state.timestamp = new Date().toISOString();
    // Defensive: catch invariant violations at the single unified write
    // site. If anything drifted in the case handlers above (story-building
    // with no current_story, complete with unfinished milestones, etc.)
    // we'd rather fail loudly here than persist a broken state and
    // render a blank UI. On throw, log + skip the write — the loop
    // retries next tick with the previous state intact.
    try {
      assertInvariants(state);
    } catch (err) {
      log(`[${projectName}] STATE INVARIANT VIOLATION: ${err.message}`);
      log(`[${projectName}] Refusing to persist corrupt state — transition ${current} → ${next} aborted`);
      return { success: false, invariantViolation: true };
    }
    writeJson(stateFile, state);

    notifyRich('transition', { project: projectName, from: current, to: next });

    // Cross-product learning on completion
    if (next === 'complete') {
      try {
        execFileSync('node', [path.join(__dirname, 'learn-from-project.js'), projectDir], {
          encoding: 'utf8', timeout: 30000, stdio: 'pipe',
        });
        log(`[${projectName}] Learnings extracted`);
      } catch (err) {
        log(`[${projectName}] Learning extraction failed: ${(err.message || '').slice(0, 100)}`);
      }

      // Append journey entry if the cycle-retrospective phase wrote one
      // to cycle_context.journey_entry. See audit F-series prompt
      // regression finding #2 — helper existed but was never invoked,
      // so journey.json stayed empty. No-op when no entry present.
      try {
        const { appendJourneyEntry } = require('./journey-log.js');
        const result = appendJourneyEntry(projectDir);
        if (result.appended) {
          log(`[${projectName}] Journey entry appended to journey.json`);
        }
      } catch (err) {
        log(`[${projectName}] Journey append failed: ${(err.message || '').slice(0, 100)}`);
      }

      // Create prompt improvement proposals from learnings. Each
      // proposal that ships with `files_touched` is validated against
      // self-improve-safety's allowlist/blocklist — out-of-scope files
      // surface as a warning on the resulting issue so the human
      // reviewer sees them. See audit F17.
      try {
        const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
        const proposals = ctx?.prompt_improvement_proposals || [];
        if (proposals.length > 0) {
          const rougeConfig = readJson(path.join(ROUGE_ROOT, 'rouge.config.json')) || {};
          const selfImproveConfig = rougeConfig.self_improvement || {
            allowlist: [], blocklist: [],
          };
          const { validateImprovementScope } = require('./self-improve-safety.js');

          log(`[${projectName}] ${proposals.length} prompt improvement proposal(s) — creating issues`);
          for (const proposal of proposals) {
            let scopeWarning = '';
            const filesTouched = Array.isArray(proposal.files_touched) ? proposal.files_touched : [];
            if (filesTouched.length > 0 && selfImproveConfig.allowlist.length > 0) {
              const validation = validateImprovementScope(filesTouched, selfImproveConfig);
              if (!validation.valid) {
                scopeWarning = `\n\n⚠️ **Self-improve-safety: out-of-scope files**\nThese files fall outside Rouge's self-modification allowlist and must be changed by a human reviewer, not by an automated improvement PR:\n${validation.rejected.map((f) => `- \`${f}\``).join('\n')}`;
              }
            }
            try {
              const body = ((proposal.description || '') + scopeWarning).replace(/"/g, '\\"');
              execSync(
                `gh issue create --title "${proposal.title || 'Prompt improvement'}" --body "${body}" --label self-improvement`,
                { cwd: ROUGE_ROOT, encoding: 'utf8', timeout: 15000, stdio: 'pipe' }
              );
            } catch {}
          }
        }
      } catch {}

      notifyRich('complete', { project: projectName });
    }
  }
}

async function runPhase(projectDir) {
  const projectName = path.basename(projectDir);
  // V3: One-time migration from V2 state.json to dual ledger
  const migrationResult = migrateV2StateToV3(projectDir);
  if (migrationResult.migrated) {
    log(`[${projectName}] V2 → V3 state migration complete`);
  }

  const stateFile = statePath(projectDir);
  const contextFile = path.join(projectDir, 'cycle_context.json');
  const state = readJson(stateFile);
  if (!state) return { success: true }; // no state file = skip

  let currentState = state.current_state;

  // V2: escalation state handles feedback via advanceState (checks feedback.json).
  // If in escalation and feedback exists, advanceState will resolve and transition.
  if (currentState === 'escalation') {
    await advanceState(projectDir);
    return { success: true };
  }

  if (SKIP_STATES.has(currentState)) return { success: true };

  // Normalize *-complete states
  if (currentState.endsWith('-complete')) {
    const baseState = currentState.replace('-complete', '');
    log(`[${projectName}] Normalizing state: ${currentState} → advancing from ${baseState}`);
    state.current_state = baseState;
    writeJson(stateFile, state);
    await advanceState(projectDir);
    return { success: true };
  }

  // Infrastructure provisioning is handled in advanceState after foundation-eval.
  // Deploy to staging is handled in advanceState before milestone-check.
  // No provisioning or deployment in runPhase.

  // V3: Budget cap check before starting phase
  const checkpointsFile = path.join(projectDir, 'checkpoints.jsonl');
  const configFile = path.join(ROUGE_ROOT, 'rouge.config.json');
  const config = readJson(configFile) || {};
  // Per-project cap (set at creation or via dashboard) overrides the
  // global default. Keeps runaway-build protection but lets a user raise
  // the cap on a specific build without changing the global default.
  const effectiveCap = state.budget_cap_usd ?? config.budget_cap_usd;
  if (effectiveCap && checkBudgetCap(state, effectiveCap)) {
    log(`[${projectName}] Budget cap reached ($${state.costs?.cumulative_cost_usd?.toFixed(2)} / $${effectiveCap}) — escalating`);
    state.current_state = 'escalation';
    if (!state.escalations) state.escalations = [];
    state.escalations.push({
      id: `esc-budget-cap-${Date.now()}`,
      tier: 2,
      classification: 'budget-exceeded',
      summary: `Budget cap reached: $${state.costs?.cumulative_cost_usd?.toFixed(2)} / $${effectiveCap}`,
      story_id: null,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    writeJson(stateFile, state);
    return { success: false, budgetExceeded: true };
  }

  // Pre-dispatch: if current story is done, advance to next pending or let
  // Claude run one last time so the state machine triggers deploy + milestone-check.
  if (currentState === 'story-building' && state.current_milestone && state.current_story) {
    const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
    if (milestone) {
      const currentStory = (milestone.stories || []).find(s => s.id === state.current_story);
      if (currentStory && currentStory.status === 'done') {
        const allFlat = (state.milestones || []).flatMap(m => m.stories || []);
        const doneIds = new Set(allFlat.filter(s => s.status === 'done').map(s => s.id));
        const nextPending = (milestone.stories || []).find(s =>
          (s.status === 'pending' || s.status === 'retrying') &&
          (s.depends_on || []).every(d => doneIds.has(d))
        );
        if (nextPending) {
          log(`[${projectName}] Story "${state.current_story}" already done — advancing to "${nextPending.id}"`);
          // Atomic pointer + status update. Without the helper, the new
          // story's status stayed 'pending' while current_story claimed
          // it was active — a silent drift the next phase invocation
          // would render as "building a pending story".
          advanceStory(state, { story: nextPending });
          writeJson(stateFile, state);
        } else {
          // All stories done. Deploy to staging then advance to milestone-check.
          // Do NOT run story-building phase — it wastes credits and triggers spin detection.
          log(`[${projectName}] All stories in "${milestone.name}" are done — deploying to staging`);
          try {
            const { deploy } = require('./deploy-to-staging');
            const deployResult = await deployWithRetry(() => deploy(projectDir), { maxRetries: 3, retryDelayMs: 30000, logger: log });
            if (shouldBlockMilestoneCheck(deployResult)) {
              log(`[${projectName}] Deploy failed after retries — escalating`);
              if (!state.escalations) state.escalations = [];
              state.escalations.push({
                id: `esc-deploy-failed-${Date.now()}`,
                tier: 1,
                classification: 'deploy-failure',
                summary: deployResult?.reason || 'Staging deploy failed',
                story_id: null,
                status: 'pending',
                created_at: new Date().toISOString(),
              });
              state.current_state = 'escalation';
              writeJson(stateFile, state);
            } else {
              log(`[${projectName}] Staging deploy complete: ${deployResult.url}`);
              state.current_state = 'milestone-check';
              state.current_story = null;
              writeJson(stateFile, state);
            }
          } catch (err) {
            log(`[${projectName}] Deploy error: ${(err.message || '').slice(0, 200)}`);
            state.current_state = 'milestone-check';
            state.current_story = null;
            writeJson(stateFile, state);
          }
          return { success: true };
        }
      }
    }
  }

  // Snapshot state before phase — enables recovery from corruption
  snapshotState(projectDir, currentState);

  // Sync _cycle_number and milestone/story metadata to cycle_context.json
  // (replaces V1's syncCycleMetadata — prompts read these fields)
  try {
    const ctx = readJson(contextFile);
    if (ctx) {
      ctx._cycle_number = state.cycle_number || 1;
      ctx._current_milestone = state.current_milestone || null;
      ctx._current_story = state.current_story || null;
      writeJson(contextFile, ctx);
    }
  } catch {}

  // V2: Assemble focused context views before invoking prompts
  try {
    const { assembleStoryContext, assembleMilestoneContext, assembleFixStoryContext } = require('./context-assembly');
    if (currentState === 'story-building') {
      assembleStoryContext(projectDir, state);
      log(`[${projectName}] Assembled story_context.json for ${state.current_story}`);
    } else if (currentState === 'milestone-check') {
      assembleMilestoneContext(projectDir, state);
      log(`[${projectName}] Assembled milestone_context.json for ${state.current_milestone}`);
    } else if (currentState === 'milestone-fix') {
      assembleFixStoryContext(projectDir, state);
      log(`[${projectName}] Assembled fix_story_context.json`);
    }
  } catch (err) {
    log(`[${projectName}] Context assembly failed (non-blocking): ${(err.message || '').slice(0, 200)}`);
  }

  const promptRelPath = STATE_TO_PROMPT[currentState];
  if (!promptRelPath) {
    log(`[${projectName}] Unknown state "${currentState}" — no prompt mapping. Halting phase.`);
    return { success: false };
  }

  const promptFile = path.join(ROUGE_ROOT, 'src/prompts', promptRelPath);
  if (!fs.existsSync(promptFile)) {
    log(`[${projectName}] Prompt file not found: ${promptFile}`);
    return { success: false };
  }

  // V3: Per-phase model selection (Opus for reasoning, Sonnet for mechanical)
  const model = process.env.ROUGE_MODEL || getModelForPhase(currentState, config.model_overrides || {});
  const phaseLog = path.join(LOG_DIR, `${projectName}-${currentState}.log`);

  log(`[${projectName}] Running phase: ${currentState} (model: ${model}, ceiling: ${HARD_CEILING / 60000}min, stale: ${PROGRESS_STALE_THRESHOLD / 60000}min)`);

  const filesBefore = countFiles(projectDir);

  // Async spawn with streaming output + progress-based watchdog
  return new Promise((resolve) => {
    const logStream = fs.createWriteStream(phaseLog, { flags: 'a' });
    const logSizeAtStart = fs.existsSync(phaseLog) ? fs.statSync(phaseLog).size : 0;
    let stderrChunks = [];
    let killed = false;

    // V3: Inject shared preamble with I/O contract
    const PHASE_DESCRIPTIONS = {
      'foundation': 'Build the project foundation — schema, auth, deploy pipeline, seed data',
      'foundation-eval': 'Evaluate foundation completeness across 6 dimensions',
      'story-building': 'Build the current story using TDD',
      'milestone-check': 'Evaluate milestone quality — test integrity, code review, product walk, PO review',
      'milestone-fix': 'Fix regressions found during milestone evaluation',
      'analyzing': 'Analyse evaluation results and recommend next action',
      'generating-change-spec': 'Generate fix stories from analysis recommendations',
      'vision-check': 'Check product alignment with original vision',
      'shipping': 'Ship the product — version bump, changelog, PR, deploy',
      'final-review': 'Final customer walkthrough before marking complete',
    };
    const PHASE_REQUIRED_KEYS = {
      'foundation': ['deployment_url', 'implemented', 'skipped', 'divergences', 'factory_decisions', 'factory_questions', 'foundation_completion'],
      'foundation-eval': ['foundation_eval_report'],
      'story-building': ['story_result', 'implemented', 'skipped', 'divergences', 'factory_decisions', 'factory_questions'],
      'milestone-check': ['diff_scope', 'evaluation_tier', 'evaluation_report'],
      'milestone-fix': ['qa_fix_results'],
      'analyzing': ['analysis_recommendation', 'analysis_result'],
      'generating-change-spec': ['change_specs_pending'],
      'vision-check': ['vision_check_results'],
      'shipping': ['ship_result'],
      'final-review': ['final_review_report'],
    };
    const preambleText = injectPreamble({
      projectDir,
      phaseName: currentState,
      phaseDescription: PHASE_DESCRIPTIONS[currentState] || currentState,
      modelName: model,
      requiredOutputKeys: PHASE_REQUIRED_KEYS[currentState] || [],
    });

    // Build the prompt instruction with V3 preamble
    let promptInstruction = `${preambleText}\n\n---\n\nRead the phase prompt at ${promptFile} and execute it. The project directory is ${projectDir}. Read cycle_context.json for context.`;

    // FIX-6: Save state.json before phase — restore if phase overwrites it
    const stateBeforePhase = JSON.stringify(readJson(stateFile));

    // Load project secrets from OS credential store
    const secretsEnv = loadSecretsForProject(projectDir, projectName);

    // --add-dir: whitelist only the Rouge directories this phase needs.
    // This is defence-in-depth — not a security boundary, but prevents
    // accidental sibling-project discovery via ls ../ or similar.
    const isSeeding = currentState === 'seeding';
    const addDirs = [
      path.join(ROUGE_ROOT, isSeeding ? 'src/prompts/seeding' : 'src/prompts/loop'),
      path.join(ROUGE_ROOT, 'library'),
    ];

    // Mode-aware env: routes Claude Code to subscription / api / bedrock / vertex.
    const { env: claudeEnv, mode: authMode } = buildClaudeEnv({
      state: readJson(stateFile),
      secretsEnv,
    });
    log(`[${projectName}] Auth mode: ${authMode}`);

    // spawn (not execFile) for real-time stdout streaming.
    //
    // --output-format stream-json + --verbose makes claude emit one JSONL
    // record per internal event (assistant text, tool_use, tool_result,
    // result). Without this, `claude -p` is almost entirely silent on
    // stdout during tool use — which left the dashboard with no signal
    // to show users for 30-60 minute foundation phases. The parsed
    // stream is turned into compact events by phase-events.js and
    // appended to <projectDir>/phase_events.jsonl; the dashboard tails
    // that file to render a live tool-call feed.
    const { args: denyArgs } = require('./tool-permissions').buildDenylistArgs();
    const child = spawn('claude', [
      '-p',
      promptInstruction,
      '--dangerously-skip-permissions',
      '--model', model,
      '--max-turns', '200',
      '--output-format', 'stream-json',
      '--verbose',
      ...addDirs.flatMap(dir => ['--add-dir', dir]),
      ...denyArgs,
    ], {
      cwd: projectDir,
      env: claudeEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Stream claude's stream-json stdout to (a) the phase log verbatim
    // for diagnostics, and (b) the phase-events writer which splits it
    // into lines, parses each, and appends compact events the dashboard
    // can render without re-implementing the parser client-side.
    const { createPhaseEventWriter } = require('./phase-events.js');
    const eventWriter = createPhaseEventWriter({
      projectDir,
      phase: currentState,
      pid: child.pid,
      model,
      // Story/milestone context at phase start, stamped on every
      // event. Non-story phases (foundation, analyzing, shipping)
      // leave story_id unset — the dashboard treats absence as
      // "project-level activity" and shows it in the hero instead of
      // any specific story card.
      storyId: state.current_story || undefined,
      milestoneName: state.current_milestone || undefined,
      // A non-JSON stdout line (rare — only if stream-json isn't
      // understood by this claude build) still gets teed to the phase
      // log so nothing is silently lost.
      onRawLine: (line) => { try { logStream.write(line + '\n'); } catch {} },
    });
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        logStream.write(chunk);
        eventWriter.onChunk(chunk);
      });
    }

    // Capture stderr for rate limit detection
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
        logStream.write('\n[STDERR] ' + chunk);
      });
    }

    // --- Progress-based watchdog (FIX #57: detects file activity, not just stdout) ---
    // Three progress signals, ANY counts as alive:
    //   1. Log file growth (stdout captured to phase log)
    //   2. Progress events in log content
    //   3. File system activity in project dir (tool calls write files even when stdout is silent)
    // Kills only when ALL three are stale AND hard ceiling exceeded.
    const HEARTBEAT_INTERVAL = 30000; // check every 30s
    let lastLogSize = logSizeAtStart;
    let lastLogGrowthAt = Date.now();
    let lastProgressEventAt = Date.now();
    let lastFileActivityAt = Date.now();
    const phaseStartedAt = Date.now();

    /** Check if any file in the project was modified recently. */
    function checkFileActivity() {
      try {
        const result = execSync(
          `find "${projectDir}" -maxdepth 3 -newer "${phaseLog}" -not -path "*/node_modules/*" -not -path "*/.git/objects/*" -not -path "*/.next/*" -type f 2>/dev/null | head -1`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        return result.length > 0;
      } catch { return false; }
    }

    const heartbeat = setInterval(() => {
      try {
        const currentSize = fs.statSync(phaseLog).size;
        const now = Date.now();
        const elapsed = now - phaseStartedAt;

        // Signal 1: Log file growth
        if (currentSize > lastLogSize) {
          lastLogGrowthAt = now;

          // Extract progress events from new content
          try {
            const newContent = fs.readFileSync(phaseLog, 'utf8').slice(lastLogSize);
            const { extractEvents } = require('./progress-streamer');
            const events = extractEvents(newContent);
            if (events.length > 0) {
              lastProgressEventAt = now;
              log(`[${projectName}] Progress: ${events.join(' | ')}`);
              if (process.env.ROUGE_SLACK_WEBHOOK) {
                notifyRich('transition', {
                  project: projectName,
                  from: currentState,
                  to: currentState,
                  details: events.join(' | '),
                });
              }
            }
          } catch {}
          lastLogSize = currentSize;
        }

        // Signal 3: File system activity (FIX #57)
        if (checkFileActivity()) {
          lastFileActivityAt = now;
          // Touch the phase log so the -newer check resets
          try { fs.utimesSync(phaseLog, new Date(), new Date()); } catch {}
        }

        const logStaleDuration = now - lastLogGrowthAt;
        const progressStaleDuration = now - lastProgressEventAt;
        const fileStaleDuration = now - lastFileActivityAt;

        // Decision logic: should we kill this phase?
        let shouldKill = false;
        let killReason = '';

        // Hard ceiling — absolute safety net
        if (elapsed >= HARD_CEILING) {
          shouldKill = true;
          killReason = `hard ceiling (${HARD_CEILING / 60000}min)`;
        }
        // ALL signals stale — agent is truly stuck (not just writing files silently)
        else if (logStaleDuration >= LOG_STALE_THRESHOLD && progressStaleDuration >= PROGRESS_STALE_THRESHOLD && fileStaleDuration >= PROGRESS_STALE_THRESHOLD) {
          shouldKill = true;
          killReason = `no output for ${Math.floor(logStaleDuration / 60000)}min, no progress for ${Math.floor(progressStaleDuration / 60000)}min, no file activity for ${Math.floor(fileStaleDuration / 60000)}min`;
        }

        // Log stale status periodically (every 3 min of staleness)
        const allStale = logStaleDuration >= 180000 && fileStaleDuration >= 180000;
        if (allStale && logStaleDuration % 60000 < HEARTBEAT_INTERVAL) {
          log(`[${projectName}] Phase ${currentState} — no output for ${Math.floor(logStaleDuration / 1000)}s, no file activity for ${Math.floor(fileStaleDuration / 1000)}s`);
        } else if (logStaleDuration >= 180000 && fileStaleDuration < 60000 && logStaleDuration % 120000 < HEARTBEAT_INTERVAL) {
          log(`[${projectName}] Phase ${currentState} — stdout silent but files active (last file change ${Math.floor(fileStaleDuration / 1000)}s ago)`);
        }

        if (shouldKill) {
          killed = true;
          clearInterval(heartbeat);
          log(`[${projectName}] Phase ${currentState} killed: ${killReason}`);
          try { child.kill('SIGTERM'); } catch {}
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
          }, 5000);
        }
      } catch {
        // Log file doesn't exist yet — that's fine
      }
    }, HEARTBEAT_INTERVAL);

    child.on('close', async (code) => {
      try { clearInterval(heartbeat); } catch {}
      try { logStream.end(); } catch {}
      try { eventWriter.onEnd(code); } catch {}

      const stderr = stderrChunks.map(c => typeof c === 'string' ? c : c.toString()).join('');

      if (killed) {
        const elapsed = Math.floor((Date.now() - phaseStartedAt) / 60000);
        log(`[${projectName}] Phase ${currentState} killed after ${elapsed}min`);
        resolve({ success: false, timedOut: true });
        return;
      }

      // Exit code check FIRST — if process succeeded, don't second-guess it
      if (code === 0) {
        // Phase completed successfully. Even if a rate limit message appeared
        // mid-phase (Claude retried internally), the work is done.
        // Fall through to the success path below.
      } else {
        // Non-zero exit — check if it was a rate limit
        // Only read content written DURING this run (not stale content from previous runs)
        let rateLimitSource = null;
        if (isRateLimited(stderr)) {
          rateLimitSource = 'stderr';
        } else {
          try {
            const buf = Buffer.alloc(4000);
            const fd = fs.openSync(phaseLog, 'r');
            const totalSize = fs.fstatSync(fd).size;
            const readFrom = Math.max(logSizeAtStart, totalSize - 4000);
            const bytesRead = fs.readSync(fd, buf, 0, 4000, readFrom);
            fs.closeSync(fd);
            const newContent = buf.slice(0, bytesRead).toString('utf8');
            if (isRateLimited(newContent)) rateLimitSource = 'stdout';
          } catch {}
        }
        if (rateLimitSource) {
          log(`[${projectName}] Rate limited (detected in ${rateLimitSource})`);
          resolve({ success: false, rateLimited: true });
          return;
        }

        const errorLine = stderr.split('\n').filter(l => l.trim()).pop() || `exit code ${code}`;
        log(`[${projectName}] Phase ${currentState} failed: ${errorLine.slice(0, 200)}`);
        resolve({ success: false });
        return;
      }

      // Success
      const filesAfter = countFiles(projectDir);
      const delta = filesAfter - filesBefore;
      log(`[${projectName}] Phase ${currentState} completed (files: ${filesBefore} → ${filesAfter}, delta: +${delta})`);

      // V3: Track phase cost. Prefer parsing Claude's real cost/tokens
      // from the log (total_cost_usd / token-count markers); fall back
      // to the log-size heuristic only when parsing yields nothing.
      // Previously this was heuristic-only — meaningful for trend but
      // cannot be trusted for budget cap decisions.
      try {
        const logSize = fs.statSync(phaseLog).size;
        const fallbackTokens = Math.max(logSize * 2, 10000);
        trackPhaseCostFromLog(state, phaseLog, fallbackTokens, model);
        writeJson(stateFile, state);
        const src = state.costs.phase_cost_source === 'parsed' ? ' (parsed)' : state.costs.phase_cost_source === 'parsed-tokens' ? ' (parsed tokens)' : ' (estimated)';
        log(`[${projectName}] Cost: ~${state.costs.phase_cost_usd.toFixed(2)} USD this phase${src}, ~${state.costs.cumulative_cost_usd.toFixed(2)} USD cumulative`);

        // V3: Cost milestone notifications (per-project cap wins over global)
        const alertCap = state.budget_cap_usd ?? config.budget_cap_usd;
        if (alertCap) {
          const pct = Math.round((state.costs.cumulative_cost_usd / alertCap) * 100);
          if (pct >= 80 && !state._cost_alert_80) {
            state._cost_alert_80 = true;
            notifyRich('cost-alert', { project: projectName, currentUsd: state.costs.cumulative_cost_usd, budgetUsd: alertCap, percentage: 80 });
          } else if (pct >= 50 && !state._cost_alert_50) {
            state._cost_alert_50 = true;
            notifyRich('cost-alert', { project: projectName, currentUsd: state.costs.cumulative_cost_usd, budgetUsd: alertCap, percentage: 50 });
          }
          writeJson(stateFile, state);
        }
      } catch {}

      // Store build delta in state so advanceState can detect no-op builds
      // V2: story-building tracks delta per story (used by advanceState for no-op detection)
      if (currentState === 'story-building') {
        try {
          const s = readJson(stateFile);
          if (s) { s.last_build_delta = delta; writeJson(stateFile, s); }
        } catch {}
      }

      // Log last line from the log file
      try {
        const logContent = fs.readFileSync(phaseLog, 'utf8');
        const lines = logContent.trim().split('\n').filter(l => l.trim() && !l.startsWith('[STDERR]'));
        if (lines.length > 0) {
          log(`[${projectName}] Output: ${lines[lines.length - 1].slice(0, 200)}`);
        }
      } catch {}

      // FIX-6: Restore state.json if the phase overwrote it
      // But respect external state changes (e.g. Slack pause) — only restore if
      // the phase itself changed the state, not if an external actor did
      const stateAfterPhase = readJson(stateFile);
      if (stateAfterPhase && stateAfterPhase.current_state !== currentState) {
        if (SKIP_STATES.has(stateAfterPhase.current_state)) {
          log(`[${projectName}] External state change detected: ${currentState} → ${stateAfterPhase.current_state} — respecting`);
        } else {
          log(`[${projectName}] Phase wrote state.json (${stateAfterPhase.current_state}) — restoring to ${currentState}`);
          const restored = JSON.parse(stateBeforePhase);
          restored.current_state = currentState; // keep the state the launcher set
          writeJson(stateFile, restored);
        }
      }

      // Layer 4 (#103): Check for pending infrastructure action from Claude.
      // If Claude wrote pending-action.json, validate and execute it before
      // advancing the state machine. This is Phase 1 (backwards-compatible) —
      // Claude can still run commands directly via --dangerously-skip-permissions.
      try {
        const infraResult = processInfraAction(projectDir, readJson(stateFile) || {});
        if (infraResult.handled) {
          log(`[${projectName}] Processed infrastructure action: ${infraResult.action} → ${infraResult.result?.status}`);
        }
      } catch (err) {
        log(`[${projectName}] Infrastructure action error (non-blocking): ${(err.message || '').slice(0, 200)}`);
      }

      // Advance state machine
      try {
        await advanceState(projectDir);
      } catch (err) {
        log(`[${projectName}] advanceState error: ${(err.message || '').slice(0, 200)}`);
      }
      resolve({ success: true });
    });

    // Handle spawn errors
    child.on('error', (err) => {
      clearInterval(heartbeat);
      logStream.end();
      log(`[${projectName}] Phase ${currentState} spawn error: ${err.message.slice(0, 200)}`);
      resolve({ success: false });
    });
  });
}

// --- Auth expiry check ---

function checkAuthExpiry() {
  try {
    const output = execFileSync('bash', [path.join(ROUGE_ROOT, 'src/launcher/check-auth-expiry.sh')], {
      encoding: 'utf8', timeout: 5000,
    });
    if (output.trim()) {
      log(output.trim());
      notify(output.trim());
    }
  } catch {}
}

// --- Morning briefing ---

function checkBriefing() {
  const triggerFile = path.join(ROUGE_ROOT, 'trigger-briefing.json');
  if (!fs.existsSync(triggerFile)) return;

  log('Morning briefing triggered');
  fs.unlinkSync(triggerFile);

  const projects = listProjects().map(name => {
    const state = readJson(statePath(path.join(PROJECTS_DIR, name)));
    return { name, state: state?.current_state || '?', cycle: state?.cycle_number || 0 };
  });

  if (projects.length > 0) {
    notifyRich('briefing', { projects });
  }
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR).filter(d =>
    hasStateFile(path.join(PROJECTS_DIR, d))
  );
}

// --- Main loop ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Keep the event loop alive — prevents Node from exiting when child process completes
  const keepAlive = setInterval(() => {}, 60000);

  log(`Rouge launcher starting. Projects dir: ${PROJECTS_DIR}`);
  checkAuthExpiry();

  let globalRateLimitUntil = 0; // FW.31: timestamp when global rate limit expires

  while (true) {
    checkBriefing();

    // FW.31: Global rate limit — skip all projects until limit resets
    if (Date.now() < globalRateLimitUntil) {
      const waitSec = Math.ceil((globalRateLimitUntil - Date.now()) / 1000);
      log(`Global rate limit active — waiting ${waitSec}s`);
      await sleep(globalRateLimitUntil - Date.now());
      globalRateLimitUntil = 0;
    }

    const projects = listProjects();
    for (const projectName of projects) {
      const projectDir = path.join(PROJECTS_DIR, projectName);
      let retries = 0;

      while (retries < MAX_RETRIES) {
        const result = await runPhase(projectDir);

        if (result.success) break;

        // FIX-3: Rate limits do NOT count toward retry limit
        if (result.rateLimited) {
          // Parse reset time from phase log — sleep until actual reset instead of short retry loops
          let backoff = 60000 * (retries + 1); // fallback: escalating backoff
          try {
            const phaseState = readJson(statePath(projectDir));
            const logFile = path.join(LOG_DIR, `${projectName}-${phaseState?.current_state || 'unknown'}.log`);
            const logContent = fs.readFileSync(logFile, 'utf8').slice(-2000);
            const resetMatch = logContent.match(/resets?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
            if (resetMatch) {
              const resetTime = parseResetTime(resetMatch[1]);
              if (resetTime > Date.now()) {
                backoff = resetTime - Date.now() + 60000; // +1 min buffer after reset
                log(`[${projectName}] Rate limit resets at ${resetMatch[1]} — sleeping ${Math.ceil(backoff / 60000)} min`);
              }
            }
          } catch {}

          globalRateLimitUntil = Date.now() + backoff;
          log(`[${projectName}] Rate limited. Backing off ${Math.ceil(backoff / 60000)} min (global). (retries NOT incremented: ${retries}/${MAX_RETRIES})`);
          await sleep(backoff);
          continue; // retry without incrementing
        }

        // Real failure — increment retries
        retries++;
        log(`[${projectName}] Retry ${retries}/${MAX_RETRIES}`);

        if (retries >= MAX_RETRIES) {
          log(`[${projectName}] Max retries reached. Transitioning to waiting-for-human.`);
          const stateFile = statePath(projectDir);
          const contextFile = path.join(projectDir, 'cycle_context.json');
          const state = readJson(stateFile);
          const ctx = readJson(contextFile);
          if (state) {
            state.current_state = 'escalation';
            state.timestamp = new Date().toISOString();
            if (!state.escalations) state.escalations = [];
            state.escalations.push({
              id: `esc-launcher-retry-${Date.now()}`,
              tier: 1,
              classification: 'launcher-retry-exhausted',
              summary: `Phase failed ${MAX_RETRIES} times`,
              story_id: state.current_story || null,
              status: 'pending',
              created_at: new Date().toISOString(),
            });
            writeJson(stateFile, state);
          }
          notifyRich('escalation', {
            project: projectName,
            phase: state?.current_state || 'unknown',
            reason: `Failed ${MAX_RETRIES} times`,
            context: {
              milestone: state?.current_milestone,
              story: state?.current_story,
              healthScore: ctx?.evaluation_report?.health_score,
              confidence: ctx?.evaluation_report?.po?.confidence,
              consecutiveFailures: state?.consecutive_failures,
            },
          });
        }

        await sleep(30000); // 30s between real retries
      }
    }

    log(`Loop complete. Sleeping ${LOOP_DELAY / 1000}s.`);
    await sleep(LOOP_DELAY);
  }
}

// --- Signal handlers (daemon resilience) ---
// Parent and child share PGID — signals to the process group propagate to both.
// Without handlers, SIGTERM/SIGHUP use default behavior (terminate).
process.on('SIGTERM', () => {
  log('SIGTERM received — ignoring (launcher is long-running)');
});

process.on('SIGHUP', () => {
  log('SIGHUP received — ignoring (terminal disconnect)');
});

process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  process.exit(130);
});

// Prevent unhandled errors from crashing the launcher
process.on('unhandledRejection', (err) => {
  log(`Unhandled rejection: ${err?.message || err}`);
  if (err?.stack) log(err.stack);
});
process.on('uncaughtException', (err) => {
  // Ignore EPIPE — stdout broken when backgrounded without tty
  if (err?.code === 'EPIPE') return;
  log(`Uncaught exception: ${err?.message || err}`);
  if (err?.stack) log(err.stack);
});

// Export internals for testing
module.exports = {
  advanceState,
  findNextStory,
  findNextMilestone,
  flatStories,
  isBatchComplete,
  startStory,
  recordFixMemory,
  processInfraAction,
  readJson,
  writeJson,
  validateHumanResponse,
  VALID_HUMAN_RESPONSE_TYPES,
};

// Only start the main loop when run directly (not when required for testing)
if (require.main === module) {
  main().catch(err => {
    log(`FATAL: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
}
