#!/usr/bin/env node
/**
 * Infrastructure provisioning for Rouge projects.
 * Runs before the first building phase to set up Cloudflare Workers + Supabase.
 *
 * Usage: node provision-infrastructure.js <project-dir>
 */

const { execSync, execFileSync } = require('child_process');
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
  const line = `[${new Date().toISOString().slice(0, 19)}Z] [provision] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(ROUGE_ROOT, 'logs', 'rouge.log'), line + '\n');
}

function run(cmd, opts = {}) {
  log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

// --- Cloudflare Workers setup ---

function provisionCloudflare(projectDir, projectName) {
  const wranglerPath = path.join(projectDir, 'wrangler.toml');
  const openNextPath = path.join(projectDir, 'open-next.config.ts');

  if (fs.existsSync(wranglerPath)) {
    log('Cloudflare: wrangler.toml already exists');
    return;
  }

  log('Cloudflare: creating wrangler.toml and open-next.config.ts');

  fs.writeFileSync(wranglerPath, `name = "${projectName}"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]
main = ".open-next/worker.js"

[assets]
directory = ".open-next/assets"

[env.staging]
name = "${projectName}-staging"

[vars]
ENVIRONMENT = "production"

[env.staging.vars]
ENVIRONMENT = "staging"
`);

  if (!fs.existsSync(openNextPath)) {
    fs.writeFileSync(openNextPath, `import type { OpenNextConfig } from '@opennextjs/cloudflare';

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: 'cloudflare-node',
      converter: 'edge',
      proxyExternalRequest: 'fetch',
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
  },
  edgeExternals: ['node:crypto'],
  middleware: {
    external: true,
    override: {
      wrapper: 'cloudflare-edge',
      converter: 'edge',
      proxyExternalRequest: 'fetch',
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
  },
};

export default config;
`);
  }

  // Install OpenNext if not already a dependency
  const pkg = readJson(path.join(projectDir, 'package.json'));
  const hasOpenNext = pkg?.devDependencies?.['@opennextjs/cloudflare'] || pkg?.dependencies?.['@opennextjs/cloudflare'];
  if (!hasOpenNext) {
    log('Cloudflare: installing @opennextjs/cloudflare');
    try {
      run('npm install -D @opennextjs/cloudflare wrangler', { cwd: projectDir, timeout: 120000 });
    } catch (err) {
      log(`Cloudflare: npm install failed: ${err.message.slice(0, 200)}`);
    }
  }

  // Build: Next.js first, then OpenNext
  log('Cloudflare: building Next.js app');
  try {
    run('npm run build', { cwd: projectDir, timeout: 120000 });
  } catch (err) {
    log(`Cloudflare: Next.js build failed: ${err.message.slice(0, 200)}`);
    // Try OpenNext directly — some setups don't need separate Next.js build
  }

  log('Cloudflare: building with OpenNext');
  try {
    run('npx @opennextjs/cloudflare build', { cwd: projectDir, timeout: 120000 });
  } catch (err) {
    log(`Cloudflare: OpenNext build failed: ${err.message.slice(0, 200)}`);
    return null;
  }

  log('Cloudflare: deploying to staging');
  try {
    const output = run('npx wrangler deploy --env staging', { cwd: projectDir, timeout: 120000 });
    // Extract staging URL from output
    const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
    if (urlMatch) {
      log(`Cloudflare: staging deployed at ${urlMatch[0]}`);
      return urlMatch[0];
    }
    log('Cloudflare: deployed but could not extract URL');
    return null;
  } catch (err) {
    log(`Cloudflare: deploy failed: ${err.message.slice(0, 200)}`);
    return null;
  }
}

// --- Supabase setup ---

function getSupabaseToken() {
  // V1 (macOS): extract from keychain and base64 decode
  try {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -w', { encoding: 'utf8', timeout: 5000 }).trim();
    // Decode base64 in Node.js (no shell pipe needed)
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {}
  // V2 (Linux/Docker): env var
  return process.env.SUPABASE_ACCESS_TOKEN || null;
}

function supabaseApi(method, path, token) {
  const cmd = `curl -s -X ${method} "https://api.supabase.com/v1${path}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`;
  return JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));
}

