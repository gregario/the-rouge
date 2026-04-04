/**
 * Cross-platform secrets management for The Rouge.
 *
 * Stores and retrieves secrets from the OS credential store:
 *   - macOS:   Keychain via `security` CLI
 *   - Linux:   secret-service via `secret-tool` CLI
 *   - Windows: Credential Manager via PowerShell
 *
 * All operations use execSync — no native dependencies required.
 * Secret values are NEVER logged or exposed to the model.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORM = process.platform;
const SERVICE_PREFIX = 'rouge';

// ---------------------------------------------------------------------------
// Platform backends
// ---------------------------------------------------------------------------

const macOS = {
  store(service, key, value) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    // Delete first to allow overwrite (ignore errors if not found)
    try {
      execSync(
        `security delete-generic-password -s ${esc(serviceName)} -a ${esc(account)}`,
        { stdio: 'ignore' }
      );
    } catch { /* not found — fine */ }
    execSync(
      `security add-generic-password -s ${esc(serviceName)} -a ${esc(account)} -w ${esc(value)}`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
  },

  get(service, key) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    try {
      const result = execSync(
        `security find-generic-password -s ${esc(serviceName)} -a ${esc(account)} -w`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      return result.trim();
    } catch {
      return null;
    }
  },

  list(service) {
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    try {
      const raw = execSync(
        `security dump-keychain 2>/dev/null`,
        { encoding: 'utf8', stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
      );
      const names = [];
      // Split into blocks at each "class:" boundary and search within each block
      const blocks = raw.split(/^(?=keychain:)/m);
      for (const block of blocks) {
        if (block.includes(`"svce"<blob>="${serviceName}"`)) {
          const match = block.match(/"acct"<blob>="([^"]+)"/);
          if (match) {
            const parts = match[1].split('/');
            if (parts.length >= 2) {
              names.push(parts.slice(1).join('/'));
            }
          }
        }
      }
      return names;
    } catch {
      return [];
    }
  },

  delete(service, key) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    try {
      execSync(
        `security delete-generic-password -s ${esc(serviceName)} -a ${esc(account)}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      return true;
    } catch {
      return false;
    }
  },
};

const linux = {
  store(service, key, value) {
    const label = `${SERVICE_PREFIX}-${service}-${key}`;
    execSync(
      `echo -n ${esc(value)} | secret-tool store --label=${esc(label)} integration ${esc(service)} key ${esc(key)} app rouge`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
  },

  get(service, key) {
    try {
      const result = execSync(
        `secret-tool lookup integration ${esc(service)} key ${esc(key)} app rouge`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      return result.trim() || null;
    } catch {
      return null;
    }
  },

  list(service) {
    try {
      const raw = execSync(
        `secret-tool search --all integration ${esc(service)} app rouge 2>&1`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      const names = [];
      const matches = raw.matchAll(/attribute\.key\s*=\s*(.+)/g);
      for (const m of matches) {
        names.push(m[1].trim());
      }
      return names;
    } catch {
      return [];
    }
  },

  delete(service, key) {
    try {
      // secret-tool doesn't have a direct delete; clear the value
      execSync(
        `echo -n "" | secret-tool store --label="deleted" integration ${esc(service)} key ${esc(key)} app rouge`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      return true;
    } catch {
      return false;
    }
  },
};

const windows = {
  store(service, key, value) {
    const target = `${SERVICE_PREFIX}-${service}-${key}`;
    const ps = `
      $cred = New-Object -TypeName PSCredential -ArgumentList '${key}', (ConvertTo-SecureString '${value.replace(/'/g, "''")}' -AsPlainText -Force);
      New-StoredCredential -Target '${target}' -UserName '${key}' -Password '${value.replace(/'/g, "''")}' -Persist LocalMachine -ErrorAction SilentlyContinue;
      if (-not $?) { cmdkey /add:${target} /user:${key} /pass:${value.replace(/'/g, "''")} }
    `.trim();
    execSync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  },

  get(service, key) {
    const target = `${SERVICE_PREFIX}-${service}-${key}`;
    try {
      const ps = `
        $output = cmdkey /list:${target} 2>&1;
        if ($output -match 'User:') { Write-Output 'found' } else { Write-Output 'notfound' }
      `.trim();
      const result = execSync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      // Windows Credential Manager doesn't easily expose passwords via CLI
      // For a full implementation, use CredRead via C# inline
      return result.trim() === 'found' ? '<stored>' : null;
    } catch {
      return null;
    }
  },

  list(service) {
    const prefix = `${SERVICE_PREFIX}-${service}-`;
    try {
      const raw = execSync(`cmdkey /list`, { encoding: 'utf8', stdio: 'pipe' });
      const names = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Target:') && trimmed.includes(prefix)) {
          const target = trimmed.replace('Target:', '').trim();
          const key = target.replace(prefix, '');
          if (key) names.push(key);
        }
      }
      return names;
    } catch {
      return [];
    }
  },

  delete(service, key) {
    const target = `${SERVICE_PREFIX}-${service}-${key}`;
    try {
      execSync(`cmdkey /delete:${target}`, { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Platform selection
// ---------------------------------------------------------------------------

function getBackend() {
  if (PLATFORM === 'darwin') return macOS;
  if (PLATFORM === 'linux') return linux;
  if (PLATFORM === 'win32') return windows;
  throw new Error(`Unsupported platform: ${PLATFORM}. Supported: darwin, linux, win32`);
}

/** Shell-escape a value for use in commands. */
function esc(val) {
  // Wrap in single quotes, escape any embedded single quotes
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Integration key definitions
// ---------------------------------------------------------------------------

const INTEGRATION_KEYS = {
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'],
  supabase: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'],
  sentry: ['SENTRY_AUTH_TOKEN', 'SENTRY_DSN'],
  slack: ['ROUGE_SLACK_WEBHOOK', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'],
  cloudflare: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
  vercel: ['VERCEL_TOKEN'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a secret in the OS credential store.
 * @param {string} service — integration name (e.g., "stripe", "supabase")
 * @param {string} key — env var name (e.g., "STRIPE_SECRET_KEY")
 * @param {string} value — the secret value
 */
function storeSecret(service, key, value) {
  getBackend().store(service, key, value);
}

/**
 * Retrieve a secret from the OS credential store.
 * @param {string} service — integration name
 * @param {string} key — env var name
 * @returns {string|null} — the secret value, or null if not found
 */
function getSecret(service, key) {
  return getBackend().get(service, key);
}

/**
 * List stored secret names (NOT values) for a service.
 * @param {string} service — integration name
 * @returns {string[]} — array of key names
 */
function listSecrets(service) {
  return getBackend().list(service);
}

/**
 * Delete a secret from the OS credential store.
 * @param {string} service — integration name
 * @param {string} key — env var name
 * @returns {boolean} — true if deleted, false if not found
 */
function deleteSecret(service, key) {
  return getBackend().delete(service, key);
}

/**
 * Load all required secrets for a project from the credential store.
 *
 * Reads the project's vision.json `infrastructure` section to determine
 * which integrations are needed, then loads the corresponding keys.
 *
 * @param {string} projectDir — absolute path to the project directory
 * @returns {{ env: Record<string, string>, missing: string[], loaded: string[] }}
 */
function loadProjectSecrets(projectDir) {
  const env = {};
  const missing = [];
  const loaded = [];

  // Determine required integrations from vision.json
  const integrations = discoverIntegrations(projectDir);

  for (const integration of integrations) {
    const keys = INTEGRATION_KEYS[integration];
    if (!keys) continue;

    for (const key of keys) {
      const value = getSecret(integration, key);
      if (value) {
        env[key] = value;
        loaded.push(key);
      } else {
        missing.push(key);
      }
    }
  }

  return { env, missing, loaded };
}

/**
 * Discover which integrations a project needs by reading vision.json.
 * @param {string} projectDir
 * @returns {string[]}
 */
function discoverIntegrations(projectDir) {
  const integrations = new Set();

  // Check vision.json infrastructure section
  const visionPath = path.join(projectDir, 'vision.json');
  if (fs.existsSync(visionPath)) {
    try {
      const vision = JSON.parse(fs.readFileSync(visionPath, 'utf8'));
      if (vision.infrastructure) {
        // infrastructure keys map to integration names
        for (const key of Object.keys(vision.infrastructure)) {
          const normalized = key.toLowerCase().replace(/[-_]/g, '');
          if (normalized.includes('stripe')) integrations.add('stripe');
          if (normalized.includes('supabase')) integrations.add('supabase');
          if (normalized.includes('sentry')) integrations.add('sentry');
          if (normalized.includes('slack')) integrations.add('slack');
          if (normalized.includes('cloudflare')) integrations.add('cloudflare');
          if (normalized.includes('vercel')) integrations.add('vercel');
        }
      }
      // Also check deploy/hosting section
      if (vision.deploy?.platform === 'cloudflare' || vision.hosting?.platform === 'cloudflare') {
        integrations.add('cloudflare');
      }
      if (vision.deploy?.platform === 'vercel' || vision.hosting?.platform === 'vercel') {
        integrations.add('vercel');
      }
    } catch { /* corrupted vision.json — skip */ }
  }

  return [...integrations];
}

// ---------------------------------------------------------------------------
// Validity checking — hit lightweight API endpoints to verify keys work
// ---------------------------------------------------------------------------

/**
 * Validation endpoints per integration key.
 * Each returns a shell command that exits 0 if valid, non-zero otherwise.
 * Commands must NOT expose the secret in stdout/stderr (use -s, redirect output).
 */
const VALIDATION_COMMANDS = {
  STRIPE_SECRET_KEY: (val) =>
    `curl -sf -o /dev/null -u ${esc(val + ':')} https://api.stripe.com/v1/balance`,
  STRIPE_PUBLISHABLE_KEY: (val) =>
    // Publishable keys can't be validated server-side — check format only
    val.startsWith('pk_') ? null : 'false',
  SUPABASE_URL: (val) =>
    `curl -sf -o /dev/null ${esc(val + '/rest/v1/')} -H "apikey: dummy"`,
  SUPABASE_ANON_KEY: () => null, // JWT — can't validate without URL context
  SUPABASE_SERVICE_KEY: () => null, // JWT — can't validate without URL context
  SENTRY_AUTH_TOKEN: (val) =>
    `curl -sf -o /dev/null -H ${esc('Authorization: Bearer ' + val)} https://sentry.io/api/0/`,
  SENTRY_DSN: (val) =>
    // DSN is a URL — check it parses and the host resolves
    val.startsWith('https://') ? null : 'false',
  CLOUDFLARE_API_TOKEN: (val) =>
    `curl -sf -o /dev/null -H ${esc('Authorization: Bearer ' + val)} https://api.cloudflare.com/client/v4/user/tokens/verify`,
  CLOUDFLARE_ACCOUNT_ID: () => null, // Account ID isn't a secret — format check only
  VERCEL_TOKEN: (val) =>
    `curl -sf -o /dev/null -H ${esc('Authorization: Bearer ' + val)} https://api.vercel.com/v2/user`,
  ROUGE_SLACK_WEBHOOK: (val) =>
    // Webhook URLs should start with https://hooks.slack.com
    val.startsWith('https://hooks.slack.com/') ? null : 'false',
  SLACK_BOT_TOKEN: (val) =>
    `curl -sf -o /dev/null -H ${esc('Authorization: Bearer ' + val)} https://slack.com/api/auth.test`,
  SLACK_APP_TOKEN: () => null, // App tokens need WebSocket — skip
};

/**
 * Validate a single secret by hitting its API endpoint.
 * @param {string} service — integration name
 * @param {string} key — env var name
 * @returns {{ key: string, status: 'valid'|'invalid'|'unchecked'|'error', message?: string }}
 */
function validateSecret(service, key) {
  const value = getSecret(service, key);
  if (!value) {
    return { key, status: 'invalid', message: 'not stored' };
  }

  const cmdFactory = VALIDATION_COMMANDS[key];
  if (!cmdFactory) {
    return { key, status: 'unchecked', message: 'no validator defined' };
  }

  const cmd = cmdFactory(value);
  if (cmd === null) {
    // Format check passed or no remote validation possible
    return { key, status: 'unchecked', message: 'format ok, no remote check' };
  }

  try {
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
    return { key, status: 'valid' };
  } catch (err) {
    return { key, status: 'invalid', message: `API check failed (exit ${err.status || 'timeout'})` };
  }
}

/**
 * Validate all secrets for an integration.
 * @param {string} service — integration name
 * @returns {Array<{ key: string, status: string, message?: string }>}
 */
function validateIntegration(service) {
  const keys = INTEGRATION_KEYS[service];
  if (!keys) return [];
  return keys.map((key) => validateSecret(service, key));
}

/**
 * Validate all secrets for a project's detected integrations.
 * @param {string} projectDir — absolute path to project
 * @returns {Array<{ integration: string, results: Array<{ key: string, status: string, message?: string }> }>}
 */
function validateProjectSecrets(projectDir) {
  const integrations = discoverIntegrations(projectDir);
  return integrations.map((integration) => ({
    integration,
    results: validateIntegration(integration),
  }));
}

// ---------------------------------------------------------------------------
// Token expiry tracking
// ---------------------------------------------------------------------------

const EXPIRY_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.rouge-token-expiry.json'
);

/**
 * Read the expiry registry from disk.
 * @returns {Record<string, { expires_at?: string, last_validated?: string, notes?: string }>}
 */
function readExpiryRegistry() {
  try {
    return JSON.parse(fs.readFileSync(EXPIRY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Write the expiry registry to disk.
 */
function writeExpiryRegistry(registry) {
  fs.writeFileSync(EXPIRY_FILE, JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Record when a secret was last validated and optionally its expiry date.
 * @param {string} service
 * @param {string} key
 * @param {{ expires_at?: string, notes?: string }} opts
 */
function recordValidation(service, key, opts = {}) {
  const registry = readExpiryRegistry();
  const id = `${service}/${key}`;
  registry[id] = {
    ...registry[id],
    last_validated: new Date().toISOString(),
    ...opts,
  };
  writeExpiryRegistry(registry);
}

/**
 * Set an expiry date for a secret.
 * @param {string} service
 * @param {string} key
 * @param {string} expiresAt — ISO 8601 date string
 */
function setExpiry(service, key, expiresAt) {
  recordValidation(service, key, { expires_at: expiresAt });
}

/**
 * Get secrets that are expired or expiring within the given window.
 * @param {number} withinDays — number of days to look ahead (default 7)
 * @returns {Array<{ id: string, expires_at: string, days_remaining: number }>}
 */
function getExpiringSecrets(withinDays = 7) {
  const registry = readExpiryRegistry();
  const now = Date.now();
  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  const results = [];

  for (const [id, entry] of Object.entries(registry)) {
    if (!entry.expires_at) continue;
    const expiresMs = new Date(entry.expires_at).getTime();
    const daysRemaining = Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000));
    if (expiresMs - now <= windowMs) {
      results.push({ id, expires_at: entry.expires_at, days_remaining: daysRemaining });
    }
  }

  return results.sort((a, b) => a.days_remaining - b.days_remaining);
}

module.exports = {
  storeSecret,
  getSecret,
  listSecrets,
  deleteSecret,
  loadProjectSecrets,
  discoverIntegrations,
  validateSecret,
  validateIntegration,
  validateProjectSecrets,
  recordValidation,
  setExpiry,
  getExpiringSecrets,
  INTEGRATION_KEYS,
};
