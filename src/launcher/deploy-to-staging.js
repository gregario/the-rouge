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

function deploy(projectDir) {
  const projectName = path.basename(projectDir);
  const ctxFile = path.join(projectDir, 'cycle_context.json');

  log(`Deploying ${projectName} to staging`);

  // Capture current deployment version for rollback
  const previousVersion = getDeploymentVersion(projectDir);
  if (previousVersion) {
    log(`Previous deployment: ${previousVersion}`);
  }

  // Cloudflare: build + deploy
  let stagingUrl = null;
  try {
    run('npm run build', { cwd: projectDir });
    run('npx @opennextjs/cloudflare build', { cwd: projectDir });
    const output = run('npx wrangler deploy --env staging', { cwd: projectDir });
    const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
    if (urlMatch) {
      stagingUrl = urlMatch[0];
      log(`Deployed to ${stagingUrl}`);
    }
  } catch (err) {
    log(`Cloudflare deploy failed: ${(err.message || '').slice(0, 200)}`);
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
        // Re-check after rollback
        if (healthCheck(stagingUrl)) {
          log('Rollback verified — previous version is healthy');
        }
      }
      return null; // deploy failed
    }
  }

  // Supabase: push migrations
  const ctx = readJson(ctxFile);
  if (ctx?.supabase?.project_ref) {
    try {
      const migrationDir = path.join(projectDir, 'supabase', 'migrations');
      const hasMigrations = fs.existsSync(migrationDir) && fs.readdirSync(migrationDir).some(f => f.endsWith('.sql'));
      if (hasMigrations) {
        run(`supabase db push --project-ref ${ctx.supabase.project_ref}`, { cwd: projectDir, timeout: 60000 });
        log('Supabase migrations pushed');
      } else {
        log('Supabase: no migrations to push');
      }
    } catch (err) {
      log(`Supabase migration push failed: ${(err.message || '').slice(0, 200)}`);
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
