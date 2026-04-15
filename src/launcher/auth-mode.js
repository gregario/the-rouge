/**
 * Multi-provider Claude auth mux.
 *
 * Phase A of LLM provider support — pure plumbing, no UI. Given a project
 * state and the keychain-loaded secrets env, produce the spawn env that
 * routes Claude Code to the chosen provider (subscription | api | bedrock |
 * vertex).
 *
 * Precedence for selecting the mode:
 *   1. ROUGE_LLM_PROVIDER env var (CI / power-user override)
 *   2. state.authMode
 *   3. default 'subscription'
 *
 * Subscription mode MUST remove any inherited ANTHROPIC_API_KEY from the
 * child env — Claude Code warns on dual creds and can silently bill the
 * user's API account instead of using the subscription. Verified 2026-04-15.
 */

const VALID_MODES = ['subscription', 'api', 'bedrock', 'vertex'];

function resolveAuthMode(state) {
  const override = process.env.ROUGE_LLM_PROVIDER;
  if (override && VALID_MODES.includes(override)) return override;
  const stateMode = state && state.authMode;
  if (stateMode && VALID_MODES.includes(stateMode)) return stateMode;
  return 'subscription';
}

/**
 * Build the env for `spawn('claude', …)` based on auth mode.
 *
 * @param {object} opts
 * @param {object} [opts.state] — project state.json contents (may be null)
 * @param {Record<string,string>} [opts.secretsEnv] — keychain-loaded secrets
 * @param {Record<string,string>} [opts.baseEnv] — starting env (defaults to process.env)
 * @returns {{ env: Record<string,string>, mode: string }}
 */
function buildClaudeEnv({ state, secretsEnv = {}, baseEnv = process.env } = {}) {
  const mode = resolveAuthMode(state);
  const env = { ...baseEnv, ...secretsEnv };

  // Scrub every provider-selection var first. Each mode sets only what it needs.
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.CLAUDE_CODE_USE_VERTEX;

  if (mode === 'api') {
    const key = secretsEnv.ANTHROPIC_API_KEY || baseEnv.ANTHROPIC_API_KEY;
    if (key) env.ANTHROPIC_API_KEY = key;
  } else if (mode === 'bedrock') {
    env.CLAUDE_CODE_USE_BEDROCK = '1';
    const id = secretsEnv.AWS_BEDROCK_ACCESS_KEY_ID || baseEnv.AWS_BEDROCK_ACCESS_KEY_ID;
    const secret = secretsEnv.AWS_BEDROCK_SECRET_ACCESS_KEY || baseEnv.AWS_BEDROCK_SECRET_ACCESS_KEY;
    const region = secretsEnv.AWS_BEDROCK_REGION || baseEnv.AWS_BEDROCK_REGION || baseEnv.AWS_REGION;
    if (id) env.AWS_ACCESS_KEY_ID = id;
    if (secret) env.AWS_SECRET_ACCESS_KEY = secret;
    if (region) env.AWS_REGION = region;
  } else if (mode === 'vertex') {
    env.CLAUDE_CODE_USE_VERTEX = '1';
    const project = secretsEnv.GCP_VERTEX_PROJECT || baseEnv.GCP_VERTEX_PROJECT;
    const region = secretsEnv.GCP_VERTEX_REGION || baseEnv.GCP_VERTEX_REGION;
    const adc = secretsEnv.GCP_VERTEX_ADC || baseEnv.GCP_VERTEX_ADC;
    if (project) env.ANTHROPIC_VERTEX_PROJECT_ID = project;
    if (region) env.CLOUD_ML_REGION = region;
    if (adc) env.GOOGLE_APPLICATION_CREDENTIALS = adc;
  }
  // subscription mode: no provider vars set (already scrubbed above)

  return { env, mode };
}

module.exports = { buildClaudeEnv, resolveAuthMode, VALID_MODES };
