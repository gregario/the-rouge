'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  checkStackCapability,
  checkIntegrationAvailability,
  checkFileSurface,
  checkBudgetRemaining,
  checkRecurrence,
  assessCapability,
  fingerprintFinding,
  SIGNALS,
  DEFAULT_RECURRENCE_THRESHOLD,
} = require('../src/launcher/capability-check.js');

// =========================================================================
// Signal 1: Stack capability
// =========================================================================

test('stack: browser-only finding against targets_browser=false → fail', () => {
  const finding = {
    description: 'Map does not render because WebGL is unavailable',
    suggested_fix: 'Initialize WebGL context before map mount',
  };
  const ctx = { profile: { stack_hints: { targets_browser: false } } };
  const r = checkStackCapability(finding, ctx);
  assert.equal(r.verdict, 'fail');
  assert.match(r.detail, /webgl/i);
});

test('stack: browser-only finding against targets_browser=true → pass', () => {
  const finding = { description: 'WebGL context missing' };
  const ctx = { profile: { stack_hints: { targets_browser: true } } };
  const r = checkStackCapability(finding, ctx);
  assert.equal(r.verdict, 'pass');
});

test('stack: GPS on non-browser → fail', () => {
  const finding = { description: 'Needs GPS for current location' };
  const r = checkStackCapability(finding, { profile: { stack_hints: { targets_browser: false } } });
  assert.equal(r.verdict, 'fail');
});

test('stack: backend-only capability on frontend-only profile → fail', () => {
  const finding = { description: 'Needs a cron job to rotate keys' };
  const ctx = { profile: { stack_hints: { targets_browser: true, uses_db: false } } };
  const r = checkStackCapability(finding, ctx);
  assert.equal(r.verdict, 'fail');
  assert.match(r.detail, /cron job/);
});

test('stack: unknown profile stack_hints → pass (conservative)', () => {
  const finding = { description: 'Needs WebGL' };
  const r = checkStackCapability(finding, {});
  assert.equal(r.verdict, 'pass');
});

test('stack: no finding text → pass', () => {
  const r = checkStackCapability({}, { profile: { stack_hints: { targets_browser: false } } });
  assert.equal(r.verdict, 'pass');
});

test('stack: accepts stack_hints at context root (not just context.profile)', () => {
  const r = checkStackCapability(
    { description: 'Canvas drawing' },
    { stack_hints: { targets_browser: false } }
  );
  assert.equal(r.verdict, 'fail');
});

// =========================================================================
// Signal 2: Integration availability
// =========================================================================

test('integration: stripe referenced but not in catalog → fail', () => {
  const finding = { suggested_fix: 'Use Stripe Checkout Session for the paywall' };
  const ctx = { availableIntegrations: ['supabase', 'sentry'] };
  const r = checkIntegrationAvailability(finding, ctx);
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.missing_integrations, ['stripe']);
});

test('integration: stripe referenced and in catalog → pass', () => {
  const finding = { suggested_fix: 'Use stripe checkout session' };
  const ctx = { availableIntegrations: ['stripe'] };
  const r = checkIntegrationAvailability(finding, ctx);
  assert.equal(r.verdict, 'pass');
});

test('integration: multiple services, some missing → fail with all missing listed', () => {
  const finding = {
    description: 'Add Stripe paywall and Sentry error tracking',
  };
  const ctx = { availableIntegrations: ['supabase'] };
  const r = checkIntegrationAvailability(finding, ctx);
  assert.equal(r.verdict, 'fail');
  assert.ok(r.missing_integrations.includes('stripe'));
  assert.ok(r.missing_integrations.includes('sentry'));
});

test('integration: finding mentions no known service → pass', () => {
  const finding = { description: 'Fix typo in button label' };
  const r = checkIntegrationAvailability(finding, { availableIntegrations: [] });
  assert.equal(r.verdict, 'pass');
});

test('integration: empty availableIntegrations + irrelevant finding → pass', () => {
  const r = checkIntegrationAvailability({ description: 'update CSS' }, {});
  assert.equal(r.verdict, 'pass');
});

// =========================================================================
// Signal 3: File surface
// =========================================================================

test('file-surface: blocked path in finding.file → fail', () => {
  const finding = { file: 'src/launcher/rouge-loop.js' };
  const r = checkFileSurface(finding, {});
  assert.equal(r.verdict, 'fail');
  assert.ok(r.blocked_files.includes('src/launcher/rouge-loop.js'));
});