function provisionSupabase(projectDir, projectName) {
  const token = getSupabaseToken();
  if (!token) {
    log('Supabase: no token found — skipping');
    return null;
  }

  // Check if already provisioned
  const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
  if (ctx?.supabase?.project_ref) {
    log(`Supabase: already provisioned (${ctx.supabase.project_ref})`);
    return ctx.supabase.project_ref;
  }

  // Check active slot count
  log('Supabase: checking slot availability');
  let projects;
  try {
    projects = JSON.parse(
      execSync(`curl -s "https://api.supabase.com/v1/projects" -H "Authorization: Bearer ${token}"`, { encoding: 'utf8', timeout: 30000 })
    );
  } catch (err) {
    log(`Supabase: failed to list projects: ${err.message.slice(0, 200)}`);
    return null;
  }

  const active = projects.filter(p => p.status === 'ACTIVE_HEALTHY' || p.status === 'COMING_UP');
  log(`Supabase: ${active.length}/2 slots used`);

  if (active.length >= 2) {
    // Slot rotation: find a project NOT actively managed by Rouge to pause.
    // Rouge-managed projects have a state.json in PROJECTS_DIR/<name>/ with state != complete.
    // Non-Rouge projects (manual, other tools) are always eligible to pause.
    const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR || path.join(ROUGE_ROOT, 'projects');

    const isActiveRougeProject = (supabaseName) => {
      // Check all Rouge project dirs for a matching supabase ref
      if (!fs.existsSync(PROJECTS_DIR)) return false;
      const rougeDirs = fs.readdirSync(PROJECTS_DIR).filter(d =>
        fs.existsSync(path.join(PROJECTS_DIR, d, 'state.json'))
      );
      for (const dir of rougeDirs) {
        const ctx = readJson(path.join(PROJECTS_DIR, dir, 'cycle_context.json'));
        const state = readJson(path.join(PROJECTS_DIR, dir, 'state.json'));
        if (ctx?.supabase?.project_ref && state?.current_state !== 'complete') {
          // This Rouge project is actively using a Supabase slot
          if (supabaseName.includes(dir) || dir.includes(supabaseName)) return true;
        }
      }
      return false;
    };

    // Find eligible projects to pause (not actively Rouge-managed)
    const eligible = active.filter(p => !isActiveRougeProject(p.name));

    if (eligible.length > 0) {
      const toPause = eligible[0]; // Pause the first eligible
      log(`Supabase: 2/2 slots used — pausing idle project: ${toPause.name} (${toPause.ref})`);

      try {
        execSync(
          `curl -s -X POST "https://api.supabase.com/v1/projects/${toPause.ref}/pause" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`,
          { encoding: 'utf8', timeout: 30000 }
        );

        // Wait for pause to complete (poll every 10s, max 3 min)
        for (let i = 0; i < 18; i++) {
          const status = JSON.parse(
            execSync(`curl -s "https://api.supabase.com/v1/projects/${toPause.ref}" -H "Authorization: Bearer ${token}"`, { encoding: 'utf8', timeout: 10000 })
          ).status;
          log(`Supabase: ${toPause.name} status: ${status}`);
          if (status === 'INACTIVE') break;
          execSync('sleep 10');
        }
        log(`Supabase: ${toPause.name} paused — slot freed`);
      } catch (err) {
        log(`Supabase: failed to pause ${toPause.name}: ${err.message.slice(0, 200)}`);
        return null;
      }
    } else {
      // All 2 slots are active Rouge projects — can't start a 3rd
      log('Supabase: 2/2 slots are active Rouge projects — cannot provision a 3rd. Skipping.');
      return null;
    }
  }

  // Create new project
  log(`Supabase: creating project "${projectName}"`);
  try {
    const password = execSync('openssl rand -base64 24', { encoding: 'utf8' }).trim();
    const result = run(`supabase projects create "${projectName}" --org-id ${projects[0]?.organization_id || ''} --db-password "${password}" --region eu-west-1`, {
      timeout: 60000,
    });

    // Get the project ref
    const refMatch = result.match(/([a-z]{20})/);
    if (refMatch) {
      const ref = refMatch[1];
      log(`Supabase: project created (ref: ${ref})`);

      // Get API keys
      try {
        const keys = JSON.parse(run(`supabase projects api-keys --project-ref ${ref} -o json`));
        const anonKey = keys.find(k => k.name === 'anon')?.api_key;
        const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;

        log('Supabase: API keys retrieved');
        return { ref, anonKey, serviceKey, url: `https://${ref}.supabase.co` };
      } catch {
        log('Supabase: created but failed to get API keys');
        return { ref };
      }
    }
  } catch (err) {
    log(`Supabase: creation failed: ${err.message.slice(0, 200)}`);
    return null;
  }

  return null;
}

// --- Main ---

function main() {
  const projectDir = process.argv[2];
  if (!projectDir) {
    console.error('Usage: node provision-infrastructure.js <project-dir>');
    process.exit(1);
  }

  const projectName = path.basename(projectDir);
  const ctxFile = path.join(projectDir, 'cycle_context.json');
  const ctx = readJson(ctxFile);
  if (!ctx) {
    log(`No cycle_context.json in ${projectDir}`);
    process.exit(1);
  }

  const infra = ctx.vision?.infrastructure || {};
  log(`Provisioning infrastructure for "${projectName}"`);
  log(`  needs_database: ${infra.needs_database}, needs_auth: ${infra.needs_auth}, target: ${infra.deployment_target}`);

  // Cloudflare Workers (always — all web products deploy here)
  const stagingUrl = provisionCloudflare(projectDir, projectName);
  if (stagingUrl) {
    ctx.infrastructure = ctx.infrastructure || {};
    ctx.infrastructure.staging_url = stagingUrl;
    ctx.deployment_url = stagingUrl;
  }

  // Supabase (if needed)
  if (infra.needs_database || infra.needs_auth) {
    const supaResult = provisionSupabase(projectDir, projectName);
    if (supaResult) {
      ctx.supabase = ctx.supabase || {};
      if (typeof supaResult === 'object') {
        ctx.supabase.project_ref = supaResult.ref;
        ctx.supabase.slot_acquired = true;
        ctx.supabase.connection_string = supaResult.url || null;
        ctx.infrastructure = ctx.infrastructure || {};
        ctx.infrastructure.supabase_url = supaResult.url || null;
        ctx.infrastructure.supabase_anon_key = supaResult.anonKey || null;
      } else {
        ctx.supabase.project_ref = supaResult;
        ctx.supabase.slot_acquired = true;
      }
    }
  }

  // Write updated context
  writeJson(ctxFile, ctx);
  log('Infrastructure provisioning complete');
  log(`  staging_url: ${ctx.infrastructure?.staging_url || 'none'}`);
  log(`  supabase_ref: ${ctx.supabase?.project_ref || 'none'}`);
}

main();
