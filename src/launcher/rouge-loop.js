#!/usr/bin/env node
/**
 * The Rouge Launcher — Karpathy Loop of Claude Code invocations.
 * Canonical launcher for The Rouge's Karpathy Loop.
 */

const { execFileSync, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadProjectSecrets } = require('./secrets.js');

const ROUGE_ROOT = path.resolve(__dirname, '../..');
const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR || path.join(ROUGE_ROOT, 'projects');
const LOG_DIR = path.join(ROUGE_ROOT, 'logs');
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

function log(msg) {
  const ts = new Date().toISOString().replace('T', 'T').slice(0, 19) + 'Z';
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, 'rouge.log'), line + '\n');
}

// --- State helpers ---

const STATE_TO_PROMPT = {
  seeding: 'seeding/00-swarm-orchestrator.md',
  building: 'loop/01-building.md',
  'test-integrity': 'loop/02a-test-integrity.md',
  // New observe-once, judge-through-lenses architecture (2026-03-23)
  'code-review': 'loop/02c-code-review.md',
  'product-walk': 'loop/02d-product-walk.md',
  'evaluation': 'loop/02e-evaluation.md',
  're-walk': 'loop/02f-re-walk.md',
  // Legacy (commented out — kept for reference during migration)
  // 'qa-gate': 'loop/02b-qa-gate.md',
  // 'po-reviewing': 'loop/02c-po-review.md',
  // 'po-review-journeys': 'loop/02c-po-review.md',
  // 'po-review-screens': 'loop/02c-po-review.md',
  // 'po-review-heuristics': 'loop/02c-po-review.md',
  'qa-fixing': 'loop/03-qa-fixing.md',
  analyzing: 'loop/04-analyzing.md',
  'generating-change-spec': 'loop/05-change-spec-generation.md',
  'vision-checking': 'loop/06-vision-check.md',
  promoting: 'loop/07-ship-promote.md',
  'rolling-back': 'loop/07-ship-promote.md',
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

const SKIP_STATES = new Set(['seeding', 'ready', 'waiting-for-human', 'complete']);

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
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
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
    for (const file of ['state.json', 'cycle_context.json']) {
      const src = path.join(projectDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(snapshotDir, file));
      }
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
  } catch {}
}

function notifyRich(type, args) {
  try {
    execFileSync('node', [
      path.join(__dirname, 'notify-slack.js'),
      type,
      JSON.stringify(args),
    ], { env: process.env, timeout: 15000, stdio: 'pipe' });
  } catch {}
}

function isRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('rate limit') || lower.includes('too many requests') ||
         lower.includes('429') || lower.includes('hit your limit') ||
         lower.includes('resets ');
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

// --- State machine transitions ---

