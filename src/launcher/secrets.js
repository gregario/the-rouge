/**
 * Cross-platform secrets management for The Rouge.
 *
 * Stores and retrieves secrets from the OS credential store:
 *   - macOS:   Keychain via `security` CLI (interactive mode, stdin-driven)
 *   - Linux:   secret-service via `secret-tool` CLI (password via stdin)
 *   - Windows: Credential Manager via PowerShell + inline C# P/Invoke
 *
 * Secret values never appear in argv or shell command strings. All child
 * processes are spawned with an args array (no `/bin/sh -c ...`), and secret
 * material is passed via stdin or via a child process's own stdout buffer.
 * Values are never logged or returned to the model.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLATFORM = process.platform;
const SERVICE_PREFIX = 'rouge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a subprocess without a shell. Returns { status, stdout, stderr }. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...opts,
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error,
  };
}

/**
 * Quote a value for `security -i` interactive mode on macOS. The interactive
 * parser is shell-like: double-quote wraps, backslash escapes `\` and `"`.
 */
function secDQ(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// ---------------------------------------------------------------------------
// macOS backend — Keychain via `security -i` (stdin-driven, no argv leak)
// ---------------------------------------------------------------------------

const macOS = {
  store(service, key, value) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    // Feed commands to `security -i` via stdin so the value is never in argv.
    const input =
      `delete-generic-password -s ${secDQ(serviceName)} -a ${secDQ(account)}\n` +
      `add-generic-password -s ${secDQ(serviceName)} -a ${secDQ(account)} -w ${secDQ(value)}\n`;
    const r = run('security', ['-i'], {
      input,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    // `add-generic-password` after a delete that missed is fine; only hard-fail
    // if the add itself errored. `security -i` returns 0 even if the delete
    // raised "not found", so trust the exit code.
    if (r.status !== 0) {
      throw new Error(`security store failed: ${(r.stderr || '').slice(0, 200)}`);
    }
  },

  get(service, key) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    // `-w` prints the password to stdout (our private pipe); not argv.
    const r = run(
      'security',
      ['find-generic-password', '-s', serviceName, '-a', account, '-w'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (r.status !== 0) return null;
    return r.stdout.replace(/\n$/, '') || null;
  },

  list(service) {
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    const r = run('security', ['dump-keychain'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
    });
    if (r.status !== 0) return [];
    const names = [];
    const blocks = r.stdout.split(/^(?=keychain:)/m);
    for (const block of blocks) {
      if (block.includes(`"svce"<blob>="${serviceName}"`)) {
        const match = block.match(/"acct"<blob>="([^"]+)"/);
        if (match) {
          const parts = match[1].split('/');
          if (parts.length >= 2) names.push(parts.slice(1).join('/'));
        }
      }
    }
    return names;
  },

  delete(service, key) {
    const account = `${service}/${key}`;
    const serviceName = `${SERVICE_PREFIX}-${service}`;
    const r = run(
      'security',
      ['delete-generic-password', '-s', serviceName, '-a', account],
      { stdio: 'ignore' }
    );
    return r.status === 0;
  },
};

// ---------------------------------------------------------------------------
// Linux backend — secret-tool (password via stdin)
// ---------------------------------------------------------------------------

const linux = {
  store(service, key, value) {
    const label = `${SERVICE_PREFIX}-${service}-${key}`;
    // `secret-tool store` reads the password from stdin when stdin isn't a TTY.
    const r = run(
      'secret-tool',
      [
        'store', '--label', label,
        'integration', service,
        'key', key,
        'app', 'rouge',
      ],
      { input: value, stdio: ['pipe', 'ignore', 'pipe'] }
    );
    if (r.status !== 0) {
      throw new Error(`secret-tool store failed: ${(r.stderr || '').slice(0, 200)}`);
    }
  },

  get(service, key) {
    const r = run(
      'secret-tool',
      [
        'lookup',
        'integration', service,
        'key', key,
        'app', 'rouge',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (r.status !== 0) return null;
    const v = r.stdout.replace(/\n$/, '');
    return v || null;
  },

  list(service) {
    const r = run(
      'secret-tool',
      ['search', '--all', 'integration', service, 'app', 'rouge'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    if (r.status !== 0 && !r.stdout) return [];
    const names = [];
    const matches = (r.stdout + r.stderr).matchAll(/attribute\.key\s*=\s*(.+)/g);
    for (const m of matches) names.push(m[1].trim());
    return names;
  },

  delete(service, key) {
    // `secret-tool clear` is the proper deletion primitive.
    const r = run(
      'secret-tool',
      [
        'clear',
        'integration', service,
        'key', key,
        'app', 'rouge',
      ],
      { stdio: 'ignore' }
    );
    return r.status === 0;
  },
};

// ---------------------------------------------------------------------------
// Windows backend — PowerShell + inline C# P/Invoke (CredWrite/CredRead/CredDelete)
//
// The PowerShell script is fixed (no secret interpolation) and runs via
// -EncodedCommand so no user-controlled string ever touches argv. Target name
// and username travel via env vars (not secret). The secret travels via stdin
// on writes and comes back via stdout on reads — both are private pipes owned
// by this process.
// ---------------------------------------------------------------------------

const WIN_PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -MemberDefinition @"
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL {
  public uint Flags;
  public uint Type;
  [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
  [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public uint CredentialBlobSize;
  public IntPtr CredentialBlob;
  public uint Persist;
  public uint AttributeCount;
  public IntPtr Attributes;
  [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
  [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
}
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredWriteW")]
public static extern bool CredWrite([In] ref CREDENTIAL cred, [In] uint flags);
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredReadW")]
public static extern bool CredRead([In] string target, [In] uint type, [In] uint flags, out IntPtr credPtr);
[DllImport("advapi32.dll", SetLastError=true, EntryPoint="CredFree")]
public static extern void CredFree([In] IntPtr cred);
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredDeleteW")]
public static extern bool CredDelete([In] string target, [In] uint type, [In] uint flags);
"@ -Name Cred -Namespace Rouge -UsingNamespace System.Runtime.InteropServices

$op = $env:ROUGE_OP
$target = $env:ROUGE_TARGET
$user = $env:ROUGE_USER

if ($op -eq 'store') {
  $secret = [Console]::In.ReadToEnd()
  if ($secret.EndsWith("\`r\`n")) { $secret = $secret.Substring(0, $secret.Length - 2) }
  elseif ($secret.EndsWith("\`n")) { $secret = $secret.Substring(0, $secret.Length - 1) }
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($secret)
  $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $c = New-Object Rouge.Cred+CREDENTIAL
    $c.Type = 1  # CRED_TYPE_GENERIC
    $c.TargetName = $target
    $c.CredentialBlobSize = [uint32]$bytes.Length
    $c.CredentialBlob = $ptr
    $c.Persist = 2  # CRED_PERSIST_LOCAL_MACHINE
    $c.UserName = $user
    $ok = [Rouge.Cred]::CredWrite([ref]$c, 0)
    if (-not $ok) { throw "CredWrite failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  } finally {
    # Zero and free
    for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = 0 }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
  }
  exit 0
}
elseif ($op -eq 'get') {
  $ptr = [IntPtr]::Zero
  $ok = [Rouge.Cred]::CredRead($target, 1, 0, [ref]$ptr)
  if (-not $ok) { exit 1 }
  try {
    $c = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][Rouge.Cred+CREDENTIAL])
    $bytes = New-Object byte[] $c.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize)
    $value = [System.Text.Encoding]::Unicode.GetString($bytes)
    [Console]::Out.Write($value)
  } finally {
    [Rouge.Cred]::CredFree($ptr)
  }
  exit 0
}
elseif ($op -eq 'delete') {
  $ok = [Rouge.Cred]::CredDelete($target, 1, 0)
  if (-not $ok) { exit 1 }
  exit 0
}
else {
  Write-Error "unknown op: $op"
  exit 2
}
`;

// Cache the base64-encoded UTF-16LE script once per process.
let WIN_PS_ENCODED = null;
function winEncodedScript() {
  if (WIN_PS_ENCODED) return WIN_PS_ENCODED;
  WIN_PS_ENCODED = Buffer.from(WIN_PS_SCRIPT, 'utf16le').toString('base64');
  return WIN_PS_ENCODED;
}

function winSpawn(op, service, key, opts = {}) {
  const target = `${SERVICE_PREFIX}-${service}-${key}`;
  return run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', winEncodedScript()],
    {
      ...opts,
      env: {
        ...process.env,
        ROUGE_OP: op,
        ROUGE_TARGET: target,
        ROUGE_USER: key,
      },
    }
  );
}

const windows = {
  store(service, key, value) {
    const r = winSpawn('store', service, key, {
      input: value,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    if (r.status !== 0) {
      throw new Error(`Windows credential store failed: ${(r.stderr || '').slice(0, 200)}`);
    }
  },

  get(service, key) {
    // Pipe stderr so PowerShell errors (permissions, CredRead P/Invoke
    // failures) surface in the log. Exit code 1 with empty stderr means
    // "credential not found" — silent null is correct. Anything else
    // is a real failure the operator needs to see. Audit G13.
    const r = winSpawn('get', service, key, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0) {
      const err = (r.stderr || '').trim();
      if (err) {
        console.warn(`[secrets:windows] get ${service}/${key} failed (status ${r.status}): ${err.slice(0, 400)}`);
      }
      return null;
    }
    return r.stdout || null;
  },

  list(service) {
    // `cmdkey /list` is a read-only listing that never emits passwords.
    const prefix = `${SERVICE_PREFIX}-${service}-`;
    const r = run('cmdkey', ['/list'], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return [];
    const names = [];
    for (const line of r.stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Target:') && trimmed.includes(prefix)) {
        const tgt = trimmed.replace('Target:', '').trim();
        const key = tgt.replace(prefix, '');
        if (key) names.push(key);
      }
    }
    return names;
  },

  delete(service, key) {
    const r = winSpawn('delete', service, key, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    if (r.status !== 0) {
      const err = (r.stderr || '').trim();
      if (err) {
        console.warn(`[secrets:windows] delete ${service}/${key} failed (status ${r.status}): ${err.slice(0, 400)}`);
      }
      return false;
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// Platform selection
// ---------------------------------------------------------------------------

// Test-only bypass: when ROUGE_SECRETS_BACKEND=none, return a stub backend
// that has no secrets. Lets the CLI tests simulate "no keychain entries" on
// machines where the developer has real secrets stored in the system keychain.
// Never set this in production — it silently disables secret retrieval.
const nullBackend = {
  store() {},
  get() { return null; },
  list() { return []; },
  delete() { return false; },
};

function getBackend() {
  if (process.env.ROUGE_SECRETS_BACKEND === 'none') return nullBackend;
  if (PLATFORM === 'darwin') return macOS;
  if (PLATFORM === 'linux') return linux;
  if (PLATFORM === 'win32') return windows;
  throw new Error(`Unsupported platform: ${PLATFORM}. Supported: darwin, linux, win32`);
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
  llm: [
    'ANTHROPIC_API_KEY',
    'AWS_BEDROCK_ACCESS_KEY_ID',
    'AWS_BEDROCK_SECRET_ACCESS_KEY',
    'AWS_BEDROCK_REGION',
    'GCP_VERTEX_PROJECT',
    'GCP_VERTEX_REGION',
    'GCP_VERTEX_ADC',
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function storeSecret(service, key, value) {
  getBackend().store(service, key, value);
}

function getSecret(service, key) {
  return getBackend().get(service, key);
}

function listSecrets(service) {
  return getBackend().list(service);
}

function deleteSecret(service, key) {
  return getBackend().delete(service, key);
}

function loadProjectSecrets(projectDir) {
  const env = {};
  const missing = [];
  const loaded = [];

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

function discoverIntegrations(projectDir) {
  const integrations = new Set();
  const visionPath = path.join(projectDir, 'vision.json');
  if (fs.existsSync(visionPath)) {
    try {
      const vision = JSON.parse(fs.readFileSync(visionPath, 'utf8'));
      if (vision.infrastructure) {
        const searchText = JSON.stringify(vision.infrastructure).toLowerCase();
        if (searchText.includes('stripe')) integrations.add('stripe');
        if (searchText.includes('supabase')) integrations.add('supabase');
        if (searchText.includes('sentry')) integrations.add('sentry');
        if (searchText.includes('slack')) integrations.add('slack');
        if (searchText.includes('cloudflare')) integrations.add('cloudflare');
        if (searchText.includes('vercel')) integrations.add('vercel');
      }
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
// Validation — curl with `-K -` (config from stdin), no secrets in argv
// ---------------------------------------------------------------------------

/**
 * Each validator returns one of:
 *   - null               → format ok, no remote check possible
 *   - 'false'            → format invalid
 *   - { args, stdin }    → run curl with these argv + this stdin config
 * Secrets only appear inside the stdin config blob, never in argv.
 */
const VALIDATION_COMMANDS = {
  STRIPE_SECRET_KEY: (val) => ({
    args: ['-sf', '-o', '/dev/null', '-K', '-', 'https://api.stripe.com/v1/balance'],
    stdin: `user = "${curlEscape(val)}:"\n`,
  }),
  STRIPE_PUBLISHABLE_KEY: (val) => (val.startsWith('pk_') ? null : 'false'),
  SUPABASE_URL: (val) => {
    if (!/^https?:\/\//.test(val)) return 'false';
    return {
      args: ['-sf', '-o', '/dev/null', '-K', '-', `${val.replace(/\/$/, '')}/rest/v1/`],
      stdin: `header = "apikey: dummy"\n`,
    };
  },
  SUPABASE_ANON_KEY: () => null,
  SUPABASE_SERVICE_KEY: () => null,
  SENTRY_AUTH_TOKEN: (val) => ({
    args: ['-sf', '-o', '/dev/null', '-K', '-', 'https://sentry.io/api/0/'],
    stdin: `header = "Authorization: Bearer ${curlEscape(val)}"\n`,
  }),
  SENTRY_DSN: (val) => (val.startsWith('https://') ? null : 'false'),
  CLOUDFLARE_API_TOKEN: (val) => ({
    args: ['-sf', '-o', '/dev/null', '-K', '-', 'https://api.cloudflare.com/client/v4/user/tokens/verify'],
    stdin: `header = "Authorization: Bearer ${curlEscape(val)}"\n`,
  }),
  CLOUDFLARE_ACCOUNT_ID: () => null,
  VERCEL_TOKEN: (val) => ({
    args: ['-sf', '-o', '/dev/null', '-K', '-', 'https://api.vercel.com/v2/user'],
    stdin: `header = "Authorization: Bearer ${curlEscape(val)}"\n`,
  }),
  ROUGE_SLACK_WEBHOOK: (val) => (val.startsWith('https://hooks.slack.com/') ? null : 'false'),
  SLACK_BOT_TOKEN: (val) => ({
    args: ['-sf', '-o', '/dev/null', '-K', '-', 'https://slack.com/api/auth.test'],
    stdin: `header = "Authorization: Bearer ${curlEscape(val)}"\n`,
  }),
  SLACK_APP_TOKEN: () => null,
};

/** Escape a value for curl's `-K` config format (double-quoted strings). */
function curlEscape(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function validateSecret(service, key) {
  const value = getSecret(service, key);
  if (!value) return { key, status: 'invalid', message: 'not stored' };

  const factory = VALIDATION_COMMANDS[key];
  if (!factory) return { key, status: 'unchecked', message: 'no validator defined' };

  const spec = factory(value);
  if (spec === null) return { key, status: 'unchecked', message: 'format ok, no remote check' };
  if (spec === 'false') return { key, status: 'invalid', message: 'format check failed' };

  const r = run('curl', spec.args, {
    input: spec.stdin,
    stdio: ['pipe', 'ignore', 'pipe'],
    timeout: 10000,
  });
  if (r.status === 0) return { key, status: 'valid' };
  return { key, status: 'invalid', message: `API check failed (exit ${r.status == null ? 'timeout' : r.status})` };
}

function validateIntegration(service) {
  const keys = INTEGRATION_KEYS[service];
  if (!keys) return [];
  return keys.map((key) => validateSecret(service, key));
}

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
  os.homedir() || '/tmp',
  '.rouge-token-expiry.json'
);

function readExpiryRegistry() {
  try {
    return JSON.parse(fs.readFileSync(EXPIRY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeExpiryRegistry(registry) {
  // Write with owner-only perms in case future versions cache API responses.
  fs.writeFileSync(EXPIRY_FILE, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(EXPIRY_FILE, 0o600); } catch { /* best effort on Windows */ }
}

function recordValidation(service, key, opts = {}) {
  const registry = readExpiryRegistry();
  const id = `${service}/${key}`;
  registry[id] = { ...registry[id], last_validated: new Date().toISOString(), ...opts };
  writeExpiryRegistry(registry);
}

function setExpiry(service, key, expiresAt) {
  recordValidation(service, key, { expires_at: expiresAt });
}

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
