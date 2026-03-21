#!/usr/bin/env node
/**
 * The Rouge Launcher — Karpathy Loop of Claude Code invocations.
 * Node.js rewrite of rouge-loop.sh for reliable child process handling.
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROUGE_ROOT = path.resolve(__dirname, '../..');
const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR || path.join(ROUGE_ROOT, 'projects');
const LOG_DIR = path.join(ROUGE_ROOT, 'logs');
const LOOP_DELAY = parseInt(process.env.ROUGE_LOOP_DELAY || '30', 10) * 1000;
const MAX_RETRIES = 3;

fs.mkdirSync(LOG_DIR, { recursive: true });

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
  'qa-gate': 'loop/02b-qa-gate.md',
  'qa-fixing': 'loop/03-qa-fixing.md',
  'po-reviewing': 'loop/02c-po-review.md',
  analyzing: 'loop/04-analyzing.md',
  'generating-change-spec': 'loop/05-change-spec-generation.md',
  'vision-checking': 'loop/06-vision-check.md',
  promoting: 'loop/07-ship-promote.md',
  'rolling-back': 'loop/07-ship-promote.md',
};

// All phases run on Opus — Sonnet times out on complex phases like test-integrity
const MODEL = 'opus';

// Per-phase timeouts (ms) — heavy phases get more time
const PHASE_TIMEOUT = {
  building: 20 * 60 * 1000,           // 20 min — scaffolding, TDD, deployment
  'test-integrity': 15 * 60 * 1000,   // 15 min — scanning tests, generating gaps
  'qa-gate': 25 * 60 * 1000,          // 25 min — browser QA, Lighthouse, code quality, security
  'qa-fixing': 15 * 60 * 1000,        // 15 min — debugging, fixing, redeploying
  'po-reviewing': 15 * 60 * 1000,     // 15 min — journey walks, screen analysis
  analyzing: 10 * 60 * 1000,          // 10 min — reading reports, deciding action
  'generating-change-spec': 10 * 60 * 1000, // 10 min — writing specs
  'vision-checking': 10 * 60 * 1000,  // 10 min — alignment check
  promoting: 5 * 60 * 1000,           // 5 min — merge PR, deploy
  'rolling-back': 5 * 60 * 1000,      // 5 min — revert
};

const SKIP_STATES = new Set(['ready', 'waiting-for-human', 'complete']);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
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

function isRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('rate limit') || lower.includes('too many requests') ||
         lower.includes('429') || lower.includes('hit your limit') ||
         lower.includes('resets ');
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
      // Deploy to staging after building so QA can test live
      log(`[${projectName}] Deploying build to staging`);
      try {
        execSync('npm run build', { cwd: projectDir, timeout: 120000, stdio: 'pipe' });
        execSync('npx @opennextjs/cloudflare build', { cwd: projectDir, timeout: 120000, stdio: 'pipe' });
        const deployOutput = execSync('npx wrangler deploy --env staging', { cwd: projectDir, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
        const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.workers\.dev/);
        if (urlMatch) {
          log(`[${projectName}] Deployed to ${urlMatch[0]}`);
          // Update cycle_context with staging URL
          const ctx = readJson(contextFile);
          if (ctx) {
            ctx.infrastructure = ctx.infrastructure || {};
            ctx.infrastructure.staging_url = urlMatch[0];
            ctx.deployment_url = urlMatch[0];
            writeJson(contextFile, ctx);
          }
        }

        // Push Supabase migrations if configured
        const ctx2 = readJson(contextFile);
        if (ctx2?.supabase?.project_ref) {
          try {
            execSync(`supabase db push --project-ref ${ctx2.supabase.project_ref}`, { cwd: projectDir, timeout: 60000, stdio: 'pipe' });
            log(`[${projectName}] Supabase migrations pushed`);
          } catch {}
        }
      } catch (err) {
        log(`[${projectName}] Deploy after build failed: ${(err.message || '').slice(0, 200)}`);
      }
      next = 'test-integrity';
      break;
    }

    case 'test-integrity': {
      const ctx = readJson(contextFile);
      const verdict = ctx?.test_integrity_report?.verdict || 'PASS';
      next = verdict === 'FAIL' ? 'test-integrity' : 'qa-gate';
      if (verdict === 'FAIL') log(`[${projectName}] Test integrity FAIL — re-running`);
      break;
    }

    case 'qa-gate': {
      const ctx = readJson(contextFile);
      const verdict = ctx?.qa_report?.verdict || 'PASS';
      if (verdict === 'FAIL') {
        if ((state.qa_fix_attempts || 0) >= 3) {
          next = 'waiting-for-human';
          log(`[${projectName}] QA failed 3 times — escalating`);
        } else {
          next = 'qa-fixing';
          state.qa_fix_attempts = (state.qa_fix_attempts || 0) + 1;
          writeJson(stateFile, state);
        }
      } else {
        next = 'po-reviewing';
      }
      break;
    }

    case 'qa-fixing': {
      // Redeploy after fixes so QA tests the updated code
      log(`[${projectName}] Redeploying after QA fixes`);
      try {
        // Cloudflare: rebuild and deploy to staging
        execSync('npm run build', { cwd: projectDir, timeout: 120000, stdio: 'pipe' });
        execSync('npx @opennextjs/cloudflare build', { cwd: projectDir, timeout: 120000, stdio: 'pipe' });
        const deployOutput = execSync('npx wrangler deploy --env staging', { cwd: projectDir, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
        const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.workers\.dev/);
        if (urlMatch) log(`[${projectName}] Redeployed to ${urlMatch[0]}`);

        // Supabase: push migrations if any changed
        const ctx = readJson(contextFile);
        if (ctx?.supabase?.project_ref) {
          try {
            execSync(`supabase db push --project-ref ${ctx.supabase.project_ref}`, { cwd: projectDir, timeout: 60000, stdio: 'pipe' });
            log(`[${projectName}] Supabase migrations pushed`);
          } catch {
            // No migrations to push is fine
          }
        }
      } catch (err) {
        log(`[${projectName}] Redeploy failed: ${(err.message || '').slice(0, 200)}`);
        // Continue anyway — QA will catch deploy issues
      }
      next = 'test-integrity';
      break;
    }

    case 'po-reviewing':
      next = 'analyzing';
      break;

    case 'analyzing': {
      const ctx = readJson(contextFile);
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
      const pending = (state.feature_areas || []).filter(fa => fa.status === 'pending');
      if (pending.length > 0) {
        const nextArea = pending[0].name;
        const fa = state.feature_areas.find(f => f.name === nextArea);
        if (fa) fa.status = 'in-progress';
        state.current_feature_area = nextArea;
        state.cycle_number = (state.cycle_number || 0) + 1;
        state.qa_fix_attempts = 0;
        state.completed_phases = []; // new feature area — reset checkpoints
        writeJson(stateFile, state);
        next = 'building';
        log(`[${projectName}] Advancing to feature area: ${nextArea}`);
      } else {
        next = 'complete';
        log(`[${projectName}] All feature areas complete!`);
      }
      break;
    }

    case 'rolling-back':
      next = 'waiting-for-human';
      break;
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

    // Notify on significant transitions
    const notifications = {
      'qa-gate': `🔍 [${projectName}] Build complete → QA gate starting`,
      'po-reviewing': `👀 [${projectName}] QA passed → PO review starting`,
      'promoting': `🚀 [${projectName}] Vision check passed → promoting`,
      'complete': `✅ [${projectName}] All feature areas complete!`,
      'waiting-for-human': `⏸️ [${projectName}] Needs human input (from: ${current})`,
    };
    if (notifications[next]) notify(notifications[next]);
  }
}

// --- Phase execution ---

function runPhase(projectDir) {
  const projectName = path.basename(projectDir);
  const stateFile = path.join(projectDir, 'state.json');
  const state = readJson(stateFile);
  if (!state) return true; // no state file = skip

  let currentState = state.current_state;

  // Check for feedback queue or resume from waiting-for-human
  if (currentState === 'waiting-for-human') {
    // Only resume if there's feedback or if triggered by Slack resume command
    if (!fs.existsSync(path.join(projectDir, 'feedback.json'))) return true;

    log(`[${projectName}] Feedback found, resuming from checkpoint`);

    // Use checkpoint to determine correct resume point
    const completed = state.completed_phases || [];
    const pipeline = ['building', 'test-integrity', 'qa-gate', 'po-reviewing', 'analyzing', 'vision-checking', 'promoting'];
    let resumeState = state.paused_from_state || 'building';

    // Find the next phase after the last completed checkpoint
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

  if (SKIP_STATES.has(currentState)) return true;

  // Normalize *-complete states (phase prompts sometimes write these)
  if (currentState.endsWith('-complete')) {
    const baseState = currentState.replace('-complete', '');
    log(`[${projectName}] Normalizing state: ${currentState} → advancing from ${baseState}`);
    state.current_state = baseState;
    writeJson(stateFile, state);
    currentState = baseState;
    advanceState(projectDir);
    return true; // will pick up the new state on next iteration
  }

  // Infrastructure provisioning: run before building if not yet provisioned
  if (currentState === 'building') {
    const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
    if (ctx && !ctx.infrastructure?.staging_url) {
      log(`[${projectName}] Infrastructure not provisioned — running provisioning`);
      try {
        execFileSync('node', [path.join(__dirname, 'provision-infrastructure.js'), projectDir], {
          encoding: 'utf8',
          timeout: 300000, // 5 min for provisioning
          stdio: 'inherit',
        });
      } catch (err) {
        log(`[${projectName}] Provisioning failed: ${(err.message || '').slice(0, 200)}`);
        // Continue anyway — building can still work without staging, just QA will be limited
      }
    }
  }

  const promptRelPath = STATE_TO_PROMPT[currentState];
  if (!promptRelPath) return true;

  const promptFile = path.join(ROUGE_ROOT, 'src/prompts', promptRelPath);
  if (!fs.existsSync(promptFile)) {
    log(`[${projectName}] Prompt file not found: ${promptFile}`);
    return false;
  }

  const model = MODEL;
    const timeout = PHASE_TIMEOUT[currentState] || 10 * 60 * 1000;
  const phaseLog = path.join(LOG_DIR, `${projectName}-${currentState}.log`);

  log(`[${projectName}] Running phase: ${currentState} (model: ${model}, timeout: ${timeout / 60000}min)`);

  const filesBefore = countFiles(projectDir);

  try {
    // The key fix: execFileSync with proper args array, no shell interpretation
    const output = execFileSync('claude', [
      '-p',
      `Read the phase prompt at ${promptFile} and execute it. The project directory is ${projectDir}. Read cycle_context.json and state.json for context.`,
      '--dangerously-skip-permissions',
      '--model', model,
      '--max-turns', '200',
    ], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'], // capture all streams
      env: { ...process.env },
    });

    // Append output to phase log
    fs.appendFileSync(phaseLog, output);

    const filesAfter = countFiles(projectDir);
    const delta = filesAfter - filesBefore;
    log(`[${projectName}] Phase ${currentState} completed (files: ${filesBefore} → ${filesAfter}, delta: +${delta})`);

    // Log last meaningful line
    const lines = output.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      log(`[${projectName}] Output: ${lines[lines.length - 1].slice(0, 200)}`);
    }

    // Check for rate limiting in output
    if (isRateLimited(output)) {
      log(`[${projectName}] Rate limited during phase ${currentState}`);
      return false;
    }

    // Advance state machine
    advanceState(projectDir);
    return true;

  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';

    // Append whatever output we got
    if (stdout) fs.appendFileSync(phaseLog, stdout);
    if (stderr) fs.appendFileSync(phaseLog, '\n--- STDERR ---\n' + stderr);

    // Check for rate limiting
    if (isRateLimited(stdout) || isRateLimited(stderr)) {
      log(`[${projectName}] Rate limited — backing off`);
      return false;
    }

    // Check for timeout
    if (err.message && (err.message.includes('ETIMEDOUT') || err.message.includes('timed out'))) {
      log(`[${projectName}] Phase ${currentState} timed out`);
      return false;
    }

    const errorLine = (stderr || stdout || err.message || '').split('\n').filter(l => l.trim()).pop() || 'unknown error';
    log(`[${projectName}] Phase ${currentState} failed: ${errorLine.slice(0, 200)}`);
    return false;
  }
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

  const projects = listProjects();
  if (projects.length === 0) return;

  const lines = projects.map(name => {
    const state = readJson(path.join(PROJECTS_DIR, name, 'state.json'));
    return `• ${name}: ${state?.current_state || '?'} (cycle ${state?.cycle_number || 0})`;
  });
  notify(`☀️ Morning Briefing\n${lines.join('\n')}`);
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
  log(`Rouge launcher starting. Projects dir: ${PROJECTS_DIR}`);
  checkAuthExpiry();

  while (true) {
    checkBriefing();

    const projects = listProjects();
    for (const projectName of projects) {
      const projectDir = path.join(PROJECTS_DIR, projectName);
      let retries = 0;

      while (retries < MAX_RETRIES) {
        const success = runPhase(projectDir);
        if (success) break;

        retries++;
        log(`[${projectName}] Retry ${retries}/${MAX_RETRIES}`);

        if (retries >= MAX_RETRIES) {
          log(`[${projectName}] Max retries reached. Transitioning to waiting-for-human.`);
          const stateFile = path.join(projectDir, 'state.json');
          const state = readJson(stateFile);
          if (state) {
            state.paused_from_state = state.current_state;
            state.current_state = 'waiting-for-human';
            state.timestamp = new Date().toISOString();
            writeJson(stateFile, state);
          }
          notify(`⚠️ [${projectName}] Phase failed ${MAX_RETRIES} times. Moved to waiting-for-human.`);
        }

        // Rate limit backoff
        const phaseLog = path.join(LOG_DIR, `${projectName}-${readJson(path.join(projectDir, 'state.json'))?.current_state || 'unknown'}.log`);
        let logContent = '';
        try { logContent = fs.readFileSync(phaseLog, 'utf8'); } catch {}

        if (isRateLimited(logContent)) {
          const backoff = 60000 * retries;
          log(`[${projectName}] Rate limited. Backing off ${backoff / 1000}s.`);
          await sleep(backoff);
        } else {
          await sleep(30000);
        }
      }
    }

    log(`Loop complete. Sleeping ${LOOP_DELAY / 1000}s.`);
    await sleep(LOOP_DELAY);
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
