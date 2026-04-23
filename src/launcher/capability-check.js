/**
 * capability-check.js — P1.21 capability-check gate.
 *
 * Runs deterministic signals against a blocking finding to decide whether
 * Rouge's current capabilities can actually produce a fix for it. If not,
 * the analyzer routes to escalation with `classification: capability-gap`
 * instead of attempting a fix that's structurally impossible.
 *
 * Five deterministic signal functions (pure, no I/O):
 *   1. checkStackCapability     — does the fix require a browser API /
 *                                 language feature the profile doesn't support?
 *   2. checkIntegrationAvailability — is there a catalog pattern for the
 *                                     service / integration this fix mentions?
 *   3. checkFileSurface         — is the implied write target within the
 *                                 factory's allowed paths?
 *   4. checkBudgetRemaining     — is there enough budget left for an
 *                                 estimated fix attempt (cost-tracker data)?
 *   5. checkRecurrence          — has this finding fingerprint appeared in
 *                                 the last N cycles without resolution?
 *
 * Plus `assessCapability(finding, context)` — orchestrator that runs all
 * signals, collects verdicts, returns the capability_assessment shape the
 * analyzer writes to cycle_context.
 *
 * Design principles (adversarially reviewed):
 *
 *   - Signals are ANDed into a single feasibility verdict. ANY fail →
 *     capability_feasible: false. Conservative by design; a false positive
 *     (gate says "can't fix" but we could) escalates to human, which is
 *     cheaper than an endless loop (the failure mode being prevented).
 *
 *   - All signal functions are PURE — no fs, no exec, no network. Data the
 *     signals need is gathered by the caller and passed in via `context`.
 *     This makes per-signal unit testing trivial and isolates flakiness.
 *
 *   - The module never throws on bad input. Missing fields → signal
 *     returns `verdict: 'pass', detail: 'insufficient data to flag'`.
 *     Silent pass on malformed input means the gate is permissive under
 *     uncertainty — downstream systems (audit-recommender P1.13,
 *     spin-detector) still catch genuine endless loops at cycle 3+.
 *
 *   - Confidence: the gate is the FIRST-LINE defense against endless loops;
 *     audit-recommender is the SECOND-LINE. Both must be active to get
 *     full coverage. If the gate has a bug that false-negatives, the
 *     loop still terminates via audit-recommender after 3 cycles.
 */

'use strict';

const { fingerprintReport } = require('./findings-fingerprint.js');

// ---------------------------------------------------------------------------
// Signal 1 — Stack capability
// ---------------------------------------------------------------------------
//
// Fails when the finding references a capability the profile declares
// unsupported. Conservative: only flags when the mismatch is clear.
//
// Browser-only capability keywords that can't be satisfied in a non-browser
// stack. If the profile declares targets_browser === false AND the finding
// mentions any of these → capability gap.

const BROWSER_ONLY_CAPABILITIES = [
  'webgl', 'canvas', 'geolocation', 'gps', 'camera', 'microphone',
  'localstorage', 'sessionstorage', 'indexeddb', 'serviceworker',
  'notification api', 'web audio', 'webrtc', 'fullscreen api',
  'clipboard', 'drag and drop',
];

// Backend-only capability keywords that can't be satisfied in a browser-only
// stack. If profile has no backend AND finding needs these → capability gap.
const BACKEND_ONLY_CAPABILITIES = [
  'cron job', 'background worker', 'database migration',
  'server-side rendering' /* SSR */, 'webhook endpoint',
  'websocket server', 'scheduled task',
];

function extractSearchText(finding) {
  if (!finding || typeof finding !== 'object') return '';
  const parts = [
    finding.description,
    finding.suggested_fix,
    finding.detail,
    finding.observation,
    finding.evidence,
    finding.evidence_span,
  ].filter((s) => typeof s === 'string');
  return parts.join(' ').toLowerCase();
}

function checkStackCapability(finding, context = {}) {
  const stackHints = (context.profile && context.profile.stack_hints) || context.stack_hints || {};
  const targetsBrowser = stackHints.targets_browser;
  const usesBackend = stackHints.uses_db !== undefined ? stackHints.uses_db : true;
  const text = extractSearchText(finding);
  if (!text) return { verdict: 'pass', detail: 'no finding text to analyze' };

  // If profile explicitly targets_browser: false and finding mentions
  // browser-only capabilities → gap.
  if (targetsBrowser === false) {
    const matched = BROWSER_ONLY_CAPABILITIES.find((kw) => text.includes(kw));
    if (matched) {
      return {
        verdict: 'fail',
        detail: `finding references browser-only capability '${matched}' but profile stack_hints.targets_browser is false`,
      };
    }
  }

  // If profile has no backend (uses_db false AND targets_browser true only)
  // and finding mentions backend-only → gap.
  if (usesBackend === false && targetsBrowser === true) {
    const matched = BACKEND_ONLY_CAPABILITIES.find((kw) => text.includes(kw));
    if (matched) {
      return {
        verdict: 'fail',
        detail: `finding references backend-only capability '${matched}' but profile has no backend (uses_db=false)`,
      };
    }
  }

  return { verdict: 'pass', detail: 'finding within profile stack capabilities' };
}

