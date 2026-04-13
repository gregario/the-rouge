#!/usr/bin/env node
/**
 * Deploy a project to Cloudflare Workers staging + push Supabase migrations.
 * Used by: provision-infrastructure.js, rouge-loop.js (after building/qa-fixing).
 *
 * Usage: node deploy-to-staging.js <project-dir>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROUGE_ROOT = path.resolve(__dirname, '../..');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function log(msg) {
  const line = `[${new Date().toISOString().slice(0, 19)}Z] [deploy] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(ROUGE_ROOT, 'logs', 'rouge.log'), line + '\n');
}

function run(cmd, opts) {
  log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', timeout: 120000, stdio: 'pipe', ...opts });
}

function getDeploymentVersion(projectDir) {
  try {
    const output = run('npx wrangler deployments list --env staging 2>/dev/null || true', { cwd: projectDir });
    // Extract the most recent deployment ID
    const match = output.match(/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function healthCheck(url) {
  try {
    const output = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}"`, {
      encoding: 'utf8', timeout: 15000,
    });
    const status = parseInt(output.trim(), 10);
    return status >= 200 && status < 400;
  } catch {
    return false;
  }
}

function rollback(projectDir, versionId, reason) {
  log(`ROLLING BACK to ${versionId}: ${reason}`);
  try {
    run(`npx wrangler rollback ${versionId} --env staging --yes --message "Auto-rollback: ${reason}"`, { cwd: projectDir });
    log('Rollback successful');
    return true;
  } catch (err) {
    log(`Rollback FAILED: ${(err.message || '').slice(0, 200)}`);
    return false;
  }
}

/**
 * Determine the deployment target for a project.
 *
 * The ONLY source of truth is `vision.json.infrastructure.deployment_target`.
 * This function never silently defaults to cloudflare (or anything else) — that
 * behaviour caused #96, where a construction-coordinator build declared "vercel"
 * in vision.json but was silently routed to Cloudflare through an if/else
 * fallthrough. If the field is missing, return null — the deploy() function
 * will refuse to proceed and log a clear error.
 *
 * @param {string} projectDir absolute path to the project
 * @returns {string|null} the explicit deploy target slug, or null if not declared
 */
function detectDeployTarget(projectDir) {
  const vision = readJson(path.join(projectDir, 'vision.json'));
  const declared = vision?.infrastructure?.deployment_target;
  return declared || null;
}

// Handler registry — one entry per supported deploy target. Adding a new
// target = adding one entry here. Unknown targets error with a clear message
// instead of silently falling through to cloudflare. See #96.
const DEPLOY_HANDLERS = {
  'vercel': deployVercel,
  'cloudflare': deployCloudflare,
  'cloudflare-workers': deployCloudflare, // alias used in vision.json.infrastructure
};

function deployVercel(projectDir) {
  // Vercel: deploy via CLI (project must be linked via .vercel/project.json).
  // Use --prod because Vercel Hobby plan preview URLs return 401 (auth required).
  // Production deploys are publicly accessible for health checks.
  run('npx vercel deploy --yes --prod', {
    cwd: projectDir,
    env: { ...process.env },
    timeout: 180000,
  });
  // Use the stable project URL for health checks, not the deployment-specific URL.
  // Vercel Hobby plan returns 401 on deployment-specific URLs even with --prod.
  const projectJson = readJson(path.join(projectDir, '.vercel', 'project.json'));
  const projectName = projectJson?.projectName || path.basename(projectDir);
  const stagingUrl = `https://${projectName}.vercel.app`;
  log(`Deployed to ${stagingUrl}`);
  return stagingUrl;
}

