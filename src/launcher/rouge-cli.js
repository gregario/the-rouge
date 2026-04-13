#!/usr/bin/env node
/**
 * The Rouge CLI — project management, loop execution, and secrets.
 *
 * Usage:
 *   rouge doctor                     Check prerequisites and dependencies
 *   rouge init <name>                Create a new project directory
 *   rouge seed <name>                Start interactive seeding via claude -p
 *   rouge build [name]               Start the Karpathy Loop
 *   rouge status [name]              Show project state summary
 *   rouge cost <name> [--actual]     Show cost estimate or actuals
 *   rouge setup <integration>        Interactive setup for an integration
 *   rouge slack setup                Print Slack setup guide
 *   rouge slack start                Start the Slack bot
 *   rouge slack test                 Send a test webhook message
 *   rouge secrets list               List all stored secret names
 *   rouge secrets check <project>    Check project against stored secrets
 *   rouge secrets validate <target>  Validate keys against API endpoints
 *   rouge secrets expiry [days]      Show expiring secrets
 *   rouge secrets expiry set <s/K> <date>  Set key expiry date
 *   rouge feasibility <description>  Assess feasibility of a proposed change
 *   rouge contribute <path>           Contribute a draft integration pattern via PR
 *   rouge improve [options]            Run unattended self-improvement loop
 */

