#!/usr/bin/env node
/**
 * The Rouge CLI — project management, loop execution, and secrets.
 *
 * Usage: run `rouge` with no args for grouped help.
 *
 * The dashboard is the primary control surface. CLI verbs like `seed`,
 * `init`, `build`, and `slack start` are experimental — they still work but
 * print a warning and are no longer the recommended path.
 *
 * See docs/plans/2026-04-15-onboarding-refactor.md for the full refactor plan.
 */

const readline = require('readline');
const { execSync, spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

const ROUGE_ROOT = path.resolve(__dirname, '../..');

// Projects always live under ~/.rouge/projects so spawned phase agents
// (cwd = project dir) don't inherit Rouge's own CLAUDE.md via ancestor
// lookup — see #143 for the leak that motivated moving them out of the
// repo tree.
function resolveProjectsDir() {
  if (process.env.ROUGE_PROJECTS_DIR) return process.env.ROUGE_PROJECTS_DIR;
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.rouge', 'projects');
}
const PROJECTS_DIR = resolveProjectsDir();

// ---------------------------------------------------------------------------
// Lifecycle primitives (shared by `dashboard`, top-level `status/stop/start`,
// and `uninstall`). Kept at module scope so every command sees the same
// PID file, port, and URL.
// ---------------------------------------------------------------------------

const ROUGE_HOME = process.env.ROUGE_HOME || path.join(require('os').homedir(), '.rouge');
const PID_FILE = path.join(ROUGE_HOME, 'dashboard.pid');
const DASHBOARD_PORT = parseInt(process.env.ROUGE_DASHBOARD_PORT || '3001', 10);
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

function readDashboardPids() {
  try { return JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch { return null; }
}
function isPidRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function dashboardLiveness() {
  const pids = readDashboardPids();
  if (!pids) return { running: false, pid: null, pids: null };
  const pid = pids.pid || pids.bridge; // back-compat
  return { running: isPidRunning(pid), pid, pids };
}

// Returns the first PID listening on `port` (IPv4 OR IPv6), or null.
// Used to fail loud instead of silently binding a different address family
// when another service holds the port — e.g. The Works on IPv6 :3001 while
// Rouge would happily take IPv4 :3001, leaving the browser to pick one by
// DNS resolution order.
function findPortListener(port) {
  try {
    const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -P -n`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.trim().split('\n').slice(1); // drop header
    const entries = lines.map((l) => {
      const [cmd, pid] = l.trim().split(/\s+/);
      return { cmd, pid: parseInt(pid, 10) };
    }).filter((e) => e.pid && !Number.isNaN(e.pid));
    // Exclude our own dashboard's PID — if we just wrote the PID file and
    // the process is already us, we shouldn't refuse to restart ourselves.
    const ours = dashboardLiveness();
    const foreign = entries.filter((e) => !ours.pid || e.pid !== ours.pid);
    return foreign[0] || null;
  } catch {
    return null; // lsof missing, no listeners, or permission denied — don't block startup
  }
}

// Returns true if something answers HTTP on the dashboard port — a cheap
// way to tell "the running dashboard is actually serving" vs "PID is alive
// but server died."
function isDashboardResponsive(timeoutMs = 500) {
  try {
    execSync(`curl -s -o /dev/null --max-time ${Math.max(1, Math.ceil(timeoutMs / 1000))} ${DASHBOARD_URL}/`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Experimental-command warning. The dashboard is the canonical control
// surface (see docs/plans/2026-04-15-onboarding-refactor.md). CLI verbs
// like `seed`, `init`, `build`, and `slack start` still work but are no
// longer the recommended path. Print a one-line warning so users know.
// Suppress with ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1 for automation.
// ---------------------------------------------------------------------------

function warnExperimental(cmd) {
  if (process.env.ROUGE_SUPPRESS_EXPERIMENTAL_WARNING === '1') return;
  console.error(`\n  ⚠️  \`rouge ${cmd}\` is still supported but no longer the recommended path.`);
  console.error(`     The dashboard is now the primary control surface. Run \`rouge setup\``);
  console.error(`     then \`rouge dashboard\` and use the New Project button.`);
  console.error(`     Suppress this warning with ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1.\n`);
}

// ---------------------------------------------------------------------------
// Control plane config — rouge.config.json declares which control plane
// (dashboard vs slack) is active. When `control_plane_lock` is true, the
// CLI refuses to start the non-selected plane so the two can't race on
// state.json. README documents this as the user-visible contract.
// ---------------------------------------------------------------------------

function readRougeConfig() {
  const candidates = [
    path.join(process.cwd(), 'rouge.config.json'),
    path.join(ROUGE_ROOT, 'rouge.config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* fall through */ }
  }
  return {};
}

function assertControlPlaneAllowed(requested) {
  const cfg = readRougeConfig();
  const selected = cfg.control_plane || 'frontend';
  const locked = cfg.control_plane_lock !== false; // default on
  if (!locked) return;
  const ok = (requested === 'slack' && selected === 'slack')
    || (requested === 'frontend' && (selected === 'frontend' || selected === 'dashboard'));
  if (!ok) {
    console.error(`  Refusing to start ${requested} control plane.`);
    console.error(`  rouge.config.json has control_plane="${selected}" with control_plane_lock=true.`);
    console.error(`  Running both dashboard and Slack against the same project races on state.json.`);
    console.error(`  Either set control_plane="${requested}" in rouge.config.json, or set control_plane_lock=false to override.`);
    process.exit(1);
  }
}
const {
  storeSecret,
  getSecret,
  listSecrets,
  deleteSecret,
  loadProjectSecrets,
  discoverIntegrations,
  validateIntegration,
  validateProjectSecrets,
  recordValidation,
  setExpiry,
  getExpiringSecrets,
  INTEGRATION_KEYS,
} = require('./secrets.js');
const { buildClaudeEnv } = require('./auth-mode.js');
const { statePath: resolveStatePath } = require('./state-path.js');

// ---------------------------------------------------------------------------
// Interactive input helper
// ---------------------------------------------------------------------------

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    ask(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      });
    },
    close() {
      rl.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdSetup(integration) {
  // Flags aren't integration names — `rouge setup --yes` should mean
  // "first-run setup, accept defaults," not "integration named --yes."
  if (integration && integration.startsWith('-')) integration = undefined;
  // First-run setup: `rouge setup` with no args installs everything
  if (!integration) {
    console.log('\n  Rouge first-time setup');
    console.log('  ' + '-'.repeat(40));

    // 1. Run doctor to check prereqs
    console.log('\n  Step 1: Checking prerequisites...\n');
    cmdDoctor();

    // 2. Install dashboard
    const dashboardDir = path.join(__dirname, '..', '..', 'dashboard');
    if (fs.existsSync(dashboardDir)) {
      // Source checkouts install dev deps so `rouge dashboard` can `next dev`.
      // Global installs ship the prebuilt standalone — skip `npm install`.
      const hasPrebuilt = fs.existsSync(path.join(dashboardDir, 'dist', 'server.js'));
      if (hasPrebuilt) {
        console.log('\n  Step 2: Dashboard prebuilt runtime detected — skipping install ✅');
      } else {
        console.log('\n  Step 2: Installing dashboard dev dependencies...');
        try {
          execSync('npm install', { cwd: dashboardDir, stdio: 'inherit', timeout: 120000 });
          console.log('  Dashboard dev deps installed ✅');
        } catch (err) {
          console.error(`  Dashboard install failed: ${(err.message || '').slice(0, 150)}`);
        }
      }
    } else {
      console.log('\n  Step 2: Dashboard directory not found (skipping)');
    }

    // 3. Ensure projects directory exists
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      console.log(`\n  Step 3: Created projects directory at ${PROJECTS_DIR}`);
    } else {
      console.log(`\n  Step 3: Projects directory exists at ${PROJECTS_DIR}`);
    }

    // 4. Daemon install (macOS only for Phase 2.5a; Linux/Windows stubbed)
    // Non-interactive flags for scripted/CI setup and for Claude Code's bash
    // tool (which can't feed stdin to an interactive prompt):
    //   --yes / -y      : accept defaults (install daemon)
    //   --no-daemon     : skip daemon install
    const cliArgs = process.argv.slice(2);
    const autoYes = cliArgs.includes('--yes') || cliArgs.includes('-y');
    const noDaemon = cliArgs.includes('--no-daemon');

    const daemon = require('./daemon.js');
    const daemonStatus = daemon.statusSummary();
    if (daemonStatus.supported && !daemonStatus.installed) {
      console.log('\n  Step 4: Background daemon');
      let install;
      if (noDaemon) {
        install = false;
        console.log('    --no-daemon: skipping launch agent install.');
      } else if (autoYes) {
        install = true;
        console.log('    --yes: installing launch agent.');
      } else {
        const prompt = createPrompt();
        const ans = (await prompt.ask('    Keep Rouge dashboard running at login? [Y/n]: ')).trim().toLowerCase();
        prompt.close();
        install = (ans === '' || ans === 'y' || ans === 'yes');
      }
      if (install) {
        const r = daemon.install();
        if (r.ok) {
          console.log(`    Launch agent installed ✅ (${r.path})`);
        } else {
          console.log(`    ⚠️  ${r.reason}`);
          console.log(`    You can still run the dashboard manually with \`rouge start\`.`);
        }
      } else {
        console.log('    Skipped. Start manually anytime with `rouge start`.');
      }
    } else if (daemonStatus.supported && daemonStatus.installed) {
      console.log('\n  Step 4: Launch agent already installed');
    } else {
      console.log(`\n  Step 4: Background daemon — not yet supported on ${daemonStatus.platform} (Phase 2.5b).`);
      console.log(`          Start manually with \`rouge start\`.`);
    }

    // 5. Summary
    console.log('\n  ' + '-'.repeat(40));
    console.log('  Setup complete! Next step:');
    console.log('');
    console.log('    rouge dashboard         Open the dashboard — create your first project there');
    console.log('');
    console.log('  Optional:');
    console.log('    rouge setup slack       Wire up Slack for notifications (experimental)');
    console.log('');
    return;
  }

  const normalized = integration.toLowerCase();
  const keys = INTEGRATION_KEYS[normalized];
  if (!keys) {
    console.error(`Unknown integration: ${integration}`);
    console.error(`Available: ${Object.keys(INTEGRATION_KEYS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n  Setting up ${normalized} integration`);
  console.log(`  ${'-'.repeat(40)}`);
  console.log(`  Required keys: ${keys.join(', ')}\n`);

  const prompt = createPrompt();

  for (const key of keys) {
    const existing = getSecret(normalized, key);
    const status = existing ? ' (currently set — enter new value or press Enter to keep)' : '';

    const value = await prompt.ask(`  ${key}${status}: `);

    if (value) {
      storeSecret(normalized, key, value);
      console.log(`    Stored ${key}`);
    } else if (existing) {
      console.log(`    Kept existing ${key}`);
    } else {
      console.log(`    Skipped ${key} (not set)`);
    }
  }

  prompt.close();
  console.log(`\n  ${normalized} setup complete.\n`);
}

function cmdSecretsList() {
  console.log('\n  Stored secrets by integration');
  console.log(`  ${'-'.repeat(40)}\n`);

  let totalCount = 0;
  for (const [integration, keys] of Object.entries(INTEGRATION_KEYS)) {
    const stored = [];
    for (const key of keys) {
      const value = getSecret(integration, key);
      if (value) stored.push(key);
    }

    if (stored.length > 0) {
      console.log(`  ${integration}:`);
      for (const key of stored) {
        console.log(`    - ${key}`);
      }
      totalCount += stored.length;
    }
  }

  if (totalCount === 0) {
    console.log('  No secrets stored. Run `rouge setup <integration>` to add some.');
  }
  console.log('');
}

function cmdSecretsCheck(projectDir) {
  if (!projectDir) {
    console.error('Usage: rouge secrets check <project-dir>');
    process.exit(1);
  }

  const resolved = path.resolve(projectDir);
  if (!fs.existsSync(resolved)) {
    console.error(`Directory not found: ${resolved}`);
    process.exit(1);
  }

  const visionPath = path.join(resolved, 'vision.json');
  if (!fs.existsSync(visionPath)) {
    console.error(`No vision.json found in ${resolved}`);
    process.exit(1);
  }

  console.log(`\n  Checking secrets for: ${path.basename(resolved)}`);
  console.log(`  ${'-'.repeat(40)}\n`);

  const integrations = discoverIntegrations(resolved);
  if (integrations.length === 0) {
    console.log('  No integrations detected in vision.json infrastructure section.');
    console.log('');
    return;
  }

  console.log(`  Detected integrations: ${integrations.join(', ')}\n`);

  const { loaded, missing } = loadProjectSecrets(resolved);

  if (loaded.length > 0) {
    console.log('  Found:');
    for (const key of loaded) {
      console.log(`    + ${key}`);
    }
  }

  if (missing.length > 0) {
    console.log('  Missing:');
    for (const key of missing) {
      console.log(`    - ${key}`);
    }
    console.log(`\n  Run \`rouge setup <integration>\` to add missing keys.`);
  }

  if (missing.length === 0) {
    console.log('  All required secrets are configured.');
  }
  console.log('');
}

function cmdSecretsValidate(target) {
  if (target && fs.existsSync(path.resolve(target, 'vision.json'))) {
    // Validate a project's integrations
    const resolved = path.resolve(target);
    console.log(`\n  Validating secrets for: ${path.basename(resolved)}`);
    console.log(`  ${'-'.repeat(40)}\n`);

    const results = validateProjectSecrets(resolved);
    let anyInvalid = false;

    for (const { integration, results: checks } of results) {
      console.log(`  ${integration}:`);
      for (const { key, status, message } of checks) {
        const icon = status === 'valid' ? '+' : status === 'invalid' ? 'x' : '?';
        const detail = message ? ` (${message})` : '';
        console.log(`    ${icon} ${key}: ${status}${detail}`);
        if (status === 'valid') {
          recordValidation(integration, key);
        }
        if (status === 'invalid') anyInvalid = true;
      }
    }

    if (anyInvalid) {
      console.log('\n  Some secrets failed validation. Run `rouge setup <integration>` to update.');
    }
    console.log('');
  } else if (target) {
    // Validate a single integration
    const normalized = target.toLowerCase();
    if (!INTEGRATION_KEYS[normalized]) {
      console.error(`Unknown integration: ${target}`);
      process.exit(1);
    }

    console.log(`\n  Validating ${normalized} secrets`);
    console.log(`  ${'-'.repeat(40)}\n`);

    const results = validateIntegration(normalized);
    for (const { key, status, message } of results) {
      const icon = status === 'valid' ? '+' : status === 'invalid' ? 'x' : '?';
      const detail = message ? ` (${message})` : '';
      console.log(`  ${icon} ${key}: ${status}${detail}`);
      if (status === 'valid') {
        recordValidation(normalized, key);
      }
    }
    console.log('');
  } else {
    console.error('Usage: rouge secrets validate <integration|project-dir>');
    process.exit(1);
  }
}

function cmdSecretsExpiry(action, ...rest) {
  if (action === 'set') {
    const [keyPath, expiresAt] = rest;
    if (!keyPath || !expiresAt) {
      console.error('Usage: rouge secrets expiry set <service/KEY> <YYYY-MM-DD>');
      process.exit(1);
    }
    const [service, key] = keyPath.split('/');
    if (!service || !key) {
      console.error('Key format: service/KEY_NAME (e.g., stripe/STRIPE_SECRET_KEY)');
      process.exit(1);
    }
    setExpiry(service, key, expiresAt);
    console.log(`  Set expiry for ${keyPath}: ${expiresAt}`);
  } else {
    // Default: show expiring secrets
    const days = parseInt(action, 10) || 30;
    const expiring = getExpiringSecrets(days);

    console.log(`\n  Secrets expiring within ${days} days`);
    console.log(`  ${'-'.repeat(40)}\n`);

    if (expiring.length === 0) {
      console.log('  No secrets expiring soon.');
    } else {
      for (const { id, expires_at, days_remaining } of expiring) {
        const label = days_remaining <= 0 ? 'EXPIRED' : `${days_remaining}d remaining`;
        console.log(`  ${days_remaining <= 0 ? 'x' : '!'} ${id}: ${expires_at} (${label})`);
      }
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Project commands
// ---------------------------------------------------------------------------

function cmdInit(name) {
  warnExperimental('init');
  if (!name) {
    console.error('Usage: rouge init <name>');
    process.exit(1);
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(projectPath)) {
    console.error(`Project already exists: ${projectPath}`);
    process.exit(1);
  }

  fs.mkdirSync(projectPath, { recursive: true });
  fs.writeFileSync(path.join(projectPath, '.gitkeep'), '');

  console.log(`\n  Project created: ${name}`);
  console.log(`  Path: ${projectPath}`);
  console.log(`\n  Next: run \`rouge seed ${name} "<what you want to build>"\` to start seeding`);
  console.log(`        or open the dashboard at http://localhost:3000 for interactive seeding.`);
  // Nudge about dashboard if not running
  const ROUGE_HOME = process.env.ROUGE_HOME || path.join(require('os').homedir(), '.rouge');
  const pidFile = path.join(ROUGE_HOME, 'dashboard.pid');
  const dashRunning = (() => { try { const p = JSON.parse(fs.readFileSync(pidFile, 'utf8')); return p.bridge && ((() => { try { process.kill(p.bridge, 0); return true; } catch { return false; } })()); } catch { return false; } })();
  if (!dashRunning) {
    console.log(`  Tip: run \`rouge dashboard start\` for real-time build visibility.\n`);
  } else {
    console.log('');
  }
}

// `rouge seed <name> "<first message>"`
//
// Routes seeding through the detached seed-daemon the dashboard uses
// (docs/plans/2026-04-19-seed-loop-architecture.md). The CLI:
//   1. Appends the human message to seeding-chat.jsonl synchronously
//      (Fix B contract — so any UI tailing sees it immediately).
//   2. Enqueues into seed-queue.jsonl with humanAlreadyPersisted:true.
//   3. Spawns the daemon (only if one isn't already alive).
//   4. Tails seeding-chat.jsonl to stdout, pretty-printed, until the
//      daemon exits (idle or awaiting_gate).
//
// On Ctrl-C the daemon keeps running — it's detached. The user can
// re-run `rouge seed <name> "<reply>"` to continue, or open the
// dashboard. This replaces the pre-seed-loop implementation that
// spawned `claude -p` inline and bypassed the observable architecture.
async function cmdSeed(name, firstMessage) {
  warnExperimental('seed');
  if (!name) {
    console.error('Usage: rouge seed <name> "<first message>"');
    console.error('\nExample: rouge seed calculator "I want to build a notebook-style calculator"');
    process.exit(1);
  }

  // Project-existence check first so `rouge seed ghost-project` still
  // reports the not-found error (the legacy UX the CLI tests pin).
  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    console.error(`Project not found. Run \`rouge init ${name}\` first.`);
    process.exit(1);
  }

  if (!firstMessage || !firstMessage.trim()) {
    console.error('Error: `rouge seed` requires a message.');
    console.error('\nUsage: rouge seed <name> "<first message>"');
    console.error('\nFor an interactive experience, use the dashboard at http://localhost:3000');
    process.exit(1);
  }

  // 1. Append the human message synchronously.
  try {
    appendHumanChatEntry(projectPath, firstMessage.trim());
  } catch (err) {
    console.error(`Failed to append message to chat log: ${err.message || err}`);
    process.exit(1);
  }

  // 2. Enqueue with humanAlreadyPersisted so the daemon doesn't
  //    double-append.
  try {
    enqueueSeedMessage(projectPath, firstMessage.trim());
  } catch (err) {
    console.error(`Failed to enqueue message: ${err.message || err}`);
    process.exit(1);
  }

  // 3. Ensure a daemon is alive. If one already is (someone else
  //    started via the dashboard, or a previous `rouge seed` call
  //    left it running), just skip spawn and tail.
  const alreadyAlive = readAliveSeedPid(projectPath);
  if (alreadyAlive) {
    console.log(`→ Daemon already running (pid ${alreadyAlive}) — your message is in the queue.`);
  } else {
    const spawnResult = spawnSeedDaemon(projectPath);
    if (!spawnResult.ok) {
      console.error(`Failed to spawn seed daemon: ${spawnResult.error}`);
      console.error('Your message is queued but nothing will process it until a daemon starts.');
      console.error('Open the dashboard or retry this command to re-attempt the spawn.');
      process.exit(1);
    }
    console.log(`→ Spawned seed daemon (pid ${spawnResult.pid})`);
  }

  console.log(`→ Tailing seeding-chat.jsonl (Ctrl-C to detach — daemon keeps running)\n`);

  // 4. Tail the chat log until daemon exits or awaiting_gate.
  await tailSeedingChat(projectPath);
}

function genSeedMsgId() {
  return `msg-${Date.now()}-${require('crypto').randomUUID().slice(0, 8)}`;
}

function appendHumanChatEntry(projectPath, text) {
  const chatFile = path.join(projectPath, 'seeding-chat.jsonl');
  // Read current discipline so the chat entry is tagged the same way
  // the dashboard tags HTTP-submitted human messages.
  let discipline = 'brainstorming';
  try {
    const ss = JSON.parse(fs.readFileSync(path.join(projectPath, 'seeding-state.json'), 'utf8'));
    if (ss.current_discipline) discipline = ss.current_discipline;
  } catch {
    /* fall through with default */
  }
  const entry = {
    id: genSeedMsgId(),
    role: 'human',
    content: text,
    timestamp: new Date().toISOString(),
    metadata: { discipline },
  };
  fs.appendFileSync(chatFile, JSON.stringify(entry) + '\n', 'utf8');
}

function enqueueSeedMessage(projectPath, text) {
  const entry = {
    id: genSeedMsgId(),
    text,
    enqueuedAt: new Date().toISOString(),
    humanAlreadyPersisted: true,
  };
  fs.appendFileSync(path.join(projectPath, 'seed-queue.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  return entry.id;
}

function readAliveSeedPid(projectPath) {
  const pidFile = path.join(projectPath, '.seed-pid');
  if (!fs.existsSync(pidFile)) return null;
  try {
    const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    if (typeof info.pid !== 'number') return null;
    try {
      process.kill(info.pid, 0);
      return info.pid;
    } catch {
      // Dead — let the dashboard-side readSeedPid clean it up the
      // next time state-repair runs. We just treat it as absent.
      return null;
    }
  } catch {
    return null;
  }
}

function spawnSeedDaemon(projectPath) {
  // The daemon lives in the dashboard's TypeScript tree and is run
  // via `tsx`. tsx is a dashboard devDependency.
  const tsxCandidates = [
    path.resolve(ROUGE_ROOT, 'dashboard/node_modules/.bin/tsx'),
    path.resolve(ROUGE_ROOT, 'dashboard/ROUGE_STANDALONE/node_modules/.bin/tsx'),
    process.env.ROUGE_TSX_BIN,
  ].filter(Boolean);
  const tsx = tsxCandidates.find((c) => fs.existsSync(c));
  if (!tsx) {
    return {
      ok: false,
      error:
        'tsx binary not found. Install dashboard deps with `cd dashboard && npm install`, or set ROUGE_TSX_BIN.',
    };
  }
  const daemonScript = path.resolve(ROUGE_ROOT, 'dashboard/src/bridge/seed-daemon.ts');
  if (!fs.existsSync(daemonScript)) {
    return { ok: false, error: `seed-daemon.ts not found at ${daemonScript}` };
  }
  const dashboardDir = path.resolve(ROUGE_ROOT, 'dashboard');
  let logFd;
  try {
    logFd = fs.openSync(path.join(projectPath, 'seed-daemon.log'), 'a');
  } catch (err) {
    return { ok: false, error: `failed to open seed-daemon.log: ${err.message || err}` };
  }
  let child;
  try {
    child = spawn(tsx, [daemonScript, projectPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: dashboardDir,
      env: { ...process.env },
    });
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  child.unref();
  if (!child.pid) return { ok: false, error: 'spawn returned no PID' };
  return { ok: true, pid: child.pid };
}

async function tailSeedingChat(projectPath) {
  const chatFile = path.join(projectPath, 'seeding-chat.jsonl');
  const pidFile = path.join(projectPath, '.seed-pid');
  const stateFile = path.join(projectPath, 'seeding-state.json');

  // Start tailing from the current end so the user's just-enqueued
  // human message isn't re-printed below the "Tailing..." line (they
  // already saw their own input on the command line).
  let lastSize = 0;
  try {
    lastSize = fs.statSync(chatFile).size;
  } catch {
    /* file may not exist yet */
  }

  let signalled = false;
  const onSignal = () => {
    signalled = true;
    console.log('\n(Detached — daemon keeps running. Re-run to continue or open the dashboard.)');
  };
  process.on('SIGINT', onSignal);

  try {
    while (!signalled) {
      // Read new chat content.
      try {
        const currentSize = fs.statSync(chatFile).size;
        if (currentSize > lastSize) {
          const fd = fs.openSync(chatFile, 'r');
          const buf = Buffer.alloc(currentSize - lastSize);
          fs.readSync(fd, buf, 0, currentSize - lastSize, lastSize);
          fs.closeSync(fd);
          const content = buf.toString('utf8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              printSeedChatEntry(JSON.parse(line));
            } catch {
              /* skip malformed line */
            }
          }
          lastSize = currentSize;
        }
      } catch {
        /* ignore read errors; chat file may appear/disappear briefly */
      }

      // Check terminal conditions.
      try {
        const ss = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (ss.seeding_complete || ss.status === 'complete') {
          console.log('\n→ Seeding complete! The project is ready to build.');
          console.log(`  Next: \`rouge build ${path.basename(projectPath)}\``);
          break;
        }
        if (ss.mode === 'awaiting_gate' || (ss.pending_gate && ss.pending_gate.discipline)) {
          console.log('\n→ Rouge is waiting for your answer.');
          console.log(`  Re-run: rouge seed ${path.basename(projectPath)} "<your reply>"`);
          break;
        }
      } catch {
        /* state file may be mid-write */
      }

      // Daemon gone? Exit the tail.
      if (!fs.existsSync(pidFile)) {
        console.log('\n→ Daemon idle-exited. Queue drained.');
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
  }
}

function printSeedChatEntry(entry) {
  const role = entry.role;
  const kind = entry.kind;
  let prefix;
  if (role === 'human') {
    prefix = '\n  \x1b[1;36mYou:\x1b[0m';
  } else if (kind === 'system_note') {
    prefix = '\n  \x1b[2;37m[system]\x1b[0m';
  } else if (kind === 'gate_question') {
    prefix = '\n  \x1b[1;33mRouge asks:\x1b[0m';
  } else if (kind === 'autonomous_decision') {
    prefix = '\n  \x1b[1;35mRouge decided:\x1b[0m';
  } else if (kind === 'wrote_artifact') {
    prefix = '\n  \x1b[1;32mRouge wrote:\x1b[0m';
  } else if (kind === 'heartbeat') {
    prefix = '\n  \x1b[2;37mRouge:\x1b[0m';
  } else {
    prefix = '\n  \x1b[1;34mRouge:\x1b[0m';
  }
  const body = (entry.content || '').split('\n').map((l) => '    ' + l).join('\n');
  console.log(prefix);
  console.log(body);
}

function cmdBuild(name) {
  warnExperimental('build');
  const env = { ...process.env };
  if (name) {
    const projectPath = path.join(PROJECTS_DIR, name);
    if (!fs.existsSync(projectPath)) {
      console.error(`Project not found: ${projectPath}`);
      process.exit(1);
    }
    env.ROUGE_PROJECT_FILTER = name;
  }

  console.log('Starting the Karpathy Loop...');

  const loopScript = path.join(__dirname, 'rouge-loop.js');
  const child = spawn('node', [loopScript], {
    stdio: 'inherit',
    env,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

function cmdStatus(name) {
  if (name) {
    const projectPath = path.join(PROJECTS_DIR, name);
    if (!fs.existsSync(projectPath)) {
      console.error(`Project not found: ${projectPath}`);
      process.exit(1);
    }
    printProjectStatus(name, projectPath);
    return;
  }

  // Multi-signal system status first, then all-projects table.
  printSystemStatus();

  // All projects
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log('\n  No projects directory found.\n');
    return;
  }

  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (entries.length === 0) {
    console.log('\n  No projects found.\n');
    return;
  }

  console.log('');
  console.log(`  ${'Project'.padEnd(22)} ${'State'.padEnd(22)} ${'Cycle'.padEnd(8)} Features`);
  console.log(`  ${'-'.repeat(60)}`);

  for (const projectName of entries) {
    printProjectStatus(projectName, path.join(PROJECTS_DIR, projectName));
  }
  console.log('');
}

function printSystemStatus() {
  const daemon = require('./daemon.js');
  const dash = dashboardLiveness();
  const d = daemon.statusSummary();

  console.log('');
  console.log('  System');
  console.log(`  ${'-'.repeat(60)}`);
  if (dash.running) {
    console.log(`  Dashboard:   ✅ running (PID ${dash.pid})   ${DASHBOARD_URL}`);
    if (dash.pids && dash.pids.started_at) {
      console.log(`               started ${dash.pids.started_at}${dash.pids.mode ? `, mode ${dash.pids.mode}` : ''}`);
    }
  } else {
    console.log(`  Dashboard:   ❌ not running   (start: \`rouge start\`)`);
  }
  if (d.supported) {
    const tag = d.installed ? (d.loaded ? '✅ installed & loaded' : '⚠️  installed but not loaded') : '○ not installed';
    console.log(`  Daemon:      ${tag}   (${d.platform})`);
  } else {
    console.log(`  Daemon:      — not yet supported on ${d.platform} (Phase 2.5b)`);
  }
  console.log('');
  console.log('  Projects');
  console.log(`  ${'-'.repeat(60)}`);
}

function cmdStart() {
  // Thin wrapper: delegates to `rouge dashboard start` so there's one code path.
  const child = spawn(process.argv[0], [process.argv[1], 'dashboard', 'start', ...process.argv.slice(3)], {
    stdio: 'inherit', env: process.env,
  });
  child.on('close', (code) => process.exit(code || 0));
}

function cmdStop() {
  const child = spawn(process.argv[0], [process.argv[1], 'dashboard', 'stop'], {
    stdio: 'inherit', env: process.env,
  });
  child.on('close', (code) => process.exit(code || 0));
}

async function cmdUninstall() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');
  const keepProjects = process.argv.includes('--keep-projects');
  const daemon = require('./daemon.js');

  const rougeKeys = Object.keys(INTEGRATION_KEYS).map((k) => `rouge-${k}`).join(', ');
  console.log('\n  This will remove Rouge from your machine:');
  console.log(`    - Stop the dashboard if running`);
  console.log(`    - Unload and remove the launch agent (${daemon.statusSummary().supported ? daemon.platform() : 'n/a'})`);
  console.log(`    - Remove ${ROUGE_HOME}${keepProjects ? ' (but keep projects/)' : ''}`);
  console.log(`    - Delete Rouge's keychain entries (${rougeKeys}).`);
  console.log(`      Your personal keychain entries for these services are NOT touched —`);
  console.log(`      Rouge stores its creds under the \`rouge-*\` prefix only.`);
  console.log(`\n  It will NOT uninstall the \`rouge\` npm package — run`);
  console.log(`  \`npm uninstall -g rouge\` yourself if you installed globally.\n`);

  if (!yes) {
    const prompt = createPrompt();
    const ans = (await prompt.ask('  Type "uninstall" to confirm: ')).trim();
    prompt.close();
    if (ans !== 'uninstall') {
      console.log('  Aborted.\n');
      process.exit(0);
    }
  }

  // 1. Stop dashboard
  const live = dashboardLiveness();
  if (live.running) {
    process.stdout.write('  Stopping dashboard... ');
    try { process.kill(live.pid, 'SIGTERM'); console.log('✅'); } catch (err) { console.log(`⚠️  ${err.message}`); }
  }

  // 2. Remove launch agent
  const d = daemon.uninstall();
  if (d.ok) {
    console.log(`  Launch agent: ${d.removed ? 'removed ✅' : 'nothing to remove'}`);
  } else {
    console.log(`  Launch agent: ⚠️  ${d.reason}`);
  }

  // 3. Delete keychain entries
  let secretCount = 0;
  for (const [integration, keys] of Object.entries(INTEGRATION_KEYS)) {
    for (const key of keys) {
      try {
        if (deleteSecret(integration, key)) secretCount++;
      } catch { /* best-effort */ }
    }
  }
  console.log(`  Keychain:    removed ${secretCount} entr${secretCount === 1 ? 'y' : 'ies'}`);

  // 4. Remove ~/.rouge (or everything except projects/)
  if (fs.existsSync(ROUGE_HOME)) {
    if (keepProjects) {
      const entries = fs.readdirSync(ROUGE_HOME);
      for (const e of entries) {
        if (e === 'projects') continue;
        fs.rmSync(path.join(ROUGE_HOME, e), { recursive: true, force: true });
      }
      console.log(`  ${ROUGE_HOME}: cleared (projects/ preserved)`);
    } else {
      fs.rmSync(ROUGE_HOME, { recursive: true, force: true });
      console.log(`  ${ROUGE_HOME}: removed`);
    }
  }

  console.log('\n  Rouge uninstalled. To remove the CLI itself: `npm uninstall -g rouge`\n');
}

function printProjectStatus(name, projectPath) {
  const statePath = resolveStatePath(projectPath);
  if (!fs.existsSync(statePath)) {
    console.log(`  ${name.padEnd(22)} ${'not seeded'.padEnd(22)}`);
    return;
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const phase = state.phase || state.state || 'unknown';
    const cycle = state.cycle != null ? String(state.cycle) : '-';
    const features = state.features;
    let featureStr = '-';
    if (features && typeof features.total === 'number') {
      const complete = features.complete || 0;
      featureStr = `${complete}/${features.total} complete`;
    }
    console.log(`  ${name.padEnd(22)} ${phase.padEnd(22)} ${cycle.padEnd(8)} ${featureStr}`);
  } catch {
    console.log(`  ${name.padEnd(22)} ${'invalid state.json'.padEnd(22)}`);
  }
}

function cmdCost(name) {
  if (!name) {
    console.error('Usage: rouge cost <name> [--actual]');
    process.exit(1);
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    console.error(`Project not found: ${projectPath}`);
    process.exit(1);
  }

  const costScript = path.join(__dirname, 'estimate-cost.js');
  const costArgs = [costScript, projectPath];
  if (process.argv.includes('--actual')) {
    costArgs.push('--actual');
  }

  const child = spawn('node', costArgs, {
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

// ---------------------------------------------------------------------------
// Slack commands
// ---------------------------------------------------------------------------

function cmdSlackSetup() {
  const guidePath = path.join(ROUGE_ROOT, 'docs', 'slack-setup.md');
  if (fs.existsSync(guidePath)) {
    const content = fs.readFileSync(guidePath, 'utf8');
    console.log(content);
  } else {
    console.log(`
  Slack Setup — Quick Reference
  ${'-'.repeat(40)}

  1. Go to https://api.slack.com/apps > Create New App > From a manifest
  2. Paste the contents of src/slack/manifest.yaml
  3. Install to your workspace
  4. Enable Socket Mode (Settings > Socket Mode) — create app token with connections:write
  5. Copy Bot Token from OAuth & Permissions (xoxb-...)
  6. Enable Incoming Webhooks and add one for your channel
  7. Run: rouge setup slack
  8. Run: rouge slack start

  Full guide: docs/slack-setup.md
`);
  }
}

function cmdSlackStart() {
  warnExperimental('slack start');
  assertControlPlaneAllowed('slack');
  const botToken = getSecret('slack', 'SLACK_BOT_TOKEN');
  const appToken = getSecret('slack', 'SLACK_APP_TOKEN');

  if (!botToken || !appToken) {
    console.error('Missing Slack tokens. Run `rouge setup slack` first.');
    if (!botToken) console.error('  - SLACK_BOT_TOKEN not found');
    if (!appToken) console.error('  - SLACK_APP_TOKEN not found');
    process.exit(1);
  }

  const botScript = path.join(ROUGE_ROOT, 'src', 'slack', 'bot.js');
  if (!fs.existsSync(botScript)) {
    console.error(`Bot script not found: ${botScript}`);
    process.exit(1);
  }

  console.log('Starting Rouge Slack bot...');
  const child = spawn('node', [botScript], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SLACK_BOT_TOKEN: botToken,
      SLACK_APP_TOKEN: appToken,
    },
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

function cmdSlackTest() {
  const webhookUrl = getSecret('slack', 'ROUGE_SLACK_WEBHOOK');
  if (!webhookUrl) {
    console.error('No webhook configured. Run `rouge setup slack` first.');
    process.exit(1);
  }

  if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
    console.error(`Invalid webhook URL (must start with https://hooks.slack.com/).`);
    console.error(`Current value starts with: ${webhookUrl.substring(0, 30)}...`);
    process.exit(1);
  }

  const payload = JSON.stringify({
    text: 'Rouge test message — your webhook is working.',
  });

  const url = new URL(webhookUrl);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('Webhook test successful — check your Slack channel.');
      } else {
        console.error(`Webhook returned status ${res.statusCode}: ${body}`);
        process.exit(1);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`Webhook request failed: ${err.message}`);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

// ---------------------------------------------------------------------------
// Doctor — pre-flight dependency check
// ---------------------------------------------------------------------------

function cmdDoctor() {
  // All check logic lives in ./doctor.js so the dashboard wizard can call it
  // too via /api/system/doctor. Keep output formatting identical.
  const { runDoctor, formatDoctorText } = require('./doctor.js');
  const result = runDoctor({ ROUGE_ROOT, getSecret });

  // JSON output for scripting and the dashboard wizard: `rouge doctor --json`
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.allRequired) process.exit(1);
    return;
  }

  console.log(formatDoctorText(result));
  if (!result.allRequired) process.exit(1);
}


// ---------------------------------------------------------------------------
// Health — cross-project loop-health report
// ---------------------------------------------------------------------------

function cmdHealth() {
  const { buildReport, formatReport } = require('./health-report.js');
  const report = buildReport();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatReport(report));
}


// ---------------------------------------------------------------------------
// Feasibility assessment
// ---------------------------------------------------------------------------

function cmdFeasibility(rawArgs) {
  // Parse --type flag
  let type = 'other';
  const descParts = [];

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--type' && i + 1 < rawArgs.length) {
      type = rawArgs[i + 1];
      i++; // skip next
    } else {
      descParts.push(rawArgs[i]);
    }
  }

  const description = descParts.join(' ').trim();

  if (!description) {
    console.error('Usage: rouge feasibility <description>');
    console.error('       rouge feasibility --type <integration|stack|prompt|evaluation|other> <description>');
    console.error('');
    console.error('Types: integration, stack, prompt, evaluation, other');
    process.exit(1);
  }

  const { assess } = require('./feasibility.js');
  const result = assess({ title: description, description, type });

  // Human-readable output
  const lines = [];
  lines.push('');
  lines.push('  Feasibility Assessment');
  lines.push(`  ${'─'.repeat(35)}`);
  lines.push('');
  lines.push(`  Proposal: ${description}`);
  lines.push(`  Type: ${type}`);
  lines.push('');
  lines.push('  Checks:');

  for (const check of result.checks) {
    let icon;
    if (check.status === 'pass') icon = '✓';
    else if (check.status === 'fail') icon = '✗';
    else icon = '!';

    const name = check.name.charAt(0).toUpperCase() + check.name.slice(1);
    lines.push(`    ${icon} ${name} — ${check.detail}`);
  }

  lines.push('');
  const verdictLabel = result.verdict.toUpperCase().replace(/-/g, ' ');
  lines.push(`  Verdict: ${verdictLabel}`);

  if (result.missing.length > 0) {
    lines.push('');
    lines.push(`  Missing: ${result.missing.join(', ')}`);
  }

  if (result.reasoning) {
    lines.push(`  Reasoning: ${result.reasoning}`);
  }

  lines.push('');
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Eval calibration (P1.18)
// ---------------------------------------------------------------------------

function cmdEvalCalibrate(rawArgs) {
  // Parse flags.
  let goldSetDir = null;
  let modelLabelsPath = null;
  let minKappa = null;
  let minEntries = null;
  let verbose = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--gold-set' && i + 1 < rawArgs.length) {
      goldSetDir = rawArgs[++i];
    } else if (a === '--model-labels' && i + 1 < rawArgs.length) {
      modelLabelsPath = rawArgs[++i];
    } else if (a === '--min-kappa' && i + 1 < rawArgs.length) {
      const n = Number(rawArgs[++i]);
      if (Number.isNaN(n)) {
        console.error('--min-kappa expects a number');
        process.exit(2);
      }
      minKappa = n;
    } else if (a === '--min-entries' && i + 1 < rawArgs.length) {
      const n = Number(rawArgs[++i]);
      if (!Number.isInteger(n) || n < 1) {
        console.error('--min-entries expects a positive integer');
        process.exit(2);
      }
      minEntries = n;
    } else if (a === '--verbose' || a === '-v') {
      verbose = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: rouge eval-calibrate [flags]

Gate prompt changes to the judgment layer by computing quadratic-weighted
Cohen's Kappa between human-labeled gold entries and model-produced labels
for the same cycles. If every rubric dimension meets the minimum Kappa
threshold AND enough entries exist, exits 0 (passed). Otherwise exits 1
(failed) or 2 (insufficient data).

Flags:
  --gold-set <dir>        Directory of gold-set entries (default: library/gold-sets/product-eval)
  --model-labels <file>   JSON file mapping gold-entry-id → {labels, verdict}
  --min-kappa <float>     Minimum per-dimension Kappa (default from rouge.config.json eval_calibration.min_kappa, else 0.75)
  --min-entries <int>     Minimum paired entries (default from rouge.config.json eval_calibration.min_entries, else 20)
  --verbose, -v           Print per-entry details and matrix diagnostics

Exit codes:
  0 — calibration passed
  1 — calibration failed (one or more dimensions below threshold, or dimension collapsed)
  2 — insufficient data (fewer paired entries than min_entries) or usage error
`);
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error('Run `rouge eval-calibrate --help` for usage.');
      process.exit(2);
    }
  }

  // Resolve defaults.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const config = readRougeConfig();
  const calConfig = (config && config.eval_calibration) || {};
  if (goldSetDir == null) {
    goldSetDir = path.join(repoRoot, 'library', 'gold-sets', 'product-eval');
  } else if (!path.isAbsolute(goldSetDir)) {
    goldSetDir = path.resolve(process.cwd(), goldSetDir);
  }
  if (modelLabelsPath && !path.isAbsolute(modelLabelsPath)) {
    modelLabelsPath = path.resolve(process.cwd(), modelLabelsPath);
  }
  if (minKappa == null) minKappa = calConfig.min_kappa ?? 0.75;
  if (minEntries == null) minEntries = calConfig.min_entries ?? 20;

  const {
    loadGoldSet,
    pairEntries,
    evaluateCalibration,
    RUBRIC_DIMENSIONS,
  } = require('./gold-set-calibrator.js');

  // Load gold set.
  const gold = loadGoldSet(goldSetDir);
  console.log('');
  console.log('  Eval Calibration');
  console.log(`  ${'─'.repeat(35)}`);
  console.log('');
  console.log(`  Gold set: ${goldSetDir}`);
  if (gold.reason) {
    console.log(`  Status:   ${gold.reason}`);
  }
  console.log(`  Entries:  ${gold.entries.length}`);
  if (gold.errors.length > 0) {
    console.log(`  Errors:   ${gold.errors.length}`);
    for (const err of gold.errors) {
      console.log(`    - ${err.file}: ${err.reason}`);
    }
  }

  // Load model labels.
  let modelLabels = {};
  if (modelLabelsPath) {
    if (!fs.existsSync(modelLabelsPath)) {
      console.error(`\n  Model labels file not found: ${modelLabelsPath}`);
      process.exit(2);
    }
    try {
      modelLabels = JSON.parse(fs.readFileSync(modelLabelsPath, 'utf8'));
    } catch (err) {
      console.error(`\n  Invalid JSON in model labels: ${err.message}`);
      process.exit(2);
    }
    if (!modelLabels || typeof modelLabels !== 'object' || Array.isArray(modelLabels)) {
      console.error('\n  Model labels must be a JSON object mapping entry-id → {labels, verdict}');
      process.exit(2);
    }
  }

  console.log(`  Model labels: ${modelLabelsPath || '<none>'}`);
  console.log(`  Thresholds:   min_kappa=${minKappa}, min_entries=${minEntries}`);
  console.log('');

  // Pair.
  const { paired, unmatchedGold, unmatchedModel } = pairEntries(gold.entries, modelLabels);
  if (unmatchedGold.length > 0 || unmatchedModel.length > 0) {
    console.log('  Pairing:');
    console.log(`    Paired:          ${paired.length}`);
    console.log(`    Gold w/o model:  ${unmatchedGold.length}`);
    console.log(`    Model w/o gold:  ${unmatchedModel.length}`);
    if (verbose) {
      if (unmatchedGold.length > 0) console.log(`      gold-only IDs: ${unmatchedGold.join(', ')}`);
      if (unmatchedModel.length > 0) console.log(`      model-only IDs: ${unmatchedModel.join(', ')}`);
    }
    console.log('');
  }

  // Evaluate.
  const result = evaluateCalibration(paired, { minKappa, minEntries });

  if (result.insufficientData) {
    console.log(`  Verdict:  INSUFFICIENT DATA — ${result.reason}`);
    console.log('');
    if (gold.entries.length >= minEntries && paired.length < minEntries) {
      console.log(`  Gold set has ${gold.entries.length} entries (≥ ${minEntries}).`);
      console.log('  Supply --model-labels <file>. Shape: JSON object keyed by');
      console.log('  gold-entry id, each value {labels: {...dim:score}, verdict: "..."}.');
      console.log('  Typical source: run 02e-evaluation against each fixture\'s');
      console.log('  cycle_context_excerpt and extract evaluation_report.po.rubric_scores.');
    } else {
      console.log('  Regenerate the default synthetic gold set with `rouge eval-seed-gold`,');
      console.log('  or hand-author additional entries per library/gold-sets/product-eval/README.md.');
    }
    console.log('');
    process.exit(2);
  }

  // Per-dimension table.
  console.log('  Per-dimension Kappa:');
  for (const dim of RUBRIC_DIMENSIONS) {
    const r = result.perDimension[dim];
    const label = dim.padEnd(24);
    if (r.kappa === null) {
      console.log(`    ✗ ${label} COLLAPSED (${r.reason})`);
    } else {
      const icon = r.kappa >= minKappa ? '✓' : '✗';
      console.log(`    ${icon} ${label} κ = ${r.kappa.toFixed(4)}  (n=${r.n})`);
      if (verbose && r.rowSums && r.colSums) {
        console.log(`        rowSums=${JSON.stringify(r.rowSums)}  colSums=${JSON.stringify(r.colSums)}`);
      }
    }
  }

  console.log('');
  const va = result.verdictAgreement;
  if (va.agreement !== null) {
    console.log(`  Verdict agreement: ${(va.agreement * 100).toFixed(1)}% (${va.matches}/${va.n})`);
  } else {
    console.log('  Verdict agreement: n/a');
  }

  console.log('');
  console.log(`  Verdict: ${result.passed ? 'PASSED' : 'FAILED'}`);
  if (!result.passed) {
    if (result.failedDimensions.length > 0) {
      for (const f of result.failedDimensions) {
        console.log(`    - ${f.dim} κ=${f.kappa.toFixed(4)} < ${minKappa}`);
      }
    }
    if (result.collapsedDimensions.length > 0) {
      for (const c of result.collapsedDimensions) {
        console.log(`    - ${c.dim} collapsed (${c.reason})`);
      }
    }
  }
  console.log('');

  process.exit(result.passed ? 0 : 1);
}

function cmdEvalSeedGold(rawArgs) {
  let goldSetDir = null;
  let dryRun = false;
  let force = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--gold-set' && i + 1 < rawArgs.length) {
      goldSetDir = rawArgs[++i];
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: rouge eval-seed-gold [flags]

Regenerate the synthetic gold set for product-quality evaluation.
Produces 20 deterministic fixtures whose cycle_context_excerpt fields
carry signals that map to the target rubric scores. Ground truth is
encoded in generator rules, not human labor.

By default, refuses to clobber any entry whose labeler is not
'synthetic-v1' — so hand-authored / cross-model / human-labeled entries
are preserved. Pass --force to override.

Flags:
  --gold-set <dir>        Target directory (default: library/gold-sets/product-eval)
  --dry-run               Show what would be written without writing
  --force                 Clobber non-synthetic entries too (use with care)
`);
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error('Run `rouge eval-seed-gold --help` for usage.');
      process.exit(2);
    }
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  if (goldSetDir == null) {
    goldSetDir = path.join(repoRoot, 'library', 'gold-sets', 'product-eval');
  } else if (!path.isAbsolute(goldSetDir)) {
    goldSetDir = path.resolve(process.cwd(), goldSetDir);
  }

  const { generateDefaultSet, writeEntries } = require('./gold-set-synth.js');
  const set = generateDefaultSet();
  const r = writeEntries(set, goldSetDir, { overwriteNonSynthetic: force, dryRun });

  console.log('');
  console.log('  Eval Seed Gold');
  console.log(`  ${'─'.repeat(35)}`);
  console.log('');
  console.log(`  Target:  ${goldSetDir}`);
  console.log(`  Plan:    ${set.length} deterministic synthetic entries`);
  console.log(`  Mode:    ${dryRun ? 'dry-run (no files written)' : force ? 'overwrite-all' : 'preserve-non-synthetic'}`);
  console.log('');
  if (r.written.length > 0) {
    console.log(`  Wrote ${r.written.length} file(s).`);
  }
  if (r.skipped.length > 0) {
    console.log(`  Would write ${r.skipped.length} file(s) (dry-run).`);
  }
  if (r.refused.length > 0) {
    console.log(`  Refused ${r.refused.length} file(s) (preserved non-synthetic entries):`);
    for (const x of r.refused) {
      console.log(`    - ${path.basename(x.file)}: ${x.reason}`);
    }
    console.log('');
    console.log('  Pass --force to overwrite.');
  }
  console.log('');

  // Exit non-zero if anything was refused AND not in dry-run mode, so CI
  // knows the seeder didn't fully succeed.
  if (r.refused.length > 0 && !dryRun) process.exit(1);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// SIZING sub-phase driver (P1.5R PR 3)
// ---------------------------------------------------------------------------

function cmdSizeProject(rawArgs) {
  let projectDir = null;
  let overrideTier = null;
  let overrideReasoning = null;
  let jsonOnly = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--project-dir' && i + 1 < rawArgs.length) {
      projectDir = rawArgs[++i];
    } else if (a === '--override' && i + 1 < rawArgs.length) {
      overrideTier = rawArgs[++i];
    } else if (a === '--reasoning' && i + 1 < rawArgs.length) {
      overrideReasoning = rawArgs[++i];
    } else if (a === '--json') {
      jsonOnly = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: rouge size-project [flags]

SIZING sub-phase driver. Reads <project-dir>/seed_spec/brainstorming.md,
parses the "## Classifier Signals" block, runs project-sizer.js, writes
<project-dir>/seed_spec/sizing.json, and prints the sizing artifact.

Run twice: once with no flags (initial classification), once with
--override if the human gate redirects the tier.

Flags:
  --project-dir <dir>    Project root (default: cwd)
  --override <tier>      Apply a human override. Tier ∈ XS|S|M|L|XL.
                         Requires --reasoning.
  --reasoning "<text>"   Why the human picked a different tier.
                         Required when --override is set.
  --json                 Emit ONLY the sizing JSON to stdout (no banner).
                         Useful when piping to another tool.

Exit codes:
  0 — wrote sizing.json
  1 — error (brainstorming.md missing, signals block missing / partial,
      override tier invalid, etc.)
  2 — usage error
`);
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error('Run `rouge size-project --help` for usage.');
      process.exit(2);
    }
  }

  if (projectDir == null) projectDir = process.cwd();
  else if (!path.isAbsolute(projectDir)) projectDir = path.resolve(process.cwd(), projectDir);

  if (overrideTier != null && !overrideReasoning) {
    console.error('--override requires --reasoning');
    process.exit(2);
  }
  if (overrideReasoning != null && !overrideTier) {
    console.error('--reasoning requires --override');
    process.exit(2);
  }

  const seedSpecDir = path.join(projectDir, 'seed_spec');
  const brainstormPath = path.join(seedSpecDir, 'brainstorming.md');
  const sizingPath = path.join(seedSpecDir, 'sizing.json');

  const {
    parseClassifierSignals,
    classify,
    applyHumanOverride,
    TIERS,
  } = require('./project-sizer.js');

  // Override path: read existing sizing.json, apply override, write back.
  if (overrideTier) {
    if (!TIERS.includes(overrideTier)) {
      console.error(`--override must be one of ${TIERS.join('|')}; got ${overrideTier}`);
      process.exit(2);
    }
    if (!fs.existsSync(sizingPath)) {
      console.error(`No existing sizing.json at ${sizingPath}; run without --override first.`);
      process.exit(1);
    }
    let prior;
    try {
      prior = JSON.parse(fs.readFileSync(sizingPath, 'utf8'));
    } catch (err) {
      console.error(`Invalid JSON in ${sizingPath}: ${err.message}`);
      process.exit(1);
    }
    const overridden = applyHumanOverride(prior, overrideTier, overrideReasoning);
    fs.writeFileSync(sizingPath, JSON.stringify(overridden, null, 2) + '\n');
    if (jsonOnly) {
      process.stdout.write(JSON.stringify(overridden, null, 2) + '\n');
    } else {
      printSizingReport(overridden, sizingPath, 'override-applied');
    }
    process.exit(0);
  }

  // Initial classification path.
  if (!fs.existsSync(brainstormPath)) {
    console.error(`Not found: ${brainstormPath}`);
    console.error('Run the BRAINSTORMING discipline first.');
    process.exit(1);
  }

  const brainstormText = fs.readFileSync(brainstormPath, 'utf8');
  const parsed = parseClassifierSignals(brainstormText);
  if (parsed == null) {
    console.error(`No "## Classifier Signals" block found in ${brainstormPath}.`);
    console.error('The BRAINSTORMING discipline must emit this block — see src/prompts/seeding/01-brainstorming.md.');
    process.exit(1);
  }
  if (parsed.partial) {
    console.error(`Incomplete signals in ${brainstormPath}. Missing: ${parsed.missing.join(', ')}.`);
    console.error('Re-run BRAINSTORMING or hand-edit brainstorming.md to include every signal.');
    process.exit(1);
  }

  let artifact;
  try {
    artifact = classify(parsed.signals);
  } catch (err) {
    console.error(`Classification failed: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(seedSpecDir)) fs.mkdirSync(seedSpecDir, { recursive: true });
  fs.writeFileSync(sizingPath, JSON.stringify(artifact, null, 2) + '\n');

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
  } else {
    printSizingReport(artifact, sizingPath, 'classifier');
  }
  process.exit(0);
}

/**
 * P5.9 PoC harness probe — single live round-trip against the
 * Anthropic API to validate the SDK adapter wires up correctly.
 *
 * Sends a tiny structured-output prompt: "given this fake cycle
 * context, emit a final_review_report-shaped payload." Costs ~$0.01
 * one-time. Verifies prompt-caching markers + structured-output
 * extraction work end-to-end.
 *
 * Usage: rouge harness probe [--model <id>] [--no-cache]
 */
async function cmdHarnessProbe(rawArgs) {
  let model = 'claude-haiku-4-5-20251001';
  let cache = true;
  let timeoutMs = 60_000;
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--model' && i + 1 < rawArgs.length) model = rawArgs[++i];
    else if (a === '--no-cache') cache = false;
    else if (a === '--timeout' && i + 1 < rawArgs.length) {
      const v = parseInt(rawArgs[++i], 10);
      if (!Number.isFinite(v) || v < 1000) {
        console.error('--timeout must be a millisecond integer ≥ 1000');
        process.exit(1);
      }
      timeoutMs = v;
    }
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: rouge harness probe [--model <id>] [--no-cache] [--timeout <ms>]

P5.9 PoC: round-trip against the Anthropic SDK to validate the harness
adapter. Sends a tiny structured-output prompt and prints the result +
usage tokens (input / output / cache_creation / cache_read). Cost ~$0.01.

Requires ANTHROPIC_API_KEY in environment.

Flags:
  --model <id>    Override the model (default: claude-haiku-4-5-20251001)
  --no-cache      Disable cache_control on the system block (for comparison)
  --timeout <ms>  Abort the request after N milliseconds (default: 60000)
                  Bounds the cost of a hung connection.
  --help, -h      Show this help

Exit codes:
  0  Success — round-trip completed and structured output parsed
  1  Adapter / network / API error / timeout
  2  Missing ANTHROPIC_API_KEY
`);
      process.exit(0);
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set in environment.');
    console.error('Set it (e.g. `export ANTHROPIC_API_KEY=sk-ant-...`) and re-run.');
    process.exit(2);
  }

  const { runPhaseViaSdk } = require('./harness/sdk-adapter.js');

  const SYSTEM = [
    'You are a Rouge Final Review evaluator.',
    'Your job is to read a synthetic cycle context and emit a structured',
    'final_review_report payload via the emit_final_review_report tool.',
    'Be terse. Confidence between 0 and 1. Recommendation must be one',
    'of "ship", "refine", "major-rework".',
    '',
    '(This is a probe call for the P5.9 harness PoC — synthetic input,',
    'no real product is being evaluated.)',
  ].join('\n');

  const PROMPT = [
    'Cycle context (synthetic):',
    '- Product: a 5-page calculator web app',
    '- Lighthouse: performance 92, a11y 100, best-practices 96',
    '- QA: 12/12 acceptance criteria pass',
    '- Polish gaps observed: instant tab transition (no animation), no favicon',
    '- Delight moments: smooth keyboard input, focus ring on every button',
    '- No console errors, no broken links',
    '',
    'Emit emit_final_review_report.',
  ].join('\n');

  const SCHEMA = {
    type: 'object',
    properties: {
      production_ready: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      recommendation: { type: 'string', enum: ['ship', 'refine', 'major-rework'] },
      polish_gaps: { type: 'array', items: { type: 'string' } },
      delight_moments: { type: 'array', items: { type: 'string' } },
      overall_impression: { type: 'string' },
    },
    required: ['production_ready', 'confidence', 'recommendation', 'overall_impression'],
  };

  console.log(`[harness:probe] model=${model} cache=${cache} timeout=${timeoutMs}ms`);
  console.log(`[harness:probe] sending request...`);

  let out;
  try {
    out = await runPhaseViaSdk({
      prompt: PROMPT,
      system: SYSTEM,
      cache,
      model,
      maxTokens: 2048,
      schema: SCHEMA,
      toolName: 'emit_final_review_report',
      toolDescription: 'Emit the final_review_report for the synthetic cycle context.',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
      console.error(`[harness:probe] FAILED: request timed out after ${timeoutMs}ms`);
      console.error('  Increase --timeout if the model response is genuinely slow, or check network.');
    } else {
      console.error(`[harness:probe] FAILED: ${err.message}`);
      if (err.status) console.error(`  HTTP status: ${err.status}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('[harness:probe] structured result:');
  console.log(JSON.stringify(out.result, null, 2));
  console.log('');
  console.log('[harness:probe] usage:');
  console.log(`  input_tokens:                ${out.usage.input_tokens ?? '?'}`);
  console.log(`  output_tokens:               ${out.usage.output_tokens ?? '?'}`);
  console.log(`  cache_creation_input_tokens: ${out.usage.cache_creation_input_tokens ?? 0}`);
  console.log(`  cache_read_input_tokens:     ${out.usage.cache_read_input_tokens ?? 0}`);
  console.log('');
  if ((out.usage.cache_creation_input_tokens ?? 0) > 0) {
    console.log('[harness:probe] ✓ Cache breakpoint set — first call paid the create cost.');
    console.log('  Run again within ~5min to see cache_read_input_tokens > 0 on the second call.');
  } else if ((out.usage.cache_read_input_tokens ?? 0) > 0) {
    console.log('[harness:probe] ✓ Cache HIT — read from server-side cache (cheaper).');
  }
  console.log('[harness:probe] ✓ Round-trip succeeded — adapter is wired correctly.');
  process.exit(0);
}

function printSizingReport(artifact, filePath, mode) {
  const lines = [];
  lines.push('');
  lines.push('  Project Size Classification');
  lines.push(`  ${'─'.repeat(35)}`);
  lines.push('');
  lines.push(`  Tier:        ${artifact.project_size}`);
  lines.push(`  Decided by:  ${artifact.decided_by}`);
  if (artifact.human_override) {
    lines.push(`  Classifier would have picked: ${artifact.human_override.classifier_would_pick}`);
    lines.push(`  Human reasoning: ${artifact.human_override.human_reasoning}`);
  }
  lines.push('');
  lines.push('  Signals:');
  for (const [k, v] of Object.entries(artifact.signals)) {
    lines.push(`    ${k.padEnd(20)} ${v}`);
  }
  lines.push('');
  lines.push(`  Reasoning: ${artifact.reasoning}`);
  lines.push('');
  lines.push(`  Written to: ${filePath}`);
  lines.push(`  Mode: ${mode}`);
  lines.push('');
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// CLI router
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

if (command === 'doctor') {
  cmdDoctor();
} else if (command === 'init') {
  cmdInit(args[1]);
} else if (command === 'seed') {
  // args[1] = project slug, args[2..] = first message (joined so unquoted
  // multi-word messages still work: `rouge seed foo hello there`)
  cmdSeed(args[1], args.slice(2).join(' ')).catch((err) => {
    console.error('[rouge seed] fatal:', err?.stack || err);
    process.exit(1);
  });
} else if (command === 'build') {
  cmdBuild(args[1]);
} else if (command === 'status') {
  cmdStatus(args[1]);
} else if (command === 'start') {
  cmdStart();
} else if (command === 'stop') {
  cmdStop();
} else if (command === 'uninstall') {
  cmdUninstall().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (command === 'cost') {
  cmdCost(args[1]);
} else if (command === 'health') {
  cmdHealth();
} else if (command === 'setup') {
  cmdSetup(args[1]).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (command === 'slack') {
  const subcommand = args[1];
  if (subcommand === 'setup') {
    cmdSlackSetup();
  } else if (subcommand === 'start') {
    cmdSlackStart();
  } else if (subcommand === 'test') {
    cmdSlackTest();
  } else {
    console.error('Usage: rouge slack <setup|start|test>');
    console.error('  rouge slack setup    Print Slack setup guide');
    console.error('  rouge slack start    Start the Slack bot');
    console.error('  rouge slack test     Send a test webhook message');
    process.exit(1);
  }
} else if (command === 'feasibility') {
  cmdFeasibility(args.slice(1));
} else if (command === 'contribute') {
  const contributePath = args[1];
  if (!contributePath) {
    console.error('Usage: rouge contribute <path-to-draft-yaml>');
    console.error('');
    console.error('Contribute a draft integration pattern back to Rouge\'s catalogue via PR.');
    console.error('');
    console.error('Example:');
    console.error('  rouge contribute library/integrations/drafts/mapbox-geocoding.yaml');
    process.exit(1);
  }
  // Delegate to contribute-pattern module
  const { contribute } = require('./contribute-pattern.js');
  const dryRun = args.includes('--dry-run');
  const productIdx = args.indexOf('--product');
  const product = productIdx >= 0 ? args[productIdx + 1] : undefined;
  const result = contribute(contributePath, { dryRun, product });
  if (!result.success) {
    console.error('\n  Contribution failed:');
    for (const err of result.errors || []) {
      console.error(`    - ${err}`);
    }
    console.error('');
    process.exit(1);
  }
  if (dryRun) {
    console.log('\n  Dry run — no changes made:');
    console.log(`    Action: ${result.action}`);
    console.log(`    Branch: ${result.branch}`);
    console.log(`    Destination: ${result.destination}`);
    console.log(`    Commit: ${result.commitMsg}`);
    console.log('');
  } else {
    console.log(`\n  Contributed: ${contributePath}`);
    console.log(`    Action: ${result.action}`);
    console.log(`    Branch: ${result.branch}`);
    console.log(`    Destination: ${result.destination}`);
    if (result.pr) console.log(`    PR: ${result.pr}`);
    console.log('');
  }
} else if (command === 'dashboard') {
  // Flags aren't subcommands — `rouge dashboard --no-open` means "foreground
  // with --no-open," not "unknown subcommand --no-open."
  const subcommand = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
  const dashboardDir = path.join(__dirname, '..', '..', 'dashboard');
  const standaloneServer = path.join(dashboardDir, 'dist', 'server.js');
  const standaloneMarker = path.join(dashboardDir, 'dist', 'ROUGE_STANDALONE');
  // ROUGE_HOME, PID_FILE, DASHBOARD_PORT, DASHBOARD_URL now at module scope.

  if (!fs.existsSync(dashboardDir)) {
    console.error('Dashboard not found at', dashboardDir);
    console.error('The dashboard should be at The-Rouge/dashboard/. Run `rouge setup` for first-time setup.');
    process.exit(1);
  }

  // Prebuilt tarball installs: .next/standalone/ is shipped by `prepack`.
  // Source checkouts: no standalone, use `next dev` via the dashboard deps.
  const hasPrebuilt = fs.existsSync(standaloneServer) && fs.existsSync(standaloneMarker);
  const hasDevDeps = fs.existsSync(path.join(dashboardDir, 'node_modules', 'next'));

  const readPids = readDashboardPids;
  function writePids(pids) {
    if (!fs.existsSync(ROUGE_HOME)) fs.mkdirSync(ROUGE_HOME, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2) + '\n');
  }
  function clearPids() {
    try { fs.unlinkSync(PID_FILE); } catch {}
  }
  const isRunning = isPidRunning;
  function openBrowser(url) {
    // Cross-platform URL open. Best effort — swallow failures (headless
    // boxes, CI, users who've disabled the default handler).
    const opener =
      process.platform === 'darwin' ? { cmd: 'open', args: [url] } :
      process.platform === 'win32'  ? { cmd: 'cmd',  args: ['/c', 'start', '""', url] } :
                                      { cmd: 'xdg-open', args: [url] };
    try {
      const child = spawn(opener.cmd, opener.args, { stdio: 'ignore', detached: true });
      child.unref();
    } catch {
      // ignore — user can copy/paste the URL
    }
  }
  function spawnDashboard({ detached, stdio, logFd }) {
    // Forward projects root / cli path so Next route handlers can resolve
    // them without a rouge-dashboard.config.json sitting alongside the
    // standalone server (which won't exist in tarball installs).
    const env = {
      ...process.env,
      PORT: String(DASHBOARD_PORT),
      HOSTNAME: '127.0.0.1',
      ROUGE_PROJECTS_DIR: process.env.ROUGE_PROJECTS_DIR || PROJECTS_DIR,
      ROUGE_CLI: process.env.ROUGE_CLI || process.argv[1],
    };

    if (hasPrebuilt) {
      // Standalone server.js is self-contained — node runs it directly,
      // no `next` CLI, no dev compile. ~2s cold start vs 30-60s for
      // `next dev`. This is the default path for npm global installs.
      return spawn(process.argv[0], [standaloneServer], {
        cwd: path.dirname(standaloneServer),
        detached,
        stdio: stdio === 'log' ? ['ignore', logFd, logFd] : stdio,
        env,
      });
    }
    // Source checkout fallback: `next dev` inside the dashboard package.
    return spawn('npx', ['next', 'dev', '-p', String(DASHBOARD_PORT)], {
      cwd: dashboardDir,
      detached,
      stdio: stdio === 'log' ? ['ignore', logFd, logFd] : stdio,
      env,
    });
  }

  if (subcommand === 'install') {
    console.log('Installing dashboard dependencies...');
    execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
    console.log('Dashboard installed. Run `rouge dashboard` to start.');

  } else if (subcommand === 'start' || subcommand === 'up') {
    assertControlPlaneAllowed('frontend');
    const existing = readPids();
    if (existing && existing.pid && isRunning(existing.pid)) {
      console.log(`Dashboard already running (PID ${existing.pid}).`);
      console.log(`  Open:      ${DASHBOARD_URL}`);
      console.log(`  Stop:      rouge dashboard stop`);
      process.exit(0);
    }

    // Port discipline: fail loud if something else holds the port. Binding
    // only one address family silently (IPv4 while another app has IPv6,
    // or vice versa) leaves the browser to pick by DNS resolution order —
    // confusing when `http://localhost:PORT` reaches the other app.
    const blocker = findPortListener(DASHBOARD_PORT);
    if (blocker) {
      console.error(`\n  ❌ Port ${DASHBOARD_PORT} is already in use by PID ${blocker.pid} (${blocker.cmd}).`);
      console.error(`     Either stop that process, or run Rouge on a different port:`);
      console.error(`       ROUGE_DASHBOARD_PORT=3101 rouge dashboard start\n`);
      process.exit(1);
    }

    if (!hasPrebuilt && !hasDevDeps) {
      console.log('Dashboard dependencies not installed. Installing...');
      execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
    }

    console.log(`Starting dashboard in background (${hasPrebuilt ? 'prebuilt' : 'dev mode'})...`);
    const logDir = path.join(ROUGE_HOME, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFd = fs.openSync(path.join(logDir, 'dashboard.log'), 'a');

    const child = spawnDashboard({ detached: true, stdio: 'log', logFd });
    child.unref();
    writePids({ pid: child.pid, started_at: new Date().toISOString(), mode: hasPrebuilt ? 'prebuilt' : 'dev' });

    console.log(`  PID:       ${child.pid}`);
    console.log(`  URL:       ${DASHBOARD_URL}`);
    console.log(`  Log:       ${path.join(logDir, 'dashboard.log')}`);
    console.log(`  Stop:      rouge dashboard stop`);
    console.log(`  Status:    rouge dashboard status`);

    // Give the server a moment to bind the port before opening the browser,
    // otherwise the OS handler races with Next and shows a connection error.
    const noOpen = args.includes('--no-open');
    if (!noOpen) {
      setTimeout(() => openBrowser(DASHBOARD_URL), hasPrebuilt ? 1500 : 4000);
    }

  } else if (subcommand === 'stop' || subcommand === 'down') {
    const pids = readPids();
    if (!pids) {
      console.log('Dashboard is not running (no PID file).');
      process.exit(0);
    }
    // Support both the new single-PID schema and the legacy {bridge, frontend} schema
    // so a `rouge dashboard stop` still cleans up after an upgrade.
    const candidates = pids.pid ? [pids.pid] : [pids.bridge, pids.frontend].filter(Boolean);
    let stopped = 0;
    for (const pid of candidates) {
      if (isRunning(pid)) {
        try { process.kill(pid, 'SIGTERM'); stopped++; } catch {}
      }
    }
    clearPids();
    console.log(stopped > 0 ? `Dashboard stopped (${stopped} process${stopped > 1 ? 'es' : ''}).` : 'Dashboard was not running.');

  } else if (subcommand === 'status') {
    const pids = readPids();
    if (!pids) {
      console.log('Dashboard is not running.');
      process.exit(1);
    }
    const pid = pids.pid || pids.bridge; // back-compat
    const up = pid && isRunning(pid);
    console.log(`Dashboard: ${up ? `✅ running (PID ${pid})` : '❌ not running'}`);
    if (pids.mode) console.log(`Mode:      ${pids.mode}`);
    if (pids.started_at) console.log(`Started:   ${pids.started_at}`);
    console.log(`URL:       ${DASHBOARD_URL}`);
    process.exit(up ? 0 : 1);

  } else if (subcommand === 'restart') {
    const pids = readPids();
    if (pids) {
      const candidates = pids.pid ? [pids.pid] : [pids.bridge, pids.frontend].filter(Boolean);
      for (const pid of candidates) {
        if (isRunning(pid)) {
          try { process.kill(pid, 'SIGTERM'); } catch {}
        }
      }
      clearPids();
    }
    const child = spawn(process.argv[0], [process.argv[1], 'dashboard', 'start'], {
      stdio: 'inherit', env: process.env,
    });
    child.on('close', (code) => process.exit(code || 0));

  } else if (!subcommand) {
    assertControlPlaneAllowed('frontend');

    // Daemon-aware redirect: if a background instance is already serving,
    // don't spin up a redundant foreground one. Open the browser and exit.
    // This is the common case when a launch agent is installed.
    const existing = readPids();
    const daemonAlive = existing && existing.pid && isRunning(existing.pid) && isDashboardResponsive();
    if (daemonAlive) {
      console.log(`Dashboard is already running in the background (PID ${existing.pid}).`);
      console.log(`  URL:   ${DASHBOARD_URL}`);
      console.log(`  Stop:  rouge stop`);
      console.log(`  For a fresh foreground instance: rouge stop, then rouge dashboard.\n`);
      const noOpen = args.includes('--no-open');
      if (!noOpen) openBrowser(DASHBOARD_URL);
      process.exit(0);
    }

    // Port discipline — same logic as `dashboard start`.
    const blocker = findPortListener(DASHBOARD_PORT);
    if (blocker) {
      console.error(`\n  ❌ Port ${DASHBOARD_PORT} is already in use by PID ${blocker.pid} (${blocker.cmd}).`);
      console.error(`     Either stop that process, or run Rouge on a different port:`);
      console.error(`       ROUGE_DASHBOARD_PORT=3101 rouge dashboard\n`);
      process.exit(1);
    }

    console.log(`Starting dashboard in foreground (${hasPrebuilt ? 'prebuilt' : 'dev mode'}).`);
    console.log(`  URL:             ${DASHBOARD_URL}`);
    console.log(`  Ctrl+C or closing this terminal stops THIS instance only.`);
    console.log(`  The launch-agent daemon (if installed) is a separate process`);
    console.log(`  and is unaffected. Check with \`rouge status\`.`);
    console.log(`  Background mode: rouge start\n`);

    if (!hasPrebuilt && !hasDevDeps) {
      console.log('Dashboard dependencies not installed. Installing...');
      execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
    }

    const child = spawnDashboard({ detached: false, stdio: 'inherit' });
    const noOpen = args.includes('--no-open');
    if (!noOpen) {
      setTimeout(() => openBrowser(DASHBOARD_URL), hasPrebuilt ? 1500 : 4000);
    }
    child.on('close', (code) => process.exit(code || 0));
    process.on('SIGINT', () => { try { child.kill('SIGTERM'); } catch {} process.exit(0); });
    process.on('SIGTERM', () => { try { child.kill('SIGTERM'); } catch {} process.exit(0); });

  } else {
    console.error(`
  rouge dashboard                 Start in foreground (dev mode)
  rouge dashboard start           Start in background (persistent)
  rouge dashboard stop            Stop background process
  rouge dashboard status          Check if running
  rouge dashboard restart         Stop + start
  rouge dashboard install         Install dependencies (source checkouts)

  Flags:
    --no-open                     Don't auto-open the browser
  Env:
    ROUGE_DASHBOARD_PORT          Override default port 3001
`);
    process.exit(1);
  }
} else if (command === 'improve') {
  const { run } = require('./self-improve.js');
  const maxIdx = args.indexOf('--max-iterations');
  const maxIterations = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) || 1 : 1;
  const explore = args.includes('--explore');
  const dryRun = args.includes('--dry-run');
  run({ maxIterations, explore, dryRun }).catch((err) => {
    console.error(`  Fatal error: ${err.message}`);
    process.exit(1);
  });
} else if (command === 'resume-escalation') {
  // Hand-off flow: user has an open escalation and wants to work
  // through it in a direct Claude Code session. This command:
  //   1. Marks the latest pending escalation as hand-off
  //   2. Prints a `claude -p` invocation primed with the escalation
  //      context (summary, classification, recent build.log tail,
  //      cycle_context excerpt). User runs claude themselves; when
  //      done they press "I've resolved it" in the dashboard.
  //
  // Usage: rouge resume-escalation <project-slug>
  const slug = args[1];
  if (!slug) {
    console.error('Usage: rouge resume-escalation <project-slug>');
    process.exit(1);
  }
  const projectsRoot = process.env.ROUGE_PROJECTS_DIR ||
    path.join(process.env.HOME || '', '.rouge', 'projects');
  const projectDir = path.join(projectsRoot, slug);
  if (!fs.existsSync(projectDir)) {
    console.error(`  Project not found: ${slug}`);
    process.exit(1);
  }

  const stateFile = fs.existsSync(path.join(projectDir, '.rouge', 'state.json'))
    ? path.join(projectDir, '.rouge', 'state.json')
    : path.join(projectDir, 'state.json');
  if (!fs.existsSync(stateFile)) {
    console.error(`  No state.json for ${slug}`);
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const pending = (state.escalations || []).find((e) => e.status === 'pending' && !e.human_response);
  if (!pending) {
    console.error(`  No pending escalation for ${slug}. Nothing to hand off.`);
    process.exit(1);
  }

  // Mark the escalation as handed-off. Launcher picks this up on its
  // next loop tick and parks the project.
  // GC.4 (Phase 5): write through the facade — same shape, but the
  // dashboard now sees a state.write event for this CLI mutation.
  pending.human_response = {
    type: 'hand-off',
    text: 'Handed off to direct Claude Code session',
    submitted_at: new Date().toISOString(),
  };
  const facade = require('./facade.js');
  // Top-level branch is sync; wrap the await in an IIFE that exits
  // before the rest of the branch's user-facing output runs.
  // eslint-disable-next-line no-inner-declarations
  (async () => {
    await facade.writeState({
      projectDir,
      source: 'cli',
      mutator: (s) => {
        // Re-locate and mark the same pending escalation in the freshly
        // read state, so a concurrent dashboard mutation doesn't lose
        // the escalations array.
        const fresh = (s.escalations || []).find((e) => e.id === pending.id);
        if (fresh) fresh.human_response = pending.human_response;
        else if (s.escalations) s.escalations.push(pending);
      },
      eventDetail: { command: 'resume-escalation', escalationId: pending.id },
    });
  })().catch((err) => {
    console.error(`  Failed to mark escalation handed-off: ${err.message}`);
    process.exit(1);
  });

  // Build a primed prompt for Claude Code.
  const logFile = path.join(projectDir, 'build.log');
  let logTail = '';
  if (fs.existsSync(logFile)) {
    try {
      const raw = fs.readFileSync(logFile, 'utf8');
      logTail = raw.split('\n').slice(-80).join('\n');
    } catch { /* ignore */ }
  }

  const ctxFile = path.join(projectDir, 'cycle_context.json');
  let ctxSummary = '';
  if (fs.existsSync(ctxFile)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
      const pick = (k) => (ctx[k] ? `${k}: ${JSON.stringify(ctx[k]).slice(0, 500)}` : '');
      ctxSummary = [
        pick('current_phase'),
        pick('evaluation_report'),
        pick('qa_fix_results'),
        pick('analysis_recommendation'),
      ].filter(Boolean).join('\n\n');
    } catch { /* ignore */ }
  }

  console.log(`
  Hand-off primed for: ${slug}
  Escalation: ${pending.id} (tier ${pending.tier})

  The launcher has marked this escalation as handed-off. It will stay
  parked until you submit "I've resolved it" from the dashboard.

  To work through the problem now:

    cd ${projectDir}
    claude

  When Claude opens, paste this as the first message:

  ---
  You are helping me resolve an escalation in this Rouge project.

  **Escalation**: ${pending.classification || 'general'} (tier ${pending.tier})
  **Summary**: ${pending.summary || '(none)'}
  **Story**: ${pending.story_id || '(none)'}

  **Recent build.log** (last 80 lines):
  \`\`\`
  ${logTail || '(log empty)'}
  \`\`\`

  **Context snapshot**:
  ${ctxSummary || '(cycle_context empty)'}

  Work with me to understand and resolve this. When we're done, make
  a commit so the resolution is on the branch. The Rouge launcher
  will capture the commits and resume the phase with them as context.
  ---

  When you finish: return to the dashboard, click "I've resolved it"
  on the escalation card. The launcher will capture your commits and
  resume.
`);

} else if (command === 'secrets') {
  const subcommand = args[1];
  if (subcommand === 'list') {
    cmdSecretsList();
  } else if (subcommand === 'check') {
    cmdSecretsCheck(args[2]);
  } else if (subcommand === 'validate') {
    cmdSecretsValidate(args[2]);
  } else if (subcommand === 'expiry') {
    cmdSecretsExpiry(args[2], ...args.slice(3));
  } else {
    console.error('Usage: rouge secrets <list|check|validate|expiry>');
    process.exit(1);
  }
} else if (command === 'eval-calibrate') {
  cmdEvalCalibrate(args.slice(1));
} else if (command === 'eval-seed-gold') {
  cmdEvalSeedGold(args.slice(1));
} else if (command === 'size-project') {
  cmdSizeProject(args.slice(1));
} else if (command === 'harness') {
  const subcommand = args[1];
  if (subcommand === 'probe') {
    cmdHarnessProbe(args.slice(2));
  } else {
    console.error('Usage: rouge harness <probe>');
    console.error('  probe — single round-trip against the Anthropic API to validate the SDK adapter (P5.9 PoC).');
    console.error('          Requires ANTHROPIC_API_KEY in env. Sends ~1k input tokens; cost is ~$0.01.');
    process.exit(1);
  }
} else {
  console.log(`
  The Rouge CLI

  The dashboard is the primary control surface. Most users only need the
  commands under SETUP — everything else is power-user / automation territory.

  SETUP & LIFECYCLE
    rouge setup [--yes|--no-daemon] One-time setup (prereqs, deps, projects dir, daemon)
    rouge setup <integration>       Store credentials for an integration
    rouge doctor                    Check prerequisites and dependencies
    rouge dashboard                 Open the dashboard (foreground, auto-opens browser)
    rouge start                     Start the dashboard in the background
    rouge stop                      Stop the dashboard
    rouge status                    Show system + project status
    rouge uninstall                 Remove Rouge files, launch agent, and keychain entries
    rouge dashboard restart         Restart background dashboard
    rouge dashboard install         Install dev deps (source checkouts only)

  ADVANCED / AUTOMATION
    rouge status <name>             Show state for a single project
    rouge cost <name> [--actual]    Show cost estimate or actuals
    rouge health [--json]           Cross-project loop-health report (stuck loops, escalations, self-heal)
    rouge secrets list              List stored secret names
    rouge secrets check <dir>       Check project against stored secrets
    rouge secrets validate <target> Validate keys against API endpoints
    rouge secrets expiry [days]     Show secrets expiring within N days
    rouge secrets expiry set <s/K> <date>  Set expiry for a secret
    rouge feasibility <description> Assess feasibility of a proposed change
    rouge contribute <path>         Contribute a draft integration pattern via PR
    rouge eval-calibrate            Gate: quadratic-weighted Kappa between gold-set labels and model output
                                    --gold-set <dir>, --model-labels <file>, --min-kappa <float>, --verbose
    rouge eval-seed-gold            Regenerate the synthetic gold set (refuses to clobber non-synthetic entries).
                                    --gold-set <dir>, --dry-run, --force
    rouge size-project              SIZING sub-phase driver: parses BRAINSTORM signals, classifies, writes
                                    seed_spec/sizing.json. --project-dir <dir>, --override <XS|S|M|L|XL>,
                                    --reasoning "<text>", --json
    rouge resume-escalation <slug>  Prime a direct Claude Code session for an
                                    escalation hand-off. Parks the project,
                                    prints the claude command + context.
    rouge improve                   Run one self-improvement iteration
    rouge improve --max-iterations 5  Run up to 5 iterations
    rouge improve --explore         Enable exploration when no issues remain
    rouge improve --dry-run         Show what would be done without doing it

  EXPERIMENTAL (no longer the recommended path — use the dashboard instead)
    rouge init <name>               Create a new project directory
    rouge seed <name> "<message>"   Seed a project via the detached daemon; tails chat
    rouge build [name]              Start the Karpathy Loop
    rouge slack setup               Print Slack setup guide
    rouge slack start               Start the Slack bot
    rouge slack test                Send a test webhook message

  Integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}

  Suppress experimental warnings: ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1
`);
}
