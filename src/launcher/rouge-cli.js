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
  if (!integration) {
    console.error('Usage: rouge setup <integration>');
    console.error(`Available integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}`);
    process.exit(1);
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
  console.log(`\n  Next: run \`rouge seed ${name}\` to start the seeding process.\n`);
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
  const issues = [];
  const lines = [];

  lines.push('');
  lines.push('  Rouge Doctor');
  lines.push(`  ${'─'.repeat(35)}`);

  // --- Required ---
  lines.push('');
  lines.push('  Required:');

  // 1. Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 18) {
    lines.push(`    ✓ Node.js ${nodeVersion}`);
  } else {
    lines.push(`    ✗ Node.js ${nodeVersion} — requires >= 18`);
    lines.push('      Install: https://nodejs.org/');
    issues.push('Node.js >= 18 required');
  }

  // 2. Git
  try {
    const gitOut = execSync('git --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const gitVersion = gitOut.replace('git version ', '');
    lines.push(`    ✓ Git ${gitVersion}`);
  } catch {
    lines.push('    ✗ Git — not found');
    lines.push('      Install: https://git-scm.com/');
    issues.push('Git not found');
  }

  // 3. Claude Code CLI
  try {
    const claudeOut = execSync('claude --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    lines.push(`    ✓ Claude Code CLI ${claudeOut}`);
  } catch {
    lines.push('    ✗ Claude Code CLI — not found');
    lines.push('      Install: npm install -g @anthropic-ai/claude-code (requires Claude subscription)');
    issues.push('Claude Code CLI not found');
  }

  // 4. GStack browse
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const gstackSkillPath = path.join(home, '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse');
  let gstackFound = false;

  if (fs.existsSync(gstackSkillPath)) {
    gstackFound = true;
    lines.push(`    ✓ GStack browse (${gstackSkillPath})`);
  } else {
    // Try which
    try {
      const whichOut = execSync('which browse', { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (whichOut) {
        gstackFound = true;
        lines.push(`    ✓ GStack browse (${whichOut})`);
      }
    } catch { /* not found via which */ }
  }

  if (!gstackFound) {
    lines.push('    ✗ GStack browse — not found');
    lines.push('      Install: https://github.com/garrytan/gstack (required for web products, macOS only)');
    issues.push('GStack browse not found');
  }

  // --- Recommended ---
  lines.push('');
  lines.push('  Recommended:');

  const slackBot = getSecret('slack', 'SLACK_BOT_TOKEN');
  const slackApp = getSecret('slack', 'SLACK_APP_TOKEN');
  const slackWebhook = getSecret('slack', 'ROUGE_SLACK_WEBHOOK');

  if (slackBot && slackApp && slackWebhook) {
    lines.push('    ✓ Slack — tokens configured');
  } else {
    lines.push('    ✗ Slack — not configured');
    lines.push('      Run `rouge slack setup` to configure Slack (recommended for notifications)');
  }

  // --- Optional integrations ---
  lines.push('');
  lines.push('  Integrations:');

  const integrationNames = Object.keys(INTEGRATION_KEYS).filter((name) => name !== 'slack');
  for (const name of integrationNames) {
    const keys = INTEGRATION_KEYS[name];
    const hasAny = keys.some((key) => getSecret(name, key));
    if (hasAny) {
      lines.push(`    ✓ ${name} — configured`);
    } else {
      lines.push(`    ✗ ${name} — not configured (run \`rouge setup ${name}\`)`);
    }
  }

  // --- Summary ---
  lines.push('');
  if (issues.length === 0) {
    lines.push('  All required dependencies found.');
  } else if (issues.length === 1) {
    lines.push(`  1 issue found. ${issues[0]}.`);
  } else {
    lines.push(`  ${issues.length} issues found.`);
    for (const issue of issues) {
      lines.push(`    - ${issue}`);
    }
  }
  lines.push('');

  console.log(lines.join('\n'));

  if (issues.length > 0) {
    process.exit(1);
  }
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

  Integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}
`);
}
