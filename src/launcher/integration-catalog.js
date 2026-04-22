/**
 * Integration catalog reader.
 *
 * Single entry point for every consumer that needs structured knowledge
 * about a deploy target (or database, auth, payment, etc.). Manifests
 * live at `library/integrations/tier-2/<target>/manifest.json` and
 * conform to `schemas/integration-manifest.json`.
 *
 * Consumers:
 *   - `deploy-to-staging.js` — reads health_check, prerequisites,
 *     auto_remediate for the selected target.
 *   - `provision-infrastructure.js` — reads env_vars + secrets_required
 *     to know what to merge into the spawn env from the secrets store.
 *   - Phase prompts (via cycle_context injection) — read
 *     `notes_for_prompt` and `build_output_dirs` to know target-specific
 *     gotchas without Rouge hardcoding them into prompt text.
 *
 * Alias resolution: if `vision.json.infrastructure.deployment_target`
 * is `gh-pages`, the catalog resolves it to the `github-pages` manifest
 * via the aliases array. Lets us normalise on one canonical slug without
 * breaking projects that declared an alternate name.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG_DIR = path.join(ROOT, 'library/integrations/tier-2');
const SCHEMA_PATH = path.join(ROOT, 'schemas/integration-manifest.json');

let cachedManifests = null;
let cachedValidator = null;

function validator() {
  if (cachedValidator) return cachedValidator;
  try {
    // eslint-disable-next-line global-require
    const Ajv = require('ajv');
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    cachedValidator = ajv.compile(schema);
    return cachedValidator;
  } catch {
    // ajv unavailable — skip validation rather than crash the loader.
    cachedValidator = () => true;
    return cachedValidator;
  }
}

function loadAll() {
  if (cachedManifests) return cachedManifests;
  const byTarget = new Map();
  if (!fs.existsSync(CATALOG_DIR)) {
    cachedManifests = byTarget;
    return byTarget;
  }
  const validate = validator();
  const entries = fs.readdirSync(CATALOG_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(CATALOG_DIR, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.warn(`[integration-catalog] skip ${entry.name}: parse error — ${err.message}`);
      continue;
    }
    if (!validate(manifest)) {
      console.warn(`[integration-catalog] skip ${entry.name}: schema violation`);
      continue;
    }
    byTarget.set(manifest.target, manifest);
    for (const alias of manifest.aliases || []) {
      byTarget.set(alias, manifest);
    }
  }
  cachedManifests = byTarget;
  return byTarget;
}

/**
 * Resolve a target slug to its manifest. Accepts canonical slugs and
 * any alias declared in a manifest's `aliases` array.
 *
 * @param {string} target — e.g. 'github-pages' or 'gh-pages'.
 * @returns {object|null} the manifest, or null if unknown.
 */
function getManifest(target) {
  if (!target) return null;
  return loadAll().get(target) || null;
}

/**
 * Run a manifest prerequisite's `check` step and return the result.
 *
 * @param {object} check — the `check` object from the manifest.
 * @param {object} ctx — resolution context: { projectDir, owner, repo, project, env }.
 * @returns {{ ok: boolean, detail?: string }}
 */
function runCheck(check, ctx) {
  if (!check || !check.kind) return { ok: false, detail: 'no check kind' };
  try {
    if (check.kind === 'shell') {
      execSync(check.command, {
        cwd: ctx.projectDir || process.cwd(),
        stdio: 'pipe',
        timeout: 10000,
      });
      return { ok: true };
    }
    if (check.kind === 'gh-api') {
      const endpoint = resolveTemplate(check.endpoint, ctx);
      execSync(`gh api ${endpoint}`, { stdio: 'pipe', timeout: 10000 });
      return { ok: true };
    }
    if (check.kind === 'file-exists') {
      const p = path.join(ctx.projectDir || '.', check.path);
      return fs.existsSync(p) ? { ok: true } : { ok: false, detail: `not found: ${check.path}` };
    }
    if (check.kind === 'env-var-present') {
      const present = !!(ctx.env && ctx.env[check.env_var]) || !!process.env[check.env_var];
      return present ? { ok: true } : { ok: false, detail: `env var not set: ${check.env_var}` };
    }
    if (check.kind === 'secret-present') {
      // Secrets store lookup — deferred to the caller who holds the
      // secrets module. We return 'unknown' to signal "ask the
      // secrets subsystem," rather than crashing the catalog reader
      // with a circular require.
      return { ok: false, detail: `check kind=secret-present requires caller resolution for ${check.secret_key}` };
    }
    return { ok: false, detail: `unknown check kind: ${check.kind}` };
  } catch (err) {
    return { ok: false, detail: (err.stderr || err.stdout || err.message || 'check failed').toString().slice(0, 200) };
  }
}

