/**
 * Centralized denylist for Claude subprocess spawns.
 *
 * Empirical finding (2026-04-16): `--disallowedTools` is enforced by the
 * Claude CLI even when `--dangerously-skip-permissions` is also set. This
 * means the Rouge loop can block provider-CLI abuse right now without
 * waiting to drop the dangerous flag (which remains needed so the
 * autonomous loop doesn't hang on prompts for allowed-but-not-pre-approved
 * tools).
 *
 * Derived from docs/design/phase-tool-surface.md. Vendor-specific denies
 * merge in from library/vendors/<name>/manifest.json via vendors.js.
 */

const { loadVendors, mergedDenyPatterns } = require('./vendors');

const ROUGE_CORE_DENY = [
  // Provider CLIs — must route through INFRA_ACTION_HANDLERS, never direct shell.
  'Bash(vercel *)',
  'Bash(npx vercel *)',
  'Bash(supabase *)',
  'Bash(npx supabase *)',
  'Bash(gh *)',
  'Bash(wrangler *)',
  'Bash(npx wrangler *)',
  'Bash(flyctl *)',
  'Bash(fly *)',
  'Bash(aws *)',
  'Bash(gcloud *)',
  'Bash(heroku *)',
  // Git: push only via git-push intent (enforces no-force).
  'Bash(git push *)',
  // Filesystem destructive.
  'Bash(rm -rf *)',
  // Network fetch → web-fetch intent.
  'Bash(curl *)',
  'Bash(wget *)',
];

let _cachedArgs = null;
let _cachedErrors = null;

/**
 * Returns the argv slice to append to `spawn('claude', [...])` calls so that
 * the Rouge-core denylist plus every discovered vendor's deny_patterns are
 * enforced. Cached after first call.
 *
 * @returns {{ args: string[], errors: string[] }}
 */
function buildDenylistArgs({ reload = false } = {}) {
  if (_cachedArgs && !reload) {
    return { args: _cachedArgs, errors: _cachedErrors };
  }
  const { vendors, errors } = loadVendors();
  const merged = [...new Set([...ROUGE_CORE_DENY, ...mergedDenyPatterns(vendors)])];
  _cachedArgs = merged.length === 0 ? [] : ['--disallowedTools', ...merged];
  _cachedErrors = errors;
  return { args: _cachedArgs, errors: _cachedErrors };
}

module.exports = {
  ROUGE_CORE_DENY,
  buildDenylistArgs,
};