// ---------------------------------------------------------------------------
// Signal 2 — Integration availability
// ---------------------------------------------------------------------------
//
// Fails when finding mentions a service/integration that has no catalog
// pattern (tier-2 or tier-3). Caller passes in a list of known integration
// slugs from integration-catalog.loadAll() so this module stays I/O-free.

// Service/integration keywords commonly referenced in findings. If a
// finding mentions one and the integration isn't in the catalog →
// capability gap. This is a keyword approximation; LLM advisory signal
// (not in this module) catches misses.

const SERVICE_KEYWORDS = {
  stripe: ['stripe', 'checkout session', 'payment intent'],
  supabase: ['supabase', 'row level security', 'rls policy'],
  sentry: ['sentry', 'error tracking', 'crash report'],
  resend: ['resend', 'transactional email'],
  postmark: ['postmark'],
  clerk: ['clerk'],
  auth0: ['auth0'],
  vercel: ['vercel', 'vercel edge'],
  cloudflare: ['cloudflare', 'workers', 'durable objects'],
  'maps-maplibre': ['maplibre', 'mapbox gl', 'map rendering'],
  'neon-postgres': ['neon postgres', 'neondb'],
  'web-push': ['web push', 'push notification'],
};

function checkIntegrationAvailability(finding, context = {}) {
  const availableIntegrations = Array.isArray(context.availableIntegrations)
    ? context.availableIntegrations
    : [];
  const text = extractSearchText(finding);
  if (!text) return { verdict: 'pass', detail: 'no finding text to analyze' };

  const needed = [];
  for (const [slug, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) needed.push(slug);
  }

  if (needed.length === 0) {
    return { verdict: 'pass', detail: 'finding does not reference a known integration' };
  }

  const missing = needed.filter((slug) => !availableIntegrations.includes(slug));
  if (missing.length > 0) {
    return {
      verdict: 'fail',
      detail: `finding references integration(s) [${missing.join(', ')}] not in library catalog`,
      missing_integrations: missing,
    };
  }

  return { verdict: 'pass', detail: `all referenced integrations available: ${needed.join(', ')}` };
}

// ---------------------------------------------------------------------------
// Signal 3 — File surface
// ---------------------------------------------------------------------------
//
// Fails when finding explicitly targets files outside the factory's writable
// surface (e.g., references src/launcher/ when that's blocked by self-improve
// safety; references ../../ parent paths; references system paths).

const BLOCKED_PATH_PATTERNS = [
  /^\/etc\//,          // system config
  /^\/var\//,          // system var
  /^\/usr\//,          // system usr
  /\.\.\/\.\.\//,      // two+ levels up
  /^src\/launcher\//,  // Rouge launcher (self-improve boundary)
  /^rouge\.config\.json$/,
  /^\.claude\/settings\.json$/,
];

function checkFileSurface(finding, context = {}) {
  // Fields that might reference files: finding.file, finding.files,
  // finding.file_refs, finding.suggested_fix (we parse), finding.evidence_span
  const fileRefs = [];
  if (typeof finding?.file === 'string') fileRefs.push(finding.file);
  if (Array.isArray(finding?.files)) fileRefs.push(...finding.files.filter((f) => typeof f === 'string'));
  if (Array.isArray(finding?.file_refs)) fileRefs.push(...finding.file_refs.filter((f) => typeof f === 'string'));

  if (fileRefs.length === 0) return { verdict: 'pass', detail: 'no file references in finding' };

  const blocked = fileRefs.filter((ref) =>
    BLOCKED_PATH_PATTERNS.some((pat) => pat.test(ref))
  );
  if (blocked.length > 0) {
    return {
      verdict: 'fail',
      detail: `finding targets files outside writable surface: ${blocked.join(', ')}`,
      blocked_files: blocked,
    };
  }

  return { verdict: 'pass', detail: 'all file references within writable surface' };
}

// ---------------------------------------------------------------------------
// Signal 4 — Budget remaining
// ---------------------------------------------------------------------------
//
// Fails when the estimated cost of fixing this finding exceeds the remaining
// budget. Pure function: caller computes remaining budget + cost estimate and
// passes them in.

const DEFAULT_ESTIMATED_FIX_COST_USD = 2.0;   // one avg fix attempt
const DEFAULT_ESTIMATED_FIX_ATTEMPTS = 2;     // avg attempts per fix story

function checkBudgetRemaining(finding, context = {}) {
  const { budget_remaining_usd, estimated_fix_cost_usd, estimated_attempts } = context;
  if (typeof budget_remaining_usd !== 'number') {
    return { verdict: 'pass', detail: 'no budget_remaining_usd supplied' };
  }
  const perAttempt = typeof estimated_fix_cost_usd === 'number'
    ? estimated_fix_cost_usd : DEFAULT_ESTIMATED_FIX_COST_USD;
  const attempts = typeof estimated_attempts === 'number'
    ? estimated_attempts : DEFAULT_ESTIMATED_FIX_ATTEMPTS;
  const projected = perAttempt * attempts;
  if (budget_remaining_usd < projected) {
    return {
      verdict: 'fail',
      detail: `projected fix cost $${projected.toFixed(2)} exceeds remaining budget $${budget_remaining_usd.toFixed(2)}`,
      projected_cost: projected,
      budget_remaining: budget_remaining_usd,
    };
  }
  return { verdict: 'pass', detail: `remaining budget $${budget_remaining_usd.toFixed(2)} covers projected cost $${projected.toFixed(2)}` };
}