function advanceState(projectDir) {
  const projectName = path.basename(projectDir);
  const stateFile = path.join(projectDir, 'state.json');
  const contextFile = path.join(projectDir, 'cycle_context.json');
  const state = readJson(stateFile);
  if (!state) return;

  const current = state.current_state;
  let next = null;

  switch (current) {
    case 'building': {
      const buildDelta = state.last_build_delta || 0;

      // No-op build detection: if build produced no meaningful changes,
      // this feature area was already built in a prior cycle. Skip the
      // entire review pipeline — mark area complete and advance.
      if (buildDelta <= 0 && state.current_feature_area) {
        log(`[${projectName}] Build produced no changes for "${state.current_feature_area}" — already built, skipping review`);
        const fa = (state.feature_areas || []).find(f => f.name === state.current_feature_area);
        if (fa) fa.status = 'complete';

        // Check for more pending areas
        const pending = (state.feature_areas || []).filter(f => f.status === 'pending');
        if (pending.length > 0) {
          const nextArea = pending[0].name;
          const nextFa = state.feature_areas.find(f => f.name === nextArea);
          if (nextFa) nextFa.status = 'in-progress';
          state.current_feature_area = nextArea;
          state.cycle_number = (state.cycle_number || 0) + 1;
          state.completed_phases = [];
          state.last_build_delta = undefined;
          writeJson(stateFile, state);
          next = 'building';
          log(`[${projectName}] Advancing to feature area: ${nextArea}`);
        } else {
          next = 'complete';
          log(`[${projectName}] All feature areas already built — complete!`);
        }
        break;
      }

      // Normal build with changes — deploy and continue to review
      try {
        const { deploy } = require('./deploy-to-staging');
        deploy(projectDir);
      } catch (err) {
        log(`[${projectName}] Deploy failed: ${(err.message || '').slice(0, 200)}`);
      }
      state.last_build_delta = undefined; // clean up
      writeJson(stateFile, state);
      next = 'test-integrity';
      break;
    }

    case 'test-integrity': {
      const ctx = readJson(contextFile);
      const verdict = ctx?.test_integrity_report?.verdict || 'PASS';
      next = verdict === 'FAIL' ? 'test-integrity' : 'code-review';
      if (verdict === 'FAIL') log(`[${projectName}] Test integrity FAIL — re-running`);
      break;
    }

    case 'code-review':
      next = 'product-walk';
      break;

    case 'product-walk': {
      // Screenshots are now captured by the walk itself, but also capture via launcher for consistency
      try {
        const { captureScreenshots } = require('./capture-screenshots');
        const loopNum = state.cycle_number || 0;
        const screenshots = captureScreenshots(projectDir, loopNum);
        if (screenshots.length > 0) {
          log(`[${projectName}] Screenshots captured for loop ${loopNum}: ${screenshots.length}`);
          notifyRich('screenshots', { project: projectName, loop: loopNum, count: screenshots.length, screens: screenshots.map(s => s.name) });
        }
      } catch (err) {
        log(`[${projectName}] Screenshot capture failed: ${(err.message || '').slice(0, 100)}`);
      }
      next = 'evaluation';
      break;
    }

    case 'evaluation': {
      const ctx = readJson(contextFile);
      // Check for re-walk requests (max 2 re-walks)
      const reWalkRequests = ctx?.evaluation_report?.re_walk_requests || [];
      if (reWalkRequests.length > 0 && !state.skip_re_walk && (state.re_walk_count || 0) < 2) {
        next = 're-walk';
        break;
      }
      // Reset re-walk tracking
      state.re_walk_count = 0;
      state.skip_re_walk = false;

      // Check QA verdict (from backwards-compat qa_report)
      const qaVerdict = ctx?.qa_report?.verdict || 'PASS';
      if (qaVerdict === 'FAIL') {
        if ((state.qa_fix_attempts || 0) >= 3) {
          next = 'waiting-for-human';
          log(`[${projectName}] Evaluation FAIL 3 times — escalating`);
        } else {
          next = 'qa-fixing';
          state.qa_fix_attempts = (state.qa_fix_attempts || 0) + 1;
          writeJson(stateFile, state);
        }
      } else {
        next = 'analyzing';
      }
      break;
    }

    case 're-walk': {
      state.re_walk_count = (state.re_walk_count || 0) + 1;
      writeJson(stateFile, state);
      next = 'evaluation';
      break;
    }

    case 'qa-fixing': {
      // Redeploy after fixes
      try {
        const { deploy } = require('./deploy-to-staging');
        deploy(projectDir);
      } catch (err) {
        log(`[${projectName}] Redeploy failed: ${(err.message || '').slice(0, 200)}`);
      }
      next = 'test-integrity';
      break;
    }

    case 'analyzing': {
      const ctx = readJson(contextFile);
      // FW.46: Don't generate change specs from synthetic data
      if (ctx?.po_review_report?.synthetic) {
        log(`[${projectName}] PO report is synthetic — skipping change spec generation`);
        next = 'vision-checking';
        break;
      }
      const action = ctx?.po_review_report?.recommended_action || 'continue';
      if (action === 'continue') next = 'vision-checking';
      else if (action.startsWith('deepen') || action === 'broaden') next = 'generating-change-spec';
      else if (action === 'rollback') next = 'rolling-back';
      else if (action.startsWith('notify')) next = 'waiting-for-human';
      else next = 'vision-checking';
      break;
    }

    case 'generating-change-spec':
      next = 'building';
      state.cycle_number = (state.cycle_number || 0) + 1;
      state.qa_fix_attempts = 0;
      state.completed_phases = []; // new cycle — reset checkpoints
      writeJson(stateFile, state);
      break;

    case 'vision-checking':
      next = 'promoting';
      break;

    case 'promoting': {
      // Mark current feature area as complete
      if (state.current_feature_area) {
        const currentFa = (state.feature_areas || []).find(f => f.name === state.current_feature_area);
        if (currentFa) currentFa.status = 'complete';
      }

      // Module-aware advancement (large projects)
      if (Array.isArray(state.modules) && state.modules.length > 0) {
        // Find current module
        const currentModule = state.modules.find(m => m.status === 'in-progress');
        if (currentModule) {
          // Mark current area complete within module
          const area = currentModule.feature_areas?.find(fa => fa.name === state.current_feature_area);
          if (area) area.status = 'complete';

          // Check for more pending areas in current module
          const pendingInModule = (currentModule.feature_areas || []).filter(fa => fa.status === 'pending');
          if (pendingInModule.length > 0) {
            // More areas in this module
            const nextArea = pendingInModule[0];
            nextArea.status = 'in-progress';
            state.current_feature_area = nextArea.name;
            state.cycle_number = (state.cycle_number || 0) + 1;
            state.qa_fix_attempts = 0;
            state.completed_phases = [];
            writeJson(stateFile, state);
            next = 'building';
            log(`[${projectName}] Module "${currentModule.name}": advancing to area "${nextArea.name}"`);
            break;
          }

          // Current module complete
          currentModule.status = 'complete';
          log(`[${projectName}] Module "${currentModule.name}" complete`);
        }

        // Find next module (respecting dependencies)
        const completedModules = new Set(state.modules.filter(m => m.status === 'complete').map(m => m.name));
        const nextModule = state.modules.find(m => {
          if (m.status !== 'pending') return false;
          const deps = m.dependencies || [];
          return deps.every(d => completedModules.has(d));
        });

        if (nextModule) {
          nextModule.status = 'in-progress';
          const firstArea = (nextModule.feature_areas || [])[0];
          if (firstArea) {
            firstArea.status = 'in-progress';
            state.current_feature_area = firstArea.name;
          }
          state.current_module = nextModule.name;
          state.cycle_number = (state.cycle_number || 0) + 1;
          state.qa_fix_attempts = 0;
          state.completed_phases = [];
          writeJson(stateFile, state);
          next = 'building';
          log(`[${projectName}] Advancing to module "${nextModule.name}", area "${firstArea?.name}"`);
          break;
        }

        // All modules complete
        next = 'final-review';
        log(`[${projectName}] All modules complete — entering final review`);
        break;
      }

      // Flat feature_areas fallback (small projects — existing behavior)
      const pending = (state.feature_areas || []).filter(fa => fa.status === 'pending');
      if (pending.length > 0) {
        const nextArea = pending[0].name;
        const fa = state.feature_areas.find(f => f.name === nextArea);
        if (fa) fa.status = 'in-progress';
        state.current_feature_area = nextArea;
        state.cycle_number = (state.cycle_number || 0) + 1;
        state.qa_fix_attempts = 0;
        state.completed_phases = [];
        writeJson(stateFile, state);
        next = 'building';
        log(`[${projectName}] Advancing to feature area: ${nextArea}`);
      } else {
        next = 'final-review';
        log(`[${projectName}] All feature areas complete — entering final review`);
      }
      break;
    }

    case 'rolling-back':
      next = 'waiting-for-human';
      break;

    case 'final-review': {
      const ctx = readJson(contextFile);
      const finalReport = ctx?.final_review_report;
      if (finalReport?.production_ready || finalReport?.human_approved) {
        next = 'complete';
        log(`[${projectName}] Final review PASSED — shipping!`);
      } else if (finalReport?.recommendation === 'major-rework') {
        next = 'waiting-for-human';
        log(`[${projectName}] Final review: major rework needed — escalating`);
      } else {
        next = 'generating-change-spec';
        log(`[${projectName}] Final review: needs refinement — ${finalReport?.recommendation || 'refine'}`);
      }
      break;
    }
  }

  if (next) {
    log(`[${projectName}] State transition: ${current} → ${next}`);

    // Checkpoint: track completed phases in current cycle
    if (!state.completed_phases) state.completed_phases = [];
    if (!state.completed_phases.includes(current)) {
      state.completed_phases.push(current);
    }

    state.current_state = next;
    state.timestamp = new Date().toISOString();
    writeJson(stateFile, state);

    // FW.2 + FW.3: Rich Block Kit notifications
    notifyRich('transition', { project: projectName, from: current, to: next });

    // Cross-product learning: extract lessons when a project completes
    if (next === 'complete') {
      try {
        execFileSync('node', [path.join(__dirname, 'learn-from-project.js'), projectDir], {
          encoding: 'utf8', timeout: 30000, stdio: 'pipe',
        });
        log(`[${projectName}] Personal library updated with learnings`);
      } catch (err) {
        log(`[${projectName}] Learning extraction failed: ${(err.message || '').slice(0, 100)}`);
      }
    }
  }
}

