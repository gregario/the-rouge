#!/usr/bin/env node
/**
 * Infrastructure provisioning for Rouge projects.
 * Runs before the first building phase to set up Cloudflare Workers + Supabase.
 *
 * Usage: node provision-infrastructure.js <project-dir>
 */

// Named import (not destructured) so tests can mock execSync via
// t.mock.method(child_process, 'execSync', ...). Destructuring
// captures the function reference at require time, which defeats
// property-level mocking from a test.
const child_process = require('child_process');
const { execFileSync } = child_process;
const fs = require('fs');
const path = require('path');
const { log: logLine } = require('./logger.js');
const { statePath, hasStateFile } = require('./state-path.js');

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
  logLine(line);
}

function run(cmd, opts = {}) {
  log(`  $ ${cmd}`);
  return child_process.execSync(cmd, { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

// --- Cloudflare Workers setup ---

function provisionCloudflare(projectDir, projectName) {
  const wranglerPath = path.join(projectDir, 'wrangler.toml');
  const openNextPath = path.join(projectDir, 'open-next.config.ts');

  if (!fs.existsSync(wranglerPath)) {

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

  } // end if (!wranglerPath exists)

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

function getSupabaseToken(projectDir) {
  // Preferred path: Rouge's own secrets store. If the user ran
  // `rouge setup supabase`, the token is there under the 'supabase'
  // service namespace. Check this first so we find tokens stored via
  // Rouge's CLI rather than falling through to the Supabase CLI's
  // own keychain (a pre-unification bug that stranded irish-planning
  // on 2026-04-10 even though the secret was saved).
  try {
    const { getSecret } = require('./secrets.js');
    const rouge = getSecret('supabase', 'SUPABASE_ACCESS_TOKEN');
    if (rouge) return rouge;
  } catch {}
  // V1 (macOS): extract from the Supabase CLI's own keychain entry,
  // shared when the user authenticated via `supabase login`.
  // Keychain stores: "go-keyring-base64:<base64-encoded-token>"
  // Strip prefix, base64 decode to get the actual token (sbp_...)
  try {
    const raw = child_process.execSync('security find-generic-password -s "Supabase CLI" -w', { encoding: 'utf8', timeout: 5000 }).trim();
    const b64 = raw.replace('go-keyring-base64:', '');
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {}
  // V2 (Linux/Docker): env var.
  return process.env.SUPABASE_ACCESS_TOKEN || null;
}

// Cloudflare API token lookup — symmetric with getSupabaseToken. Prior
// to 2026-04-22 there was no helper; wrangler relied on the token
// already being in process.env, so a token stored via `rouge setup
// cloudflare` was unreachable. Now we merge from the secrets store.
function getCloudflareToken(projectDir) {
  try {
    const { getSecret } = require('./secrets.js');
    const rouge = getSecret('cloudflare', 'CLOUDFLARE_API_TOKEN');
    if (rouge) return rouge;
  } catch {}
  return process.env.CLOUDFLARE_API_TOKEN || null;
}

function getCloudflareAccountId(projectDir) {
  try {
    const { getSecret } = require('./secrets.js');
    const rouge = getSecret('cloudflare', 'CLOUDFLARE_ACCOUNT_ID');
    if (rouge) return rouge;
  } catch {}
  return process.env.CLOUDFLARE_ACCOUNT_ID || null;
}

// Called at the top of main() so every provisioner (supabase,
// cloudflare, sentry, stripe) sees the keychain-backed secrets as
// ambient env vars. Equivalent of what rouge-loop.js does for phase
// spawns, but for the direct provisioner path.
function mergeSecretsIntoEnv(projectDir) {
  try {
    const { loadProjectSecrets } = require('./secrets.js');
    const { env, loaded } = loadProjectSecrets(projectDir);
    for (const [k, v] of Object.entries(env)) {
      if (!process.env[k] && v) process.env[k] = v;
    }
    if (loaded.length > 0) {
      log(`Loaded ${loaded.length} secret${loaded.length === 1 ? '' : 's'} from secrets store: ${loaded.join(', ')}`);
    }
  } catch (err) {
    log(`Secrets store unavailable: ${(err.message || '').slice(0, 120)}`);
  }
}

function supabaseApi(method, path, token) {
  const cmd = `curl -s -X ${method} "https://api.supabase.com/v1${path}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`;
  return JSON.parse(child_process.execSync(cmd, { encoding: 'utf8', timeout: 30000 }));
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
      child_process.execSync(`curl -s "https://api.supabase.com/v1/projects" -H "Authorization: Bearer ${token}"`, { encoding: 'utf8', timeout: 30000 })
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
    const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR ||
      path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.rouge', 'projects');

    const isActiveRougeProject = (supabaseName) => {
      // Check all Rouge project dirs for a matching supabase ref
      if (!fs.existsSync(PROJECTS_DIR)) return false;
      const rougeDirs = fs.readdirSync(PROJECTS_DIR).filter(d =>
        hasStateFile(path.join(PROJECTS_DIR, d))
      );
      for (const dir of rougeDirs) {
        const projectDir = path.join(PROJECTS_DIR, dir);
        const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
        const state = readJson(statePath(projectDir));
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
        child_process.execSync(
          `curl -s -X POST "https://api.supabase.com/v1/projects/${toPause.ref}/pause" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`,
          { encoding: 'utf8', timeout: 30000 }
        );

        // Wait for pause to complete (poll every 10s, max 3 min)
        for (let i = 0; i < 18; i++) {
          const status = JSON.parse(
            child_process.execSync(`curl -s "https://api.supabase.com/v1/projects/${toPause.ref}" -H "Authorization: Bearer ${token}"`, { encoding: 'utf8', timeout: 10000 })
          ).status;
          log(`Supabase: ${toPause.name} status: ${status}`);
          if (status === 'INACTIVE') break;
          child_process.execSync('sleep 10');
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
    const password = child_process.execSync('openssl rand -base64 24', { encoding: 'utf8' }).trim();
    const result = run(`supabase projects create "${projectName}" --org-id ${projects[0]?.organization_id || ''} --db-password "${password}" --region eu-west-1`, {
      timeout: 60000,
    });

    // Get the project ref — try JSON list first (reliable), fall back to table parsing
    let ref = null;
    try {
      const listJson = run(`supabase projects list -o json`);
      const projects = JSON.parse(listJson);
      // Most recently created project matching our name
      const match = projects.find(p => p.name === projectName) || projects[0];
      if (match) ref = match.id;
    } catch (err) {
      // The fallback table-parse path below will try to recover, but log
      // the failure so we can spot when supabase changes its CLI output
      // shape (which has happened twice before).
      log(`Supabase: JSON projects list failed, falling back to table parse: ${err.message}`);
    }

    // Fallback: parse table output from create command
    if (!ref) {
      // Table format: "| ORG ID | REFERENCE ID | NAME | ..."
      // Match the second 20-char column (ref-id) after the first (org-id)
      const refMatch = result.match(/\|\s*\w+\s*\|\s*(\w{20})\s*\|/);
      if (refMatch) ref = refMatch[1];
    }
    if (ref) {
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
  // Unify keychain-backed secrets into process.env BEFORE any
  // provisioner reads. Previously the provisioner's per-provider
  // lookups bypassed the Rouge secrets store; tokens stored via
  // `rouge setup <provider>` were unreachable (irish-planning was
  // stuck here for 12 days). With this merge, every subsequent tool
  // spawn (wrangler, supabase, sentry-cli, stripe) inherits the
  // tokens automatically.
  mergeSecretsIntoEnv(projectDir);

  const ctxFile = path.join(projectDir, 'cycle_context.json');
  const ctx = readJson(ctxFile);
  if (!ctx) {
    log(`No cycle_context.json in ${projectDir}`);
    process.exit(1);
  }

  const infra = ctx.vision?.infrastructure || {};
  const target = infra.deployment_target;
  log(`Provisioning infrastructure for "${projectName}"`);
  log(`  needs_database: ${infra.needs_database}, needs_auth: ${infra.needs_auth}, target: ${target || '(none)'}`);

  // FIX B3: Dispatch provisioning based on declared deployment_target.
  // Previously this unconditionally called provisionCloudflare() for ALL projects,
  // which meant a project declaring deployment_target: "vercel" would still get
  // wrangler.toml, @opennextjs/cloudflare, and a Workers staging deploy. See #96.
  if (!target) {
    log('❌ No deployment_target in vision.json.infrastructure — cannot provision. Set it to one of: cloudflare, cloudflare-workers, vercel, docker-compose, docker, github-pages, gh-pages, none');
  } else if (target === 'cloudflare' || target === 'cloudflare-workers') {
    const stagingUrl = provisionCloudflare(projectDir, projectName);
    if (stagingUrl) {
      ctx.infrastructure = ctx.infrastructure || {};
      ctx.infrastructure.staging_url = stagingUrl;
      ctx.deployment_url = stagingUrl;
    }
  } else if (target === 'vercel') {
    log('Vercel: project must be linked via `vercel link` before deploy. Skipping Cloudflare provisioning.');
    log('Vercel: the deploy handler in deploy-to-staging.js handles `vercel deploy --yes --prod`.');
  } else if (target === 'docker-compose' || target === 'docker' || target === 'none') {
    log(`${target}: no cloud provisioning needed.`);
  } else if (target === 'github-pages' || target === 'gh-pages') {
    // Pages serves from the gh-pages branch; the staging deploy handler
    // (deploy-to-staging.js:deployGithubPages) owns that push. No cloud
    // provisioning step here — the project just needs a GitHub repo with
    // Pages enabled, which is outside Rouge's provisioner scope.
    log(`${target}: no cloud provisioning needed; deploy handler pushes to gh-pages branch.`);
  } else {
    log(`❌ Unknown deployment_target "${target}" — no provisioner registered. Supported: cloudflare, cloudflare-workers, vercel, docker-compose, docker, github-pages, gh-pages, none`);
  }

  // Supabase (if needed).
  //
  // Self-hosted targets (docker-compose, docker) ship their own database
  // service in the compose stack — claiming a Supabase cloud slot for
  // them would waste a slot on a product that doesn't route any traffic
  // there. Record that the DB is compose-bundled in cycle_context so
  // downstream phases (deploy, migrations) know not to expect a cloud
  // `ctx.supabase.project_ref`. See #157.
  const isSelfHosted = target === 'docker-compose' || target === 'docker';
  if ((infra.needs_database || infra.needs_auth) && isSelfHosted) {
    log('Self-hosted target: database/auth shipped inside the compose stack — skipping Supabase cloud provisioning.');
    ctx.infrastructure = ctx.infrastructure || {};
    ctx.infrastructure.database_mode = 'compose-bundled';
  } else if (infra.needs_database || infra.needs_auth) {
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

  // Auto-provision PostHog (shared project, product-tagged)
  const envFile = path.join(projectDir, '.env.local');
  let envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  if (!envContent.includes('NEXT_PUBLIC_POSTHOG_PRODUCT')) {
    const posthogLine = `\nNEXT_PUBLIC_POSTHOG_PRODUCT=${projectName}\n`;
    fs.appendFileSync(envFile, posthogLine);
    envContent += posthogLine;
    log(`PostHog: product tag "${projectName}" added to .env.local`);
  }

  // Auto-provision Sentry (create project via CLI if not configured)
  if (!envContent.includes('NEXT_PUBLIC_SENTRY_DSN') || envContent.includes('SENTRY_DSN=\n') || envContent.includes('SENTRY_DSN=""')) {
    try {
      // Create Sentry project
      const sentryOrg = process.env.SENTRY_ORG || '';
      const sentryTeam = process.env.SENTRY_TEAM || sentryOrg;
      run(`sentry-cli projects create "${projectName}" --org ${sentryOrg} --team ${sentryTeam} 2>/dev/null || true`);
      // Get DSN
      const keysOutput = run(`sentry-cli projects list-keys "${projectName}" --org ${sentryOrg} 2>/dev/null || true`);
      const dsnMatch = keysOutput.match(/(https:\/\/[a-f0-9]+@[^/]+\/\d+)/);
      if (dsnMatch) {
        fs.appendFileSync(envFile, `\nNEXT_PUBLIC_SENTRY_DSN=${dsnMatch[1]}\n`);
        log(`Sentry: project "${projectName}" created, DSN configured`);
        ctx.infrastructure = ctx.infrastructure || {};
        ctx.infrastructure.sentry_dsn = dsnMatch[1];
      } else {
        log('Sentry: project created but could not extract DSN');
      }
    } catch (err) {
      log(`Sentry: provisioning failed — ${(err.message || '').slice(0, 100)}`);
    }
  }

  // Production readiness checklist
  envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const readiness = {
    posthog: envContent.includes('POSTHOG_PRODUCT'),
    sentry: envContent.includes('SENTRY_DSN') && !envContent.includes('SENTRY_DSN=\n') && !envContent.includes('SENTRY_DSN=""'),
    supabase: !!ctx.supabase?.project_ref,
    cloudflare: !!ctx.infrastructure?.staging_url,
  };

  ctx.infrastructure = ctx.infrastructure || {};
  ctx.infrastructure.readiness = readiness;

  const missing = Object.entries(readiness).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    log(`Production readiness — missing: ${missing.join(', ')}. Set env vars in .env.local`);
  } else {
    log('Production readiness — all integrations configured');
  }

  // Write updated context
  writeJson(ctxFile, ctx);
  log('Infrastructure provisioning complete');
  log(`  staging_url: ${ctx.infrastructure?.staging_url || 'none'}`);
  log(`  supabase_ref: ${ctx.supabase?.project_ref || 'none'}`);
}

// Export internals for testing. Only run main() when invoked as a
// CLI script so `require('./provision-infrastructure.js')` from a
// test file can import the helpers without triggering the
// subprocess calls main() makes.
module.exports = {
  provisionCloudflare,
  provisionSupabase,
  getSupabaseToken,
  getCloudflareToken,
  getCloudflareAccountId,
  mergeSecretsIntoEnv,
  supabaseApi,
};

if (require.main === module) {
  main();
}
