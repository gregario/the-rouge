/**
 * Structured Rouge Doctor.
 *
 * Returns a machine-readable prerequisite check result. Consumed by both
 * the CLI (`rouge doctor`) and the dashboard setup wizard's
 * /api/system/doctor endpoint. Single source of truth — if a check is
 * added here, both surfaces get it.
 *
 * Result shape:
 *   {
 *     checks: [
 *       { id, label, status: 'ok'|'blocker'|'warning', detail, installHint? },
 *       ...
 *     ],
 *     blockers: string[],   // check ids
 *     warnings: string[],   // check ids
 *     allGreen: boolean,    // no blockers AND no warnings
 *     allRequired: boolean, // no blockers (warnings OK)
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function tryExec(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout }).trim();
  } catch {
    return null;
  }
}

function runDoctor({ ROUGE_ROOT, getSecret } = {}) {
  const checks = [];

  function push(check) { checks.push(check); }

  // Node.js version
  const nodeMajor = parseInt(process.version.slice(1), 10);
  push(nodeMajor >= 18
    ? { id: 'node', label: 'Node.js', status: 'ok', detail: `${process.version} (>= 18 required)` }
    : { id: 'node', label: 'Node.js', status: 'blocker', detail: `${process.version} — requires >= 18`, installHint: 'https://nodejs.org/' });

  // Claude Code CLI
  const claudeOut = tryExec('claude --version');
  push(claudeOut
    ? { id: 'claude', label: 'Claude Code CLI', status: 'ok', detail: claudeOut }
    : { id: 'claude', label: 'Claude Code CLI', status: 'blocker', detail: 'not found', installHint: 'npm install -g @anthropic-ai/claude-code' });

  // Git
  const gitOut = tryExec('git --version');
  push(gitOut
    ? { id: 'git', label: 'Git', status: 'ok', detail: gitOut.replace('git version ', '') }
    : { id: 'git', label: 'Git', status: 'blocker', detail: 'not found', installHint: 'https://git-scm.com/' });

  // jq (required by rouge-safety-check.sh PreToolUse hook)
  const jqOut = tryExec('jq --version');
  push(jqOut
    ? { id: 'jq', label: 'jq', status: 'ok', detail: jqOut }
    : { id: 'jq', label: 'jq', status: 'blocker', detail: 'not found — required by rouge-safety-check.sh', installHint: 'brew install jq (macOS) · apt-get install jq (Debian/Ubuntu) · https://stedolan.github.io/jq/' });

  // GitHub CLI
  const ghOut = tryExec('gh --version');
  push(ghOut
    ? { id: 'gh', label: 'GitHub CLI', status: 'ok', detail: ghOut.split('\n')[0] }
    : { id: 'gh', label: 'GitHub CLI', status: 'blocker', detail: 'not found', installHint: 'https://cli.github.com/' });

  // Slack tokens (only check if getSecret was provided)
  if (getSecret) {
    const slackBot = getSecret('slack', 'SLACK_BOT_TOKEN');
    const slackApp = getSecret('slack', 'SLACK_APP_TOKEN');
    push(slackBot && slackApp
      ? { id: 'slack', label: 'Slack tokens', status: 'ok', detail: 'configured' }
      : { id: 'slack', label: 'Slack tokens', status: 'blocker', detail: 'not configured', installHint: 'rouge setup slack' });
  }

  // Anthropic auth — mode-aware. Reports which provider(s) are configured and
  // which one the subprocess would actually pick today (env override > state
  // default of subscription).
  if (claudeOut) {
    const override = process.env.ROUGE_LLM_PROVIDER;
    const activeMode = override || 'subscription';
    const modes = [];
    // Subscription: claude login-based; the -p --max-turns 0 call hits it.
    const subOk = tryExec('claude -p "test" --max-turns 0', 10000) !== null;
    if (subOk) modes.push('subscription (claude login)');
    if (getSecret && getSecret('llm', 'ANTHROPIC_API_KEY')) modes.push('api key');
    if (getSecret && getSecret('llm', 'AWS_BEDROCK_ACCESS_KEY_ID')) modes.push('bedrock');
    if (getSecret && getSecret('llm', 'GCP_VERTEX_PROJECT')) modes.push('vertex');

    if (modes.length === 0) {
      push({ id: 'anthropic-auth', label: 'Anthropic auth', status: 'blocker', detail: 'no provider configured', installHint: 'claude login (for subscription) or configure an API key in dashboard setup' });
    } else {
      push({ id: 'anthropic-auth', label: 'Anthropic auth', status: 'ok', detail: `active: ${activeMode} · available: ${modes.join(', ')}` });
    }
  }

  // Optional: Supabase CLI
  const supabaseOut = tryExec('supabase --version');
  push(supabaseOut
    ? { id: 'supabase', label: 'Supabase CLI', status: 'ok', detail: supabaseOut }
    : { id: 'supabase', label: 'Supabase CLI', status: 'warning', detail: 'not installed (optional — needed for Supabase projects)' });

  // Optional: Vercel CLI
  const vercelOut = tryExec('vercel --version');
  push(vercelOut
    ? { id: 'vercel', label: 'Vercel CLI', status: 'ok', detail: vercelOut }
    : { id: 'vercel', label: 'Vercel CLI', status: 'warning', detail: 'not installed (optional — needed for Vercel deployments)' });

  // Optional: GStack browse
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const gstackSkillPath = path.join(home, '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse');
  const gstackFound = fs.existsSync(gstackSkillPath) || !!tryExec('which browse');
  push(gstackFound
    ? { id: 'gstack', label: 'GStack browse', status: 'ok', detail: 'installed' }
    : { id: 'gstack', label: 'GStack browse', status: 'warning', detail: 'not installed (optional — needed for web product QA)', installHint: 'git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && (cd ~/.claude/skills/gstack && ./setup)' });

  // Dashboard dependencies (only check if ROUGE_ROOT provided)
  if (ROUGE_ROOT) {
    const dashboardDir = path.join(ROUGE_ROOT, 'dashboard');
    const dashboardModules = path.join(dashboardDir, 'node_modules');
    if (fs.existsSync(dashboardModules)) {
      push({ id: 'dashboard-deps', label: 'Dashboard dependencies', status: 'ok', detail: 'installed' });
    } else if (fs.existsSync(dashboardDir)) {
      push({ id: 'dashboard-deps', label: 'Dashboard dependencies', status: 'blocker', detail: 'missing', installHint: 'npm run dashboard:install' });
    } else {
      push({ id: 'dashboard-deps', label: 'Dashboard', status: 'warning', detail: 'directory not found (optional)' });
    }
  }

  const blockers = checks.filter((c) => c.status === 'blocker').map((c) => c.id);
  const warnings = checks.filter((c) => c.status === 'warning').map((c) => c.id);

  return {
    checks,
    blockers,
    warnings,
    allGreen: blockers.length === 0 && warnings.length === 0,
    allRequired: blockers.length === 0,
  };
}

function formatDoctorText(result) {
  const lines = [];
  lines.push('');
  lines.push('  Rouge Doctor');
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push('');
  for (const check of result.checks) {
    const icon = check.status === 'ok' ? '\u2705' : check.status === 'blocker' ? '\u274C' : '\u26A0\uFE0F ';
    lines.push(`  ${icon} ${check.label} ${check.status === 'ok' ? '' : '— '}${check.detail}`.replace(/\s+$/, ''));
    if (check.status !== 'ok' && check.installHint) {
      lines.push(`       Install: ${check.installHint}`);
    }
  }
  lines.push('');
  lines.push(`  ${'─'.repeat(40)}`);
  if (result.allGreen) {
    lines.push("  All checks passed. You're ready to build.");
  } else if (result.allRequired) {
    lines.push(`  All required checks passed. ${result.warnings.length} optional warning${result.warnings.length > 1 ? 's' : ''}.`);
  } else {
    lines.push(`  ${result.blockers.length} blocker${result.blockers.length > 1 ? 's' : ''} found. Fix these before running Rouge:`);
    for (const id of result.blockers) {
      const c = result.checks.find((x) => x.id === id);
      lines.push(`    - ${c.label}: ${c.detail}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = { runDoctor, formatDoctorText };