test('file-surface: rouge.config.json → fail', () => {
  const finding = { files: ['src/app.ts', 'rouge.config.json'] };
  const r = checkFileSurface(finding, {});
  assert.equal(r.verdict, 'fail');
});

test('file-surface: parent-path traversal → fail', () => {
  const finding = { file: '../../etc/passwd' };
  const r = checkFileSurface(finding, {});
  assert.equal(r.verdict, 'fail');
});

test('file-surface: ordinary src files → pass', () => {
  const finding = { file_refs: ['src/components/button.tsx', 'src/lib/api.ts'] };
  const r = checkFileSurface(finding, {});
  assert.equal(r.verdict, 'pass');
});

test('file-surface: no file references → pass', () => {
  const r = checkFileSurface({ description: 'just a note' }, {});
  assert.equal(r.verdict, 'pass');
});

// =========================================================================
// Signal 4: Budget remaining
// =========================================================================

test('budget: insufficient → fail', () => {
  const r = checkBudgetRemaining({}, {
    budget_remaining_usd: 1.0,
    estimated_fix_cost_usd: 3.0,
    estimated_attempts: 2,
  });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.projected_cost, 6.0);
});

test('budget: sufficient → pass', () => {
  const r = checkBudgetRemaining({}, {
    budget_remaining_usd: 100.0,
    estimated_fix_cost_usd: 2.0,
    estimated_attempts: 2,
  });
  assert.equal(r.verdict, 'pass');
});

test('budget: no budget_remaining_usd supplied → pass', () => {
  const r = checkBudgetRemaining({}, {});
  assert.equal(r.verdict, 'pass');
  assert.match(r.detail, /no budget_remaining_usd/);
});

test('budget: uses defaults when only budget_remaining provided', () => {
  const r = checkBudgetRemaining({}, { budget_remaining_usd: 10.0 });
  assert.equal(r.verdict, 'pass');  // defaults: $2 × 2 = $4 < $10
});

test('budget: defaults give projected $4 which fails against $3 remaining', () => {
  const r = checkBudgetRemaining({}, { budget_remaining_usd: 3.0 });
  assert.equal(r.verdict, 'fail');
});

// =========================================================================
// Signal 5: Recurrence
// =========================================================================

test('recurrence: insufficient history → pass', () => {
  const finding = { description: 'x', severity: 'HIGH', file: 'a.ts' };
  const r = checkRecurrence(finding, { priorCycleFindings: [[finding]] });
  assert.equal(r.verdict, 'pass');
  assert.match(r.detail, /insufficient history/);
});

test('recurrence: same finding in last 2 cycles → fail', () => {
  const finding = { description: 'button does nothing', severity: 'HIGH', file: 'btn.tsx' };
  const priorCycleFindings = [
    [finding],  // cycle N-2
    [finding],  // cycle N-1
  ];
  const r = checkRecurrence(finding, { priorCycleFindings });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.cycles_matched, 2);
});

test('recurrence: finding in only 1 of last 2 cycles → pass', () => {
  const finding = { description: 'x', severity: 'HIGH', file: 'a.ts' };
  const other = { description: 'y', severity: 'HIGH', file: 'b.ts' };
  const r = checkRecurrence(finding, { priorCycleFindings: [[finding], [other]] });
  assert.equal(r.verdict, 'pass');
});

test('recurrence: respects custom threshold', () => {
  const finding = { description: 'x', severity: 'HIGH' };
  const r = checkRecurrence(finding, {
    priorCycleFindings: [[finding], [finding], [finding]],
    recurrenceThreshold: 3,
  });
  assert.equal(r.verdict, 'fail');
  assert.equal(r.cycles_matched, 3);
});

test('recurrence: empty prior cycles → pass', () => {
  const r = checkRecurrence({ description: 'x' }, { priorCycleFindings: [] });
  assert.equal(r.verdict, 'pass');
});

test('recurrence: malformed prior cycle (non-array) treated as non-matching', () => {
  const finding = { description: 'x', severity: 'HIGH' };
  const r = checkRecurrence(finding, {
    priorCycleFindings: [{ bogus: 'not an array' }, [finding]],
  });
  // Second cycle matches but first doesn't → not all match → pass
  assert.equal(r.verdict, 'pass');
});

