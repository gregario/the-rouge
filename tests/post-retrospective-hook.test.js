'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  runPostRetrospective,
  readRecentCycles,
  amendmentsLogPath,
  governanceLogPath,
  validateAmendment,
  hasHighSignalRetro,
} = require('../src/launcher/post-retrospective-hook.js');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-post-retro-'));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('validateAmendment accepts well-formed amendment', () => {
  const v = validateAmendment({
    target: 'library/global/page-load-time.json',
    rationale: 'Shadow variant outperformed baseline across 5 cycles',
  });
  assert.equal(v.ok, true);
});

test('validateAmendment rejects missing target', () => {
  const v = validateAmendment({ rationale: 'valid rationale here' });
  assert.equal(v.ok, false);
  assert.match(v.reason, /target/);
});

test('validateAmendment rejects short rationale', () => {
  const v = validateAmendment({ target: 'x', rationale: 'ok' });
  assert.equal(v.ok, false);
  assert.match(v.reason, /rationale/);
});

test('validateAmendment rejects non-object', () => {
  assert.equal(validateAmendment(null).ok, false);
  assert.equal(validateAmendment('string').ok, false);
});

test('hasHighSignalRetro true when amendments_proposed has entries', () => {
  assert.equal(
    hasHighSignalRetro({ amendments_proposed: [{ target: 'x', rationale: 'y' }] }),
    true
  );
});

test('hasHighSignalRetro true when failed.length >= 3', () => {
  assert.equal(
    hasHighSignalRetro({ failed: [{}, {}, {}] }),
    true
  );
});

test('hasHighSignalRetro false when empty or < 3 failed', () => {
  assert.equal(hasHighSignalRetro({}), false);
  assert.equal(hasHighSignalRetro({ failed: [{}, {}] }), false);
  assert.equal(hasHighSignalRetro(null), false);
});

test('runPostRetrospective queues well-formed amendments and writes governance events', () => {
  const dir = tmpProject();
  const ctx = {
    amendments_proposed: [
      {
        target: 'library/global/page-load-time.json',
        type: 'heuristic-variant',
        amendment_id: 'amendment-2026-04-23-lcp-2500',
        rationale: 'Shadow variant pass rate 1.0 vs baseline 0.7 over 5 cycles',
        evidence_refs: ['.rouge/heuristic-runs.jsonl lines 12-16'],
      },
      {
        target: 'src/prompts/loop/01-building.md',
        type: 'prompt-amendment',
        amendment_id: 'amendment-2026-04-23-retrieval',
        rationale: 'Factory re-reads same 3 files across stories; add caching hint',
      },
    ],
  };
  const state = { cycle_number: 7, project_name: 'test-project' };
  const result = runPostRetrospective(dir, ctx, state);
  assert.equal(result.amendments_queued, 2);
  assert.equal(result.governance_events, 2);  // 2 amendments + 0 retro summary (no structured_retro)
  assert.equal(result.errors.length, 0);
  const amendments = readJsonl(amendmentsLogPath(dir));
  assert.equal(amendments.length, 2);
  assert.equal(amendments[0].project, 'test-project');
  assert.equal(amendments[0].cycle_number, 7);
  assert.ok(amendments[0].queued_at);
  const gov = readJsonl(governanceLogPath(dir));
  assert.equal(gov.length, 2);
  assert.ok(gov.some((e) => e.category === 'amendment-promotion'));
  assert.ok(gov.some((e) => e.category === 'self-improve-proposal'));
});

test('runPostRetrospective reads amendments from structured_retro when top-level absent', () => {
  const dir = tmpProject();
  const ctx = {
    structured_retro: {
      amendments_proposed: [
        { target: 'x', rationale: 'valid rationale text' },
      ],
    },
  };
  const result = runPostRetrospective(dir, ctx, { cycle_number: 1, project_name: 'p' });
  assert.equal(result.amendments_queued, 1);
});

test('runPostRetrospective emits retro summary event when high-signal', () => {
  const dir = tmpProject();
  const ctx = {
    structured_retro: {
      worked: [{ area: 'a', observation: 'b' }],
      failed: [{ area: 'x', observation: 'y' }, { area: 'x', observation: 'y2' }, { area: 'z', observation: 'w' }],
      untried: [],
      amendments_proposed: [],
    },
  };
  const result = runPostRetrospective(dir, ctx, { cycle_number: 3, project_name: 'p' });
  // no amendments, but high-signal because failed.length === 3 → summary event
  assert.equal(result.amendments_queued, 0);
  assert.equal(result.governance_events, 1);
  const gov = readJsonl(governanceLogPath(dir));
  assert.equal(gov[0].category, 'escalation-resolved');
  assert.match(gov[0].summary, /3 failed/);
});

test('runPostRetrospective skips malformed amendments with errors[]', () => {
  const dir = tmpProject();
  const ctx = {
    amendments_proposed: [
      { rationale: 'missing target' },
      { target: 'x', rationale: 'ok' },
      null,
      { target: 'valid', rationale: 'valid rationale text' },
    ],
  };
  const result = runPostRetrospective(dir, ctx, { cycle_number: 1, project_name: 'p' });
  // ok, short-rationale rejected, null rejected, valid accepted
  // "missing target" rejected (no target), "x" with rationale "ok" rejected (rationale too short: "ok" is 2 chars)
  assert.equal(result.amendments_queued, 1);
  assert.equal(result.skipped, 3);
  assert.ok(result.errors.length >= 3);
});