const readline = require('readline');
const { execSync, spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

const ROUGE_ROOT = path.resolve(__dirname, '../..');

// Detect if installed globally (npm install -g) vs cloned from source.
// Global: ROUGE_ROOT is inside node_modules — don't store projects there.
// Source: ROUGE_ROOT is the repo — projects/ is the natural home.
function resolveProjectsDir() {
  if (process.env.ROUGE_PROJECTS_DIR) return process.env.ROUGE_PROJECTS_DIR;
  const repoProjects = path.join(ROUGE_ROOT, 'projects');
  if (fs.existsSync(path.join(ROUGE_ROOT, '.git'))) return repoProjects;
  // Global install — use ~/.rouge/projects/
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.rouge', 'projects');
}
const PROJECTS_DIR = resolveProjectsDir();

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
      console.log('\n  Step 2: Installing dashboard dependencies...');
      try {
        execSync('npm install', { cwd: dashboardDir, stdio: 'inherit', timeout: 120000 });
        // Ensure .env.local
        const envFile = path.join(dashboardDir, '.env.local');
        if (!fs.existsSync(envFile)) {
          fs.writeFileSync(envFile, 'NEXT_PUBLIC_BRIDGE_URL=http://localhost:3002\n');
        }
        console.log('  Dashboard installed ✅');
      } catch (err) {
        console.error(`  Dashboard install failed: ${(err.message || '').slice(0, 150)}`);
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

    // 4. Summary
    console.log('\n  ' + '-'.repeat(40));
    console.log('  Setup complete! Next steps:');
    console.log('');
    console.log('    rouge setup slack       Set up Slack control plane (optional)');
    console.log('    rouge dashboard start   Start the dashboard (optional)');
    console.log('    rouge init my-product   Create your first project');
    console.log('    rouge seed my-product   Start interactive design session');
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
  const child = spawn('claude', ['-p', '--project', projectPath], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  child.stdin.write(promptContent);
  child.stdin.end();

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

function cmdBuild(name) {
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

function printProjectStatus(name, projectPath) {
  const statePath = path.join(projectPath, 'state.json');
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
  const blockers = [];
  const warnings = [];
  const lines = [];

  lines.push('');
  lines.push('  Rouge Doctor');
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push('');

  // Helper: run a command and return trimmed stdout, or null on failure
  function tryExec(cmd, timeout = 5000) {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout }).trim();
    } catch {
      return null;
    }
  }

  // --- Node.js version ---
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 18) {
    lines.push(`  \u2705 Node.js ${nodeVersion} (>= 18 required)`);
  } else {
    lines.push(`  \u274C Node.js ${nodeVersion} — requires >= 18 (install: https://nodejs.org/)`);
    blockers.push('Node.js >= 18 required');
  }

  // --- Claude Code CLI ---
  const claudeOut = tryExec('claude --version');
  if (claudeOut) {
    lines.push(`  \u2705 Claude Code CLI installed (${claudeOut})`);
  } else {
    lines.push('  \u274C Claude Code CLI not found (install: npm install -g @anthropic-ai/claude-code)');
    blockers.push('Claude Code CLI not found');
  }

  // --- Git ---
  const gitOut = tryExec('git --version');
  if (gitOut) {
    const gitVersion = gitOut.replace('git version ', '');
    lines.push(`  \u2705 Git installed (${gitVersion})`);
  } else {
    lines.push('  \u274C Git not found (install: https://git-scm.com/)');
    blockers.push('Git not found');
  }

  // --- jq ---
  // Required by rouge-safety-check.sh (the PreToolUse hook). If missing,
  // every Bash/Write/Edit call fails the hook → Claude Code blocks. Without
  // this check the failure mode is "every tool call mysteriously rejected".
  const jqOut = tryExec('jq --version');
  if (jqOut) {
    lines.push(`  \u2705 jq installed (${jqOut})`);
  } else {
    lines.push('  \u274C jq not found — required by rouge-safety-check.sh PreToolUse hook');
    lines.push('       Install: `brew install jq` (macOS) | `apt-get install jq` (Debian/Ubuntu) | https://stedolan.github.io/jq/');
    blockers.push('jq not found');
  }

  // --- GitHub CLI ---
  const ghOut = tryExec('gh --version');
  if (ghOut) {
    const ghVersion = ghOut.split('\n')[0]; // first line only
    lines.push(`  \u2705 GitHub CLI installed (${ghVersion})`);
  } else {
    lines.push('  \u274C GitHub CLI not found (install: https://cli.github.com/)');
    blockers.push('GitHub CLI not found');
  }

  // --- Slack tokens ---
  const slackBot = getSecret('slack', 'SLACK_BOT_TOKEN');
  const slackApp = getSecret('slack', 'SLACK_APP_TOKEN');
  if (slackBot && slackApp) {
    lines.push('  \u2705 Slack tokens configured');
  } else {
    lines.push('  \u274C Slack tokens not configured (run: rouge setup slack)');
    blockers.push('Slack tokens not configured');
  }

  // --- Anthropic auth ---
  if (claudeOut) {
    const authCheck = tryExec('claude -p "test" --max-turns 0', 10000);
    if (authCheck !== null) {
      lines.push('  \u2705 Anthropic auth valid');
    } else {
      lines.push('  \u274C Anthropic auth invalid (run: claude login)');
      blockers.push('Anthropic auth invalid');
    }
  }

  // --- Optional: Supabase CLI ---
  const supabaseOut = tryExec('supabase --version');
  if (supabaseOut) {
    lines.push(`  \u2705 Supabase CLI installed (${supabaseOut})`);
  } else {
    lines.push('  \u26A0\uFE0F  Supabase CLI not installed (optional \u2014 needed for Supabase projects)');
    warnings.push('Supabase CLI not installed');
  }

  // --- Optional: Vercel CLI ---
  const vercelOut = tryExec('vercel --version');
  if (vercelOut) {
    lines.push(`  \u2705 Vercel CLI installed (${vercelOut})`);
  } else {
    lines.push('  \u26A0\uFE0F  Vercel CLI not installed (optional \u2014 needed for Vercel deployments)');
    warnings.push('Vercel CLI not installed');
  }

  // --- Optional: GStack browse ---
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const gstackSkillPath = path.join(home, '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse');
  let gstackFound = false;
  if (fs.existsSync(gstackSkillPath)) {
    gstackFound = true;
  } else {
    const whichBrowse = tryExec('which browse');
    if (whichBrowse) gstackFound = true;
  }
  if (gstackFound) {
    lines.push('  \u2705 GStack browse installed');
  } else {
    lines.push('  \u26A0\uFE0F  GStack browse not installed (optional \u2014 needed for web product QA)');
    lines.push('       Install: git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && (cd ~/.claude/skills/gstack && ./setup)');
    warnings.push('GStack browse not installed');
  }

  // --- Dashboard dependencies ---
  const dashboardModules = path.join(ROUGE_ROOT, 'dashboard', 'node_modules');
  if (fs.existsSync(dashboardModules)) {
    lines.push('  \u2705 Dashboard dependencies installed');
  } else {
    const dashboardDir = path.join(ROUGE_ROOT, 'dashboard');
    if (fs.existsSync(dashboardDir)) {
      lines.push('  \u274C Dashboard dependencies missing (run: npm run dashboard:install)');
      blockers.push('Dashboard dependencies missing');
    } else {
      lines.push('  \u26A0\uFE0F  Dashboard not found (optional)');
      warnings.push('Dashboard directory not found');
    }
  }

  // --- Summary ---
  lines.push('');
  lines.push(`  ${'─'.repeat(40)}`);
  if (blockers.length === 0 && warnings.length === 0) {
    lines.push('  All checks passed. You\'re ready to build.');
  } else if (blockers.length === 0) {
    lines.push(`  All required checks passed. ${warnings.length} optional warning${warnings.length > 1 ? 's' : ''}.`);
  } else {
    lines.push(`  ${blockers.length} blocker${blockers.length > 1 ? 's' : ''} found. Fix these before running Rouge:`);
    for (const b of blockers) {
      lines.push(`    - ${b}`);
    }
  }
  lines.push('');

  console.log(lines.join('\n'));

  if (blockers.length > 0) {
    process.exit(1);
  }
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
  const subcommand = args[1];
  const dashboardDir = path.join(__dirname, '..', '..', 'dashboard');
  const standaloneServer = path.join(dashboardDir, 'dist', 'server.js');
  const standaloneMarker = path.join(dashboardDir, 'dist', 'ROUGE_STANDALONE');
  const ROUGE_HOME = process.env.ROUGE_HOME || path.join(require('os').homedir(), '.rouge');
  const PID_FILE = path.join(ROUGE_HOME, 'dashboard.pid');
  const DASHBOARD_PORT = parseInt(process.env.ROUGE_DASHBOARD_PORT || '3001', 10);
  const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

  if (!fs.existsSync(dashboardDir)) {
    console.error('Dashboard not found at', dashboardDir);
    console.error('The dashboard should be at The-Rouge/dashboard/. Run `rouge setup` for first-time setup.');
    process.exit(1);
  }

  // Prebuilt tarball installs: .next/standalone/ is shipped by `prepack`.
  // Source checkouts: no standalone, use `next dev` via the dashboard deps.
  const hasPrebuilt = fs.existsSync(standaloneServer) && fs.existsSync(standaloneMarker);
  const hasDevDeps = fs.existsSync(path.join(dashboardDir, 'node_modules', 'next'));

  function readPids() {
    try { return JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch { return null; }
  }
  function writePids(pids) {
    if (!fs.existsSync(ROUGE_HOME)) fs.mkdirSync(ROUGE_HOME, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2) + '\n');
  }
  function clearPids() {
    try { fs.unlinkSync(PID_FILE); } catch {}
  }
  function isRunning(pid) {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }
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
    console.log(`Starting dashboard in foreground (${hasPrebuilt ? 'prebuilt' : 'dev mode'}, Ctrl+C to stop)...`);
    console.log(`  URL:       ${DASHBOARD_URL}`);
    console.log(`  Background mode: rouge dashboard start\n`);

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

  Commands:
    rouge doctor                    Check prerequisites and dependencies
    rouge init <name>               Create a new project directory
    rouge seed <name>               Start interactive seeding via claude -p
    rouge build [name]              Start the Karpathy Loop
    rouge status [name]             Show project state summary
    rouge cost <name> [--actual]    Show cost estimate or actuals
    rouge setup <integration>       Set up integration credentials
    rouge slack setup               Print Slack setup guide
    rouge slack start               Start the Slack bot
    rouge slack test                Send a test webhook message
    rouge secrets list              List stored secret names
    rouge secrets check <dir>       Check project against stored secrets
    rouge secrets validate <target> Validate keys against API endpoints
    rouge secrets expiry [days]     Show secrets expiring within N days
    rouge secrets expiry set <s/K> <date>  Set expiry for a secret
    rouge feasibility <description> Assess feasibility of a proposed change
    rouge contribute <path>         Contribute a draft integration pattern via PR
    rouge dashboard                 Start dashboard in foreground (auto-opens browser)
    rouge dashboard start           Start dashboard in background (persistent)
    rouge dashboard stop            Stop dashboard
    rouge dashboard status          Check dashboard status
    rouge dashboard restart         Restart background dashboard
    rouge dashboard install         Install dev deps (source checkouts only)
    rouge dashboard --no-open       Don't auto-open the browser
    rouge improve                   Run one self-improvement iteration
    rouge improve --max-iterations 5  Run up to 5 iterations
    rouge improve --explore         Enable exploration when no issues remain
    rouge improve --dry-run         Show what would be done without doing it

  Integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}
`);
}