// --- Phase execution (async with streaming output + reliable timeout) ---

async function runPhase(projectDir) {
  const projectName = path.basename(projectDir);
  const stateFile = path.join(projectDir, 'state.json');
  const contextFile = path.join(projectDir, 'cycle_context.json');
  const state = readJson(stateFile);
  if (!state) return { success: true }; // no state file = skip

  let currentState = state.current_state;

  // Check for feedback queue or resume from waiting-for-human
  if (currentState === 'waiting-for-human') {
    if (!fs.existsSync(path.join(projectDir, 'feedback.json'))) return { success: true };

    log(`[${projectName}] Feedback found, resuming from checkpoint`);
    const completed = state.completed_phases || [];
    const pipeline = ['building', 'test-integrity', 'code-review', 'product-walk', 'evaluation', 'analyzing', 'vision-checking', 'promoting', 'final-review'];
    let resumeState = state.paused_from_state || 'building';

    if (completed.length > 0) {
      const lastCompleted = completed[completed.length - 1];
      const lastIdx = pipeline.indexOf(lastCompleted);
      if (lastIdx >= 0 && lastIdx < pipeline.length - 1) {
        resumeState = pipeline[lastIdx + 1];
      }
    }

    log(`[${projectName}] Checkpoints: [${completed.join(', ')}] → resuming at ${resumeState}`);
    currentState = resumeState;
    state.current_state = currentState;
    delete state.paused_from_state;
    writeJson(stateFile, state);
  }

  if (SKIP_STATES.has(currentState)) return { success: true };

  // Normalize *-complete states
  if (currentState.endsWith('-complete')) {
    const baseState = currentState.replace('-complete', '');
    log(`[${projectName}] Normalizing state: ${currentState} → advancing from ${baseState}`);
    state.current_state = baseState;
    writeJson(stateFile, state);
    advanceState(projectDir);
    return { success: true };
  }

  // Infrastructure provisioning before building if not yet provisioned
  if (currentState === 'building') {
    const ctx = readJson(contextFile);
    if (ctx && !ctx.infrastructure?.staging_url) {
      log(`[${projectName}] Infrastructure not provisioned — running provisioning`);
      try {
        execFileSync('node', [path.join(__dirname, 'provision-infrastructure.js'), projectDir], {
          encoding: 'utf8', timeout: 300000, stdio: 'inherit',
        });
      } catch (err) {
        log(`[${projectName}] Provisioning failed: ${(err.message || '').slice(0, 200)}`);
      }
    }
  }

  // Snapshot state before phase — enables recovery from corruption
  snapshotState(projectDir, currentState);

  const promptRelPath = STATE_TO_PROMPT[currentState];
  if (!promptRelPath) return { success: true };

  const promptFile = path.join(ROUGE_ROOT, 'src/prompts', promptRelPath);
  if (!fs.existsSync(promptFile)) {
    log(`[${projectName}] Prompt file not found: ${promptFile}`);
    return { success: false };
  }

  const model = MODEL;
  const phaseLog = path.join(LOG_DIR, `${projectName}-${currentState}.log`);

  log(`[${projectName}] Running phase: ${currentState} (model: ${model}, ceiling: ${HARD_CEILING / 60000}min, stale: ${PROGRESS_STALE_THRESHOLD / 60000}min)`);

  const filesBefore = countFiles(projectDir);

  // Async spawn with streaming output + progress-based watchdog
  return new Promise((resolve) => {
    const logStream = fs.createWriteStream(phaseLog, { flags: 'a' });
    let stderrChunks = [];
    let killed = false;

    // Build the prompt instruction — add scope for PO review sub-phases
    let promptInstruction = `Read the phase prompt at ${promptFile} and execute it. The project directory is ${projectDir}. Read cycle_context.json and state.json for context.`;

    // FIX-6: Save state.json before phase — restore if phase overwrites it
    const stateBeforePhase = JSON.stringify(readJson(stateFile));

    // Load project secrets from OS credential store
    const secretsEnv = loadSecretsForProject(projectDir, projectName);

    // spawn (not execFile) for real-time stdout streaming
    const child = spawn('claude', [
      '-p',
      promptInstruction,
      '--dangerously-skip-permissions',
      '--model', model,
      '--max-turns', '200',
    ], {
      cwd: projectDir,
      env: { ...process.env, ...secretsEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Stream stdout to log file in real-time (FIX-2: partial output always saved)
    if (child.stdout) {
      child.stdout.pipe(logStream);
    }

    // Capture stderr for rate limit detection
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
        logStream.write('\n[STDERR] ' + chunk);
      });
    }

    // --- Progress-based watchdog ---
    // Tracks both log growth and meaningful progress events.
    // Kills only when the agent is truly stuck, not just thinking.
    const HEARTBEAT_INTERVAL = 30000; // check every 30s (was 60s)
    let lastLogSize = 0;
    let lastLogGrowthAt = Date.now();
    let lastProgressEventAt = Date.now();
    const phaseStartedAt = Date.now();

    const heartbeat = setInterval(() => {
      try {
        const currentSize = fs.statSync(phaseLog).size;
        const now = Date.now();
        const elapsed = now - phaseStartedAt;

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

        const logStaleDuration = now - lastLogGrowthAt;
        const progressStaleDuration = now - lastProgressEventAt;

        // Decision logic: should we kill this phase?
        let shouldKill = false;
        let killReason = '';

        // Hard ceiling — absolute safety net
        if (elapsed >= HARD_CEILING) {
          shouldKill = true;
          killReason = `hard ceiling (${HARD_CEILING / 60000}min)`;
        }
        // No log growth AND no progress events — agent is stuck
        else if (logStaleDuration >= LOG_STALE_THRESHOLD && progressStaleDuration >= PROGRESS_STALE_THRESHOLD) {
          shouldKill = true;
          killReason = `no output for ${Math.floor(logStaleDuration / 60000)}min and no progress for ${Math.floor(progressStaleDuration / 60000)}min`;
        }

        // Log stale status periodically (every 3 min of staleness)
        if (logStaleDuration >= 180000 && logStaleDuration % 60000 < HEARTBEAT_INTERVAL) {
          log(`[${projectName}] Phase ${currentState} — no output for ${Math.floor(logStaleDuration / 1000)}s (progress last seen ${Math.floor(progressStaleDuration / 1000)}s ago)`);
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

    child.on('close', (code) => {
      try { clearInterval(heartbeat); } catch {}
      try { logStream.end(); } catch {}

      const stderr = stderrChunks.map(c => typeof c === 'string' ? c : c.toString()).join('');

      if (killed) {
        const elapsed = Math.floor((Date.now() - phaseStartedAt) / 60000);
        log(`[${projectName}] Phase ${currentState} killed after ${elapsed}min`);
        resolve({ success: false, timedOut: true });
        return;
      }

      // Rate limit detection — check stderr AND last 2KB of phase log (stdout)
      // Claude CLI outputs "You've hit your limit" to stdout, not stderr
      let rateLimitSource = null;
      if (isRateLimited(stderr)) {
        rateLimitSource = 'stderr';
      } else {
        try {
          const tail = fs.readFileSync(phaseLog, 'utf8').slice(-2000);
          if (isRateLimited(tail)) rateLimitSource = 'stdout';
        } catch {}
      }
      if (rateLimitSource) {
        log(`[${projectName}] Rate limited (detected in ${rateLimitSource})`);
        resolve({ success: false, rateLimited: true });
        return;
      }

      if (code !== 0) {
        const errorLine = stderr.split('\n').filter(l => l.trim()).pop() || `exit code ${code}`;
        log(`[${projectName}] Phase ${currentState} failed: ${errorLine.slice(0, 200)}`);
        resolve({ success: false });
        return;
      }

      // Success
      const filesAfter = countFiles(projectDir);
      const delta = filesAfter - filesBefore;
      log(`[${projectName}] Phase ${currentState} completed (files: ${filesBefore} → ${filesAfter}, delta: +${delta})`);

      // Store build delta in state so advanceState can detect no-op builds
      if (currentState === 'building') {
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
      const stateAfterPhase = readJson(stateFile);
      if (stateAfterPhase && stateAfterPhase.current_state !== currentState) {
        log(`[${projectName}] Phase wrote state.json (${stateAfterPhase.current_state}) — restoring to ${currentState}`);
        const restored = JSON.parse(stateBeforePhase);
        restored.current_state = currentState; // keep the state the launcher set
        writeJson(stateFile, restored);
      }

      // Advance state machine
      try {
        advanceState(projectDir);
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
    const state = readJson(path.join(PROJECTS_DIR, name, 'state.json'));
    return { name, state: state?.current_state || '?', cycle: state?.cycle_number || 0 };
  });

  if (projects.length > 0) {
    notifyRich('briefing', { projects });
  }
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR).filter(d =>
    fs.existsSync(path.join(PROJECTS_DIR, d, 'state.json'))
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
            const phaseState = readJson(path.join(projectDir, 'state.json'));
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
          const stateFile = path.join(projectDir, 'state.json');
          const contextFile = path.join(projectDir, 'cycle_context.json');
          const state = readJson(stateFile);
          const ctx = readJson(contextFile);
          if (state) {
            state.paused_from_state = state.current_state;
            state.current_state = 'waiting-for-human';
            state.timestamp = new Date().toISOString();
            writeJson(stateFile, state);
          }
          // Rich escalation with cycle context for efficient human triage
          notifyRich('escalation', {
            project: projectName,
            phase: state?.paused_from_state || 'unknown',
            reason: `Failed ${MAX_RETRIES} times`,
            context: {
              cycle: state?.cycle_number,
              featureArea: state?.current_feature_area,
              healthScore: ctx?.qa_report?.health_score,
              confidence: ctx?.po_review_report?.confidence,
              lastProgress: ctx?.evaluator_observations?.slice(-1)?.[0],
              completedPhases: state?.completed_phases,
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
  log(`Uncaught exception: ${err?.message || err}`);
  if (err?.stack) log(err.stack);
});

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
