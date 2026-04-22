/**
 * Self-heal applier.
 *
 * Takes a plan (from self-heal-planner) and executes it within the
 * zone enforcer's rules. Runs on a dedicated `rouge-self-heal/...`
 * branch so the human can always reach the previous state with a
 * single `git checkout main`.
 *
 * Flow:
 *   1. classifyPlan(plan) — enforce green/yellow/red.
 *      - green: apply, run tests, commit. Keep branch if tests pass;
 *        revert and surface if they fail.
 *      - yellow: DON'T apply — create a plan file in
 *        `.rouge/self-heal-drafts/<ts>.json` for human review.
 *      - red: refuse outright. Log and return.
 *   2. Ensure clean working tree. Refuse to apply over uncommitted
 *      user work — the revert path depends on a clean baseline.
 *   3. Create branch, apply patches, run `npm test`, commit + return
 *      branch name (or revert + return failure).
 *   4. Every action is recorded to `~/.rouge/audit-log.jsonl` via
 *      audit-trail.js for traceability.
 *
 * Kill switch: src/launcher/self-heal-applier.js#loadConfig reads
 * rouge.config.json's `self_heal` block. Default is
 * `{ enabled: true, zones: ['green'] }`. User can set enabled=false
 * to disable the whole subsystem, or zones=[] to keep classification
 * active but never apply anything (dry-run mode).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'rouge.config.json');
const AUDIT_LOG = path.join(process.env.HOME || '/tmp', '.rouge', 'audit-log.jsonl');

const { classifyPlan } = require('./self-heal-zones.js');

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const sh = cfg.self_heal || {};
    return {
      enabled: sh.enabled !== false, // default true
      zones: Array.isArray(sh.zones) ? sh.zones : ['green'],
    };
  } catch {
    return { enabled: true, zones: ['green'] };
  }
}

function audit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
  } catch {
    // Audit log is advisory — never block the applier on write failure.
  }
}

function runGit(cmd, opts) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function workingTreeClean() {
  try {
    return runGit('status --porcelain') === '';
  } catch {
    return false;
  }
}

function currentBranch() {
  try {
    return runGit('rev-parse --abbrev-ref HEAD');
  } catch {
    return null;
  }
}

/**
 * Execute a patch against its target file. Returns the new file
 * contents (or throws if the patch kind is unsupported).
 */
function applyPatchToContent(targetPath, patch) {
  if (patch.kind === 'json-enum-append') {
    const full = path.join(ROOT, targetPath);
    const raw = fs.readFileSync(full, 'utf8');
    const json = JSON.parse(raw);
    // Navigate to the enum location and mutate.
    const segments = patch.instance_path.split('/').filter(Boolean);
    let node = json;
    for (const seg of segments) {
      if (node.properties && node.properties[seg]) {
        node = node.properties[seg];
      } else {
        throw new Error(`path ${patch.instance_path} not found in ${targetPath}`);
      }
    }
    if (!Array.isArray(node.enum)) {
      throw new Error(`no enum at ${patch.instance_path} in ${targetPath}`);
    }
    if (node.enum.includes(patch.new_value)) {
      // Already present — idempotent no-op.
      return raw;
    }
    node.enum = patch.new_enum;
    return JSON.stringify(json, null, 2) + '\n';
  }
  throw new Error(`unsupported patch kind: ${patch.kind}`);
}

function writeDraft(plan, reason) {
  const dir = path.join(ROOT, '.rouge', 'self-heal-drafts');
  fs.mkdirSync(dir, { recursive: true });
  const fname = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const out = path.join(dir, fname);
  fs.writeFileSync(out, JSON.stringify({ plan, reason, created_at: new Date().toISOString() }, null, 2));
  return out;
}

/**
 * Apply a plan. Returns a result object describing what happened.
 * This function is the main entry point. Keep the surface area small
 * and the contract explicit.
 */