/**
 * Run every prerequisite check for a manifest. Returns the list of
 * results in manifest order. Callers decide whether to auto-remediate
 * failing prerequisites (per self-heal green-zone rules).
 */
function runPrerequisites(manifest, ctx) {
  if (!manifest || !Array.isArray(manifest.prerequisites)) return [];
  return manifest.prerequisites.map((p) => ({
    id: p.id,
    label: p.label,
    has_auto_remediate: !!p.auto_remediate,
    ...runCheck(p.check, ctx),
  }));
}

function resolveTemplate(s, ctx) {
  if (!s) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? String(ctx[k]) : m));
}

/**
 * Render a manifest's health-check URL with the given context.
 */
function resolveHealthCheckUrl(manifest, ctx) {
  if (!manifest || !manifest.health_check || !manifest.health_check.url_template) return null;
  return resolveTemplate(manifest.health_check.url_template, ctx);
}

/**
 * Run one prerequisite's `auto_remediate` step. Returns result shape
 * matching `runCheck` — ok/false with an optional detail.
 *
 * Only invoked by callers after they've confirmed the failing
 * prerequisite is in the self-heal green zone.
 */
function runAutoRemediate(prerequisite, ctx) {
  const r = prerequisite && prerequisite.auto_remediate;
  if (!r) return { ok: false, detail: 'no auto_remediate defined' };
  try {
    if (r.kind === 'shell') {
      execSync(r.command, { cwd: ctx.projectDir || process.cwd(), stdio: 'pipe', timeout: 15000 });
      return { ok: true };
    }
    if (r.kind === 'gh-api-post') {
      const endpoint = resolveTemplate(r.endpoint, ctx);
      const args = [`-X`, `POST`, endpoint];
      for (const [k, v] of Object.entries(r.body || {})) {
        if (v !== null && typeof v === 'object') {
          for (const [ik, iv] of Object.entries(v)) {
            args.push('-f', `${k}[${ik}]=${iv}`);
          }
        } else {
          args.push('-f', `${k}=${v}`);
        }
      }
      const cmd = `gh api ${args.map((a) => (a.includes('=') || a.includes('[') ? `'${a}'` : a)).join(' ')}`;
      execSync(cmd, { stdio: 'pipe', timeout: 15000 });
      return { ok: true };
    }
    return { ok: false, detail: `unknown remediation kind: ${r.kind}` };
  } catch (err) {
    return { ok: false, detail: (err.stderr || err.stdout || err.message || 'remediation failed').toString().slice(0, 200) };
  }
}

/**
 * Run all prerequisites; for any that fail AND define auto_remediate,
 * attempt remediation (green-zone self-heal). Re-check afterwards.
 *
 * Returns `{ ok, remediated: [ids], failed: [{id, label, detail}] }`.
 * ok=true iff every prerequisite is satisfied (directly or after
 * remediation). The caller decides whether to proceed on partial
 * success.
 *
 * @param {object} manifest
 * @param {object} ctx — resolution context: { projectDir, owner, repo, project, env }.
 * @param {object} [opts] — { allowRemediate: bool } (default true).
 */