test('runPostRetrospective no-op when no amendments and no structured_retro', () => {
  const dir = tmpProject();
  const result = runPostRetrospective(dir, {}, { cycle_number: 1, project_name: 'p' });
  assert.equal(result.amendments_queued, 0);
  assert.equal(result.governance_events, 0);
  assert.ok(!fs.existsSync(amendmentsLogPath(dir)));
});

test('runPostRetrospective handles null cycleContext', () => {
  const dir = tmpProject();
  const result = runPostRetrospective(dir, null, { cycle_number: 1, project_name: 'p' });
  assert.equal(result.amendments_queued, 0);
});

test('runPostRetrospective returns error on missing projectDir', () => {
  const result = runPostRetrospective(null, {}, {});
  assert.match(result.errors[0], /projectDir required/);
});

test('amendments log and governance log land in .rouge subdir', () => {
  assert.ok(amendmentsLogPath('/tmp/x').endsWith('.rouge/amendments-proposed.jsonl')
         || amendmentsLogPath('/tmp/x').endsWith('.rouge\\amendments-proposed.jsonl'));
  assert.ok(governanceLogPath('/tmp/x').endsWith('.rouge/governance.jsonl')
         || governanceLogPath('/tmp/x').endsWith('.rouge\\governance.jsonl'));
});

test('readRecentCycles reads journey.json when present', () => {
  const dir = tmpProject();
  const journey = [
    { cycle: 1, commit_breakdown: { fix: 2, feature: 8 } },
    { cycle: 2, commit_breakdown: { fix: 3, feature: 7 } },
  ];
  fs.writeFileSync(path.join(dir, 'journey.json'), JSON.stringify(journey));
  const cycles = readRecentCycles(dir, {});
  assert.equal(cycles.length, 2);
  assert.equal(cycles[0].cycle, 1);
});

test('readRecentCycles falls back to cycle_context.previous_cycles', () => {
  const dir = tmpProject();
  const ctx = { previous_cycles: [{ cycle: 1 }, { cycle: 2 }] };
  const cycles = readRecentCycles(dir, ctx);
  assert.equal(cycles.length, 2);
});

test('readRecentCycles appends current cycle_context.journey_entry', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'journey.json'), JSON.stringify([{ cycle: 1 }, { cycle: 2 }]));
  const ctx = { journey_entry: { cycle: 3, commit_breakdown: { fix: 5, feature: 5 } } };
  const cycles = readRecentCycles(dir, ctx);
  assert.equal(cycles.length, 3);
  assert.equal(cycles[2].cycle, 3);
});

test('runPostRetrospective: no audit signal when cycles are healthy', () => {
  const dir = tmpProject();
  const journey = [
    { cycle: 1, commit_breakdown: { fix: 1, feature: 9 } },
    { cycle: 2, commit_breakdown: { fix: 2, feature: 8 } },
    { cycle: 3, commit_breakdown: { fix: 0, feature: 10 } },
  ];
  fs.writeFileSync(path.join(dir, 'journey.json'), JSON.stringify(journey));
  const result = runPostRetrospective(dir, {}, { cycle_number: 4, project_name: 'p' });
  assert.equal(result.audit_recommended, false);
});

test('runPostRetrospective: audit signal fires on 3 cycles of fix-mode', () => {
  const dir = tmpProject();
  const journey = [
    { cycle: 1, commit_breakdown: { fix: 8, feature: 2 } },
    { cycle: 2, commit_breakdown: { fix: 9, feature: 1 } },
    { cycle: 3, commit_breakdown: { fix: 7, feature: 3 } },
  ];
  fs.writeFileSync(path.join(dir, 'journey.json'), JSON.stringify(journey));
  const result = runPostRetrospective(dir, {}, { cycle_number: 4, project_name: 'p' });
  assert.equal(result.audit_recommended, true);
  assert.ok(result.governance_events >= 1);
  const gov = readJsonl(governanceLogPath(dir));
  const auditEvent = gov.find((e) => e.detail && e.detail.type === 'audit-recommended');
  assert.ok(auditEvent, 'expected an audit-recommended governance event');
  assert.equal(auditEvent.severity, 'warning');
  assert.ok(auditEvent.detail.signals.length >= 1);
});

test('runPostRetrospective: audit recommender never crashes the hook', () => {
  const dir = tmpProject();
  // Malformed journey — the recommender should cope
  fs.writeFileSync(path.join(dir, 'journey.json'), 'not valid json');
  const result = runPostRetrospective(dir, {}, { cycle_number: 1, project_name: 'p' });
  // Should not throw; may or may not recommend depending on fallback data
  assert.ok(typeof result.audit_recommended === 'boolean');
});

test('immutable append: running twice accumulates entries', () => {
  const dir = tmpProject();
  const ctx = {
    amendments_proposed: [{ target: 'x', rationale: 'rationale one' }],
  };
  runPostRetrospective(dir, ctx, { cycle_number: 1, project_name: 'p' });
  runPostRetrospective(dir, {
    amendments_proposed: [{ target: 'y', rationale: 'rationale two' }],
  }, { cycle_number: 2, project_name: 'p' });
  const amendments = readJsonl(amendmentsLogPath(dir));
  assert.equal(amendments.length, 2);
  assert.equal(amendments[0].target, 'x');
  assert.equal(amendments[1].target, 'y');
  assert.equal(amendments[0].cycle_number, 1);
  assert.equal(amendments[1].cycle_number, 2);
});
