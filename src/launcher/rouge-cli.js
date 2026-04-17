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
  console.log(`\n  Next: run \`rouge seed ${name}\` to start the seeding process.`);
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

function cmdSeed(name) {
  warnExperimental('seed');
  if (!name) {
    console.error('Usage: rouge seed <name>');
    process.exit(1);
  }

  const projectPath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectPath)) {
    console.error(`Project not found. Run \`rouge init ${name}\` first.`);
    process.exit(1);
  }

  const promptFile = path.join(ROUGE_ROOT, 'src/prompts/seeding/00-swarm-orchestrator.md');
  if (!fs.existsSync(promptFile)) {
    console.error(`Seeding prompt not found: ${promptFile}`);
    process.exit(1);
  }

  const promptContent = fs.readFileSync(promptFile, 'utf8');
  // Route seeding through the same provider the project will use for build.
  const statePath = resolveStatePath(projectPath);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  const { env: claudeEnv } = buildClaudeEnv({ state });
  const { args: denyArgs } = require('./tool-permissions').buildDenylistArgs();
  const child = spawn('claude', ['-p', '--project', projectPath, ...denyArgs], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: claudeEnv,
  });
  child.stdin.write(promptContent);
  child.stdin.end();

  child.on('close', (code) => {
    process.exit(code || 0);
  });
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
// CLI router
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

if (command === 'doctor') {
  cmdDoctor();
} else if (command === 'init') {
  cmdInit(args[1]);
} else if (command === 'seed') {
  cmdSeed(args[1]);
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
    rouge secrets list              List stored secret names
    rouge secrets check <dir>       Check project against stored secrets
    rouge secrets validate <target> Validate keys against API endpoints
    rouge secrets expiry [days]     Show secrets expiring within N days
    rouge secrets expiry set <s/K> <date>  Set expiry for a secret
    rouge feasibility <description> Assess feasibility of a proposed change
    rouge contribute <path>         Contribute a draft integration pattern via PR
    rouge improve                   Run one self-improvement iteration
    rouge improve --max-iterations 5  Run up to 5 iterations
    rouge improve --explore         Enable exploration when no issues remain
    rouge improve --dry-run         Show what would be done without doing it

  EXPERIMENTAL (no longer the recommended path — use the dashboard instead)
    rouge init <name>               Create a new project directory
    rouge seed <name>                Start interactive seeding via claude -p
    rouge build [name]              Start the Karpathy Loop
    rouge slack setup               Print Slack setup guide
    rouge slack start               Start the Slack bot
    rouge slack test                Send a test webhook message

  Integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}

  Suppress experimental warnings: ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1
`);
}
