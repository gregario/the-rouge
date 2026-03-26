#!/usr/bin/env node
/**
 * The Rouge CLI — secrets management and integration setup.
 *
 * Usage:
 *   rouge setup <integration>        Interactive setup for an integration
 *   rouge secrets list               List all stored secret names
 *   rouge secrets check <project>    Check project against stored secrets
 *   rouge secrets validate <target>  Validate keys against API endpoints
 *   rouge secrets expiry [days]      Show expiring secrets
 *   rouge secrets expiry set <s/K> <date>  Set key expiry date
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');
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
// CLI router
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

if (command === 'setup') {
  cmdSetup(args[1]).catch((err) => {
    console.error(err.message);
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
    rouge setup <integration>       Set up integration credentials
    rouge secrets list              List stored secret names
    rouge secrets check <dir>       Check project against stored secrets
    rouge secrets validate <target> Validate keys against API endpoints
    rouge secrets expiry [days]     Show secrets expiring within N days
    rouge secrets expiry set <s/K> <date>  Set expiry for a secret

  Integrations: ${Object.keys(INTEGRATION_KEYS).join(', ')}
`);
}