function deployCloudflare(projectDir) {
  // `@opennextjs/cloudflare build` routinely exceeds the 120s default on cold
  // caches; bump to 5 minutes for the Cloudflare build chain.
  run('npm run build', { cwd: projectDir, timeout: 300000 });
  run('npx @opennextjs/cloudflare build', { cwd: projectDir, timeout: 300000 });
  const output = run('npx wrangler deploy --env staging', { cwd: projectDir, timeout: 300000 });
  const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
  if (urlMatch) {
    const stagingUrl = urlMatch[0];
    log(`Deployed to ${stagingUrl}`);
    return stagingUrl;
  }
  log('⚠️  Could not extract deploy URL from `wrangler deploy` output. Health check and rollback will be skipped. First 500 chars of output follow:');
  log(output.slice(0, 500));
  return null;
}

function deploy(projectDir) {
  const projectName = path.basename(projectDir);
  const ctxFile = path.join(projectDir, 'cycle_context.json');
  const target = detectDeployTarget(projectDir);

  if (!target) {
    log(`❌ Deploy refused: ${projectName} has no vision.json.infrastructure.deployment_target declared. Set it to one of: ${Object.keys(DEPLOY_HANDLERS).join(', ')}. Rouge will not guess a deploy target — see #96.`);
    return null;
  }

  const handler = DEPLOY_HANDLERS[target];
  if (!handler) {
    log(`❌ Deploy refused: ${projectName} declared deployment_target="${target}" but no handler is registered. Supported targets: ${Object.keys(DEPLOY_HANDLERS).join(', ')}. See #96 and DEPLOY_HANDLERS in deploy-to-staging.js to add a new target.`);
    return null;
  }

  log(`Deploying ${projectName} to staging (target: ${target})`);

  // Cloudflare-only: capture current deployment version for rollback
  const isCloudflare = target === 'cloudflare' || target === 'cloudflare-workers';
  const previousVersion = isCloudflare ? getDeploymentVersion(projectDir) : null;
  if (previousVersion) {
    log(`Previous deployment: ${previousVersion}`);
  }

  let stagingUrl = null;
  try {
    stagingUrl = handler(projectDir);
  } catch (err) {
    // execSync surfaces command output on err.stderr / err.stdout — prefer
    // stderr (where wrangler/vercel/supabase put actual errors) so the
    // escalation has enough signal to diagnose without a manual re-run.
    const detail = (err && (err.stderr || err.stdout || err.message)) || String(err);
    log(`${target} deploy failed: ${String(detail).slice(0, 500)}`);
    return null;
  }

  // Health check — verify the deploy actually works
  if (stagingUrl) {
    log('Running post-deploy health check...');
    const healthy = healthCheck(stagingUrl);
    if (healthy) {
      log('Health check PASSED');
    } else {
      log('Health check FAILED — site not responding');
      if (previousVersion) {
        rollback(projectDir, previousVersion, 'post-deploy health check failed');
        // Cloudflare edge propagation takes ~10s after a rollback; hitting
        // the URL immediately often reads the still-broken edge cache and
        // makes the "verified" log a coin flip. Wait before verifying.
        log('Waiting 10s for edge propagation before verifying rollback...');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
        if (healthCheck(stagingUrl)) {
          log('Rollback verified — previous version is healthy');
        } else {
          log('Rollback verification failed — URL still unhealthy after propagation window');
        }
      }
      return null; // deploy failed
    }
  }

  // Supabase: push migrations with safety checks
  const ctx = readJson(ctxFile);
  if (ctx?.supabase?.project_ref) {
    const ref = ctx.supabase.project_ref;
    try {
      const migrationDir = path.join(projectDir, 'supabase', 'migrations');
      const migrations = fs.existsSync(migrationDir)
        ? fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()
        : [];

      if (migrations.length === 0) {
        log('Supabase: no migrations to push');
      } else {
        // Step 1: Dry run — preview what would be applied
        log('Supabase: running migration dry-run...');
        let dryRunOutput = '';
        try {
          dryRunOutput = run(`supabase db push --project-ref ${ref} --dry-run`, { cwd: projectDir, timeout: 60000 });
          log(`Supabase dry-run:\n${dryRunOutput.slice(0, 500)}`);
        } catch (err) {
          dryRunOutput = err.stdout || err.message || '';
          log(`Supabase dry-run output:\n${dryRunOutput.slice(0, 500)}`);
        }

        // Step 2: Check for destructive operations
        // Dotall (`s`) so `.*` in the DELETE-without-WHERE lookahead crosses
        // newlines — without it, `DELETE FROM t\n  WHERE x=1` is misread as
        // a destructive unconditional delete.
        const destructivePatterns = /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b(?!\s+.*\bWHERE\b)|\bALTER\s+.*\bTYPE\b/is;
        const pendingMigrations = migrations.map(f =>
          fs.readFileSync(path.join(migrationDir, f), 'utf8')
        ).join('\n');

        const hasDestructive = destructivePatterns.test(pendingMigrations);

        if (hasDestructive) {
          log('⚠️  Supabase: DESTRUCTIVE migration detected (DROP/TRUNCATE/ALTER TYPE)');
          // Log which migration files contain destructive ops
          for (const f of migrations) {
            const content = fs.readFileSync(path.join(migrationDir, f), 'utf8');
            if (destructivePatterns.test(content)) {
              log(`  Destructive: ${f}`);
            }
          }
          // Block autonomous execution — require human approval
          log('Supabase: blocking destructive migration — requires human approval');
          ctx.migration_blocked = {
            reason: 'destructive operations detected',
            files: migrations.filter(f => destructivePatterns.test(
              fs.readFileSync(path.join(migrationDir, f), 'utf8')
            )),
            dry_run: dryRunOutput.slice(0, 1000),
            timestamp: new Date().toISOString(),
          };
          writeJson(ctxFile, ctx);
          // Don't push — the builder will see this and escalate
        } else {
          // Step 3: Safe migration — push it
          run(`supabase db push --project-ref ${ref}`, { cwd: projectDir, timeout: 60000 });
          log('Supabase migrations pushed successfully');

          // Track migration history
          ctx.infrastructure = ctx.infrastructure || {};
          if (!ctx.infrastructure.migration_history) ctx.infrastructure.migration_history = [];
          ctx.infrastructure.migration_history.push({
            files: migrations,
            timestamp: new Date().toISOString(),
            cycle: ctx._cycle_number || 0,
            destructive: false,
          });
          if (ctx.infrastructure.migration_history.length > 10) {
            ctx.infrastructure.migration_history = ctx.infrastructure.migration_history.slice(-10);
          }
          writeJson(ctxFile, ctx);
        }
      }
    } catch (err) {
      log(`Supabase migration failed: ${(err.message || '').slice(0, 200)}`);
    }
  }

  // Update cycle_context with staging URL and deployment info
  if (stagingUrl && ctx) {
    ctx.infrastructure = ctx.infrastructure || {};
    ctx.infrastructure.staging_url = stagingUrl;
    ctx.deployment_url = stagingUrl;

    // Track deployment history for audit trail
    if (!ctx.infrastructure.deploy_history) ctx.infrastructure.deploy_history = [];
    const newVersion = getDeploymentVersion(projectDir);
    ctx.infrastructure.deploy_history.push({
      version: newVersion,
      previous: previousVersion,
      url: stagingUrl,
      timestamp: new Date().toISOString(),
      cycle: ctx._cycle_number || 0,
    });
    // Keep last 10 deploys
    if (ctx.infrastructure.deploy_history.length > 10) {
      ctx.infrastructure.deploy_history = ctx.infrastructure.deploy_history.slice(-10);
    }

    writeJson(ctxFile, ctx);
  }

  return stagingUrl;
}

// CLI mode
if (require.main === module) {
  const projectDir = process.argv[2];
  if (!projectDir) {
    console.error('Usage: node deploy-to-staging.js <project-dir>');
    process.exit(1);
  }
  deploy(projectDir);
}

module.exports = { deploy };