function ensurePrerequisites(manifest, ctx, opts) {
  const allow = !opts || opts.allowRemediate !== false;
  const results = runPrerequisites(manifest, ctx);
  const remediated = [];
  const failed = [];
  const prereqs = (manifest && manifest.prerequisites) || [];
  results.forEach((res, i) => {
    if (res.ok) return;
    const prereq = prereqs[i];
    if (allow && prereq && prereq.auto_remediate) {
      const rem = runAutoRemediate(prereq, ctx);
      if (rem.ok) {
        const grace = (prereq.auto_remediate.grace_seconds || 0) * 1000;
        if (grace > 0) {
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, grace);
          } catch { /* environment without SharedArrayBuffer — no-op sleep */ }
        }
        // Re-check to confirm the remediation actually landed.
        const recheck = runCheck(prereq.check, ctx);
        if (recheck.ok) {
          remediated.push(prereq.id);
          return;
        }
        failed.push({ id: prereq.id, label: prereq.label, detail: `remediation ran but check still fails: ${recheck.detail}` });
        return;
      }
      failed.push({ id: prereq.id, label: prereq.label, detail: `remediation failed: ${rem.detail}` });
      return;
    }
    failed.push({ id: res.id, label: res.label, detail: res.detail });
  });
  return { ok: failed.length === 0, remediated, failed };
}

/**
 * Probe the manifest's health_check URL with the appropriate grace
 * window. On a freshly-remediated prerequisite (firstDeploy=true),
 * uses first_deploy_grace_ms + first_deploy_poll_window_ms; otherwise
 * does a single timeout_ms probe.
 *
 * Returns { ok, attempts, elapsedMs, status? }.
 */
function runHealthCheck(manifest, url, opts) {
  const hc = manifest && manifest.health_check;
  if (!hc || hc.kind === 'none') return { ok: true, attempts: 0, elapsedMs: 0 };
  const start = Date.now();
  const firstDeploy = !!(opts && opts.firstDeploy);
  const timeoutMs = hc.timeout_ms || 10000;
  const graceMs = firstDeploy ? (hc.first_deploy_grace_ms || 0) : 0;
  const pollWindowMs = firstDeploy ? (hc.first_deploy_poll_window_ms || 0) : 0;
  const intervalMs = hc.poll_interval_ms || 15000;

  function probe() {
    try {
      const output = execSync(
        `curl -s -o /dev/null -w "%{http_code}" --max-time ${Math.ceil(timeoutMs / 1000)} "${url}"`,
        { encoding: 'utf8', timeout: timeoutMs + 2000 },
      );
      const status = parseInt(output.trim(), 10);
      const passes = hc.kind === 'http-status-any-2xx'
        ? status >= 200 && status < 300
        : status >= 200 && status < 400;
      return { status, passes };
    } catch {
      return { status: 0, passes: false };
    }
  }

  if (graceMs > 0) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, graceMs);
    } catch { /* no-op sleep */ }
  }

  let attempts = 0;
  let last = probe();
  attempts++;
  if (last.passes) return { ok: true, attempts, elapsedMs: Date.now() - start, status: last.status };
  if (pollWindowMs <= 0) return { ok: false, attempts, elapsedMs: Date.now() - start, status: last.status };
  while (Date.now() - start < pollWindowMs) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
    } catch { /* no-op sleep */ }
    last = probe();
    attempts++;
    if (last.passes) return { ok: true, attempts, elapsedMs: Date.now() - start, status: last.status };
  }
  return { ok: false, attempts, elapsedMs: Date.now() - start, status: last.status };
}

/**
 * Testing hook — flush the in-memory cache so tests can reload with
 * a fresh manifest directory. Not exposed for production use.
 */
function _resetCache() {
  cachedManifests = null;
  cachedValidator = null;
}

module.exports = {
  getManifest,
  runCheck,
  runPrerequisites,
  runAutoRemediate,
  ensurePrerequisites,
  runHealthCheck,
  resolveTemplate,
  resolveHealthCheckUrl,
  _resetCache,
};
