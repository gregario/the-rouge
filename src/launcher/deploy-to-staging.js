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

function deploy(projectDir) {
  const projectName = path.basename(projectDir);
  const ctxFile = path.join(projectDir, 'cycle_context.json');

  log(`Deploying ${projectName} to staging`);

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
  }

  // Supabase: push migrations
  const ctx = readJson(ctxFile);
  if (ctx?.supabase?.project_ref) {
    try {
      run(`supabase db push --project-ref ${ctx.supabase.project_ref}`, { cwd: projectDir, timeout: 60000 });
      log('Supabase migrations pushed');
    } catch {
      // No migrations to push is fine
    }
  }

  // Update cycle_context with staging URL
  if (stagingUrl && ctx) {
    ctx.infrastructure = ctx.infrastructure || {};
    ctx.infrastructure.staging_url = stagingUrl;
    ctx.deployment_url = stagingUrl;
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