function applyPlan(plan, opts) {
  const cfg = loadConfig();
  const dryRun = !!(opts && opts.dryRun);

  if (!cfg.enabled) {
    audit({ kind: 'self-heal-skipped', reason: 'disabled-in-config', plan_kind: plan && plan.kind });
    return { applied: false, reason: 'self-heal disabled via rouge.config.json', zone: null };
  }

  const zoneResult = classifyPlan(plan);
  audit({ kind: 'self-heal-zone', zone: zoneResult.zone, reason: zoneResult.reason, plan_kind: plan && plan.kind });

  if (zoneResult.zone === 'red') {
    return { applied: false, reason: `red-zone plan refused: ${zoneResult.reason}`, zone: 'red' };
  }

  if (zoneResult.zone === 'yellow') {
    const draftPath = writeDraft(plan, zoneResult.reason);
    audit({ kind: 'self-heal-draft', zone: 'yellow', draft_path: draftPath, plan_kind: plan.kind });
    return {
      applied: false,
      reason: 'yellow-zone plan written to draft for human review',
      zone: 'yellow',
      draft_path: draftPath,
    };
  }

  // Green zone — check config-level zones allowlist.
  if (!cfg.zones.includes('green')) {
    audit({ kind: 'self-heal-skipped', reason: 'green-not-enabled-in-config', plan_kind: plan.kind });
    return { applied: false, reason: 'green zone not enabled in rouge.config.json self_heal.zones', zone: 'green' };
  }

  if (dryRun) {
    return { applied: false, reason: 'dry-run', zone: 'green', plan };
  }

  // Baseline checks.
  if (!workingTreeClean()) {
    audit({ kind: 'self-heal-skipped', reason: 'dirty-working-tree', plan_kind: plan.kind });
    return { applied: false, reason: 'working tree has uncommitted changes — refusing to self-heal on top of user work', zone: 'green' };
  }
  const startBranch = currentBranch();
  if (!startBranch) {
    return { applied: false, reason: 'could not determine current git branch', zone: 'green' };
  }

  // Create a dedicated self-heal branch. Use a short slug so branch
  // names stay readable in git log.
  const slug = (plan.kind || 'plan').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branchName = `rouge-self-heal/${ts}-${slug}`;
  try {
    runGit(`checkout -b ${branchName}`);
  } catch (err) {
    return { applied: false, reason: `branch creation failed: ${(err.message || '').slice(0, 200)}`, zone: 'green' };
  }

  // Apply every patch in the plan.
  try {
    for (const f of plan.files) {
      const newContent = applyPatchToContent(f.path, f.patch);
      fs.writeFileSync(path.join(ROOT, f.path), newContent);
    }
  } catch (err) {
    // Revert and exit.
    runGit(`checkout ${startBranch}`, { stdio: 'pipe' });
    runGit(`branch -D ${branchName}`, { stdio: 'pipe' });
    audit({ kind: 'self-heal-revert', reason: `patch failed: ${err.message}`, branch: branchName });
    return { applied: false, reason: `patch application failed: ${(err.message || '').slice(0, 200)}`, zone: 'green' };
  }

  // Stage and commit the change before running tests so that if the
  // tests themselves make transient filesystem writes they don't
  // contaminate the plan's diff.
  try {
    runGit('add -A');
    runGit(`commit -m "rouge self-heal: ${plan.description || plan.kind}"`);
  } catch (err) {
    runGit(`checkout ${startBranch}`, { stdio: 'pipe' });
    runGit(`branch -D ${branchName}`, { stdio: 'pipe' });
    return { applied: false, reason: `commit failed: ${(err.message || '').slice(0, 200)}`, zone: 'green' };
  }

  // Run tests.
  let testsOk = false;
  let testOutput = '';
  try {
    testOutput = execSync('npm test', {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ROUGE_SKIP_CLI_TESTS: '1' },
      timeout: 300000,
      stdio: 'pipe',
    });
    testsOk = true;
  } catch (err) {
    testsOk = false;
    testOutput = ((err.stdout || '') + '\n' + (err.stderr || '')).slice(-2000);
  }

  if (!testsOk) {
    // Revert: checkout back to starting branch and delete the self-heal branch.
    runGit(`checkout ${startBranch}`, { stdio: 'pipe' });
    runGit(`branch -D ${branchName}`, { stdio: 'pipe' });
    audit({ kind: 'self-heal-revert', reason: 'tests-failed', branch: branchName, plan_kind: plan.kind, test_tail: testOutput.slice(-500) });
    return { applied: false, reason: 'self-heal reverted: tests failed after apply', zone: 'green', test_tail: testOutput.slice(-500) };
  }

  // Success: leave the branch in place for the user to merge.
  runGit(`checkout ${startBranch}`, { stdio: 'pipe' });
  audit({ kind: 'self-heal-applied', branch: branchName, plan_kind: plan.kind, description: plan.description });
  return { applied: true, zone: 'green', branch: branchName, description: plan.description };
}

module.exports = { applyPlan, loadConfig, applyPatchToContent };