test('fingerprintFinding: same content → same hash', () => {
  const a = { description: 'same', severity: 'HIGH', file: 'x.ts' };
  const b = { description: 'same', severity: 'HIGH', file: 'x.ts' };
  assert.equal(fingerprintFinding(a), fingerprintFinding(b));
});

test('fingerprintFinding: different content → different hash', () => {
  const a = { description: 'one', severity: 'HIGH', file: 'x.ts' };
  const b = { description: 'two', severity: 'HIGH', file: 'x.ts' };
  assert.notEqual(fingerprintFinding(a), fingerprintFinding(b));
});

// =========================================================================
// Orchestrator: assessCapability
// =========================================================================

test('orchestrator: all signals pass → feasible', () => {
  const finding = {
    id: 'fix-1',
    description: 'Add error boundary',
    file: 'src/app.tsx',
    severity: 'MEDIUM',
  };
  const ctx = {
    profile: { stack_hints: { targets_browser: true } },
    availableIntegrations: [],
    budget_remaining_usd: 100,
    priorCycleFindings: [],
  };
  const r = assessCapability(finding, ctx);
  assert.equal(r.capability_feasible, true);
  assert.equal(r.recommended_route, 'analyze');
  assert.equal(r.escalation_reason, undefined);
  assert.equal(r.finding_id, 'fix-1');
});

test('orchestrator: one signal fails → infeasible + escalate', () => {
  const finding = {
    id: 'fix-2',
    description: 'Need WebGL for map',
    severity: 'HIGH',
  };
  const ctx = {
    profile: { stack_hints: { targets_browser: false } },
    availableIntegrations: [],
    budget_remaining_usd: 100,
  };
  const r = assessCapability(finding, ctx);
  assert.equal(r.capability_feasible, false);
  assert.equal(r.recommended_route, 'escalate');
  assert.equal(r.escalation_reason, 'capability-gap');
  const stackSignal = r.signals.find((s) => s.name === 'stack-capability');
  assert.equal(stackSignal.verdict, 'fail');
});

test('orchestrator: multiple signals fail → all listed in signals[]', () => {
  const finding = {
    id: 'fix-3',
    description: 'Need WebGL AND stripe checkout session',
    file: 'src/launcher/foo.js',  // blocked path too
    severity: 'HIGH',
  };
  const ctx = {
    profile: { stack_hints: { targets_browser: false } },
    availableIntegrations: [],
    budget_remaining_usd: 0.5,  // below default fix cost
  };
  const r = assessCapability(finding, ctx);
  assert.equal(r.capability_feasible, false);
  const failedSignals = r.signals.filter((s) => s.verdict === 'fail').map((s) => s.name);
  assert.ok(failedSignals.includes('stack-capability'));
  assert.ok(failedSignals.includes('integration-availability'));
  assert.ok(failedSignals.includes('file-surface'));
  assert.ok(failedSignals.includes('budget-remaining'));
});

test('orchestrator: missing_capabilities flattened from signals', () => {
  const finding = { id: 'x', description: 'need stripe and sentry', severity: 'HIGH' };
  const ctx = {
    profile: { stack_hints: { targets_browser: true } },
    availableIntegrations: [],
    budget_remaining_usd: 100,
  };
  const r = assessCapability(finding, ctx);
  assert.ok(r.missing_capabilities.includes('stripe'));
  assert.ok(r.missing_capabilities.includes('sentry'));
});

test('orchestrator: signal throws → treated as pass (doesn\'t abort)', () => {
  // Simulate by passing a finding that causes a signal to error. The
  // try/catch inside assessCapability should catch it.
  const r = assessCapability(null, {});
  assert.ok(r);  // didn't throw
  assert.ok(Array.isArray(r.signals));
});

test('orchestrator: finding_id falls back to category then (anon)', () => {
  const r1 = assessCapability({ category: 'cat' }, {});
  assert.equal(r1.finding_id, 'cat');
  const r2 = assessCapability({}, {});
  assert.equal(r2.finding_id, '(anon)');
});

test('orchestrator: every signal invoked in SIGNALS is present in output', () => {
  const r = assessCapability({ id: 'x' }, {});
  const names = r.signals.map((s) => s.name);
  for (const { name } of SIGNALS) {
    assert.ok(names.includes(name), `signal ${name} missing from output`);
  }
});

test('DEFAULT_RECURRENCE_THRESHOLD is 2 (fires before audit-recommender\'s 3)', () => {
  assert.equal(DEFAULT_RECURRENCE_THRESHOLD, 2);
});