// ---------------------------------------------------------------------------
// Signal 5 — Recurrence
// ---------------------------------------------------------------------------
//
// Fails when the same finding fingerprint appears in the last N cycles
// without resolution. N=2 (vs audit-recommender's N=3) so this gate catches
// the loop one cycle earlier.

const DEFAULT_RECURRENCE_THRESHOLD = 2;

function fingerprintFinding(finding) {
  if (!finding) return '';
  // Use the existing fingerprintReport on a minimal shape so we inherit
  // its canonicalization (sorted keys, whitespace-normalized findings).
  const shape = {
    verdict: finding.severity || 'unknown',
    findings: [
      finding.description || finding.detail || finding.observation || '',
      finding.file || '',
      finding.category || '',
    ].filter(Boolean),
  };
  return fingerprintReport(shape);
}

function checkRecurrence(finding, context = {}) {
  const priorFindings = Array.isArray(context.priorCycleFindings)
    ? context.priorCycleFindings : [];
  const threshold = typeof context.recurrenceThreshold === 'number'
    ? context.recurrenceThreshold : DEFAULT_RECURRENCE_THRESHOLD;

  if (priorFindings.length < threshold) {
    return { verdict: 'pass', detail: `insufficient history (${priorFindings.length} < ${threshold})` };
  }

  const currentFp = fingerprintFinding(finding);
  if (!currentFp) return { verdict: 'pass', detail: 'finding not fingerprintable' };

  // Check the last `threshold` cycles — require ALL to contain this fingerprint.
  const recentCycles = priorFindings.slice(-threshold);
  const allMatch = recentCycles.every((cycle) => {
    if (!Array.isArray(cycle)) return false;
    return cycle.some((f) => fingerprintFinding(f) === currentFp);
  });

  if (allMatch) {
    return {
      verdict: 'fail',
      detail: `same finding fingerprint in last ${threshold} cycles — fixes aren't landing`,
      fingerprint: currentFp,
      cycles_matched: threshold,
    };
  }
  return { verdict: 'pass', detail: 'no recurrence pattern detected' };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const SIGNALS = [
  { name: 'stack-capability', fn: checkStackCapability },
  { name: 'integration-availability', fn: checkIntegrationAvailability },
  { name: 'file-surface', fn: checkFileSurface },
  { name: 'budget-remaining', fn: checkBudgetRemaining },
  { name: 'recurrence', fn: checkRecurrence },
];

/**
 * Main entry point. Runs all signals, returns capability_assessment shape.
 *
 * @param {object} finding - the blocking finding being assessed
 * @param {object} context - data the signals need:
 *    profile, stack_hints, availableIntegrations, budget_remaining_usd,
 *    estimated_fix_cost_usd, estimated_attempts, priorCycleFindings,
 *    recurrenceThreshold
 * @returns {{
 *    finding_id: string,
 *    capability_feasible: boolean,
 *    signals: Array<{name, verdict, detail, ...}>,
 *    recommended_route: 'escalate' | 'analyze',
 *    escalation_reason?: string,
 *    missing_capabilities: string[]
 * }}
 */
function assessCapability(finding, context = {}) {
  const results = [];
  for (const sig of SIGNALS) {
    let res;
    try {
      res = sig.fn(finding, context);
    } catch (e) {
      res = { verdict: 'pass', detail: `signal error (treated as pass): ${e.message}` };
    }
    results.push({ name: sig.name, ...res });
  }

  const failingSignals = results.filter((r) => r.verdict === 'fail');
  const feasible = failingSignals.length === 0;
  const missing = [];
  for (const r of failingSignals) {
    if (Array.isArray(r.missing_integrations)) missing.push(...r.missing_integrations);
  }

  const assessment = {
    finding_id: finding?.id || finding?.category || '(anon)',
    capability_feasible: feasible,
    signals: results,
    recommended_route: feasible ? 'analyze' : 'escalate',
    missing_capabilities: missing,
  };
  if (!feasible) {
    assessment.escalation_reason = 'capability-gap';
  }
  return assessment;
}

module.exports = {
  checkStackCapability,
  checkIntegrationAvailability,
  checkFileSurface,
  checkBudgetRemaining,
  checkRecurrence,
  assessCapability,
  fingerprintFinding,
  SIGNALS,
  // constants for tests
  BROWSER_ONLY_CAPABILITIES,
  BACKEND_ONLY_CAPABILITIES,
  SERVICE_KEYWORDS,
  BLOCKED_PATH_PATTERNS,
  DEFAULT_ESTIMATED_FIX_COST_USD,
  DEFAULT_ESTIMATED_FIX_ATTEMPTS,
  DEFAULT_RECURRENCE_THRESHOLD,
};
