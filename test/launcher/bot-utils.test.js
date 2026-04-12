/**
 * Unit tests for pure utility functions from src/slack/bot.js.
 *
 * bot.js is a Slack app entry point — it requires @slack/bolt and initialises
 * the app at module scope, so we cannot require() it directly. Instead we
 * replicate the pure-logic functions here (copied verbatim) and test them.
 *
 * If the source changes, grep for the function name in bot.js and update here.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Extracted pure functions (copied from src/slack/bot.js)
// ---------------------------------------------------------------------------

const SEEDING_DISCIPLINES = [
  'brainstorming', 'competition', 'taste', 'spec',
  'infrastructure', 'design', 'legal-privacy', 'marketing',
];

function updateDisciplineTracker(seedState, disciplineName) {
  if (!seedState.disciplines) seedState.disciplines = {};
  const normalised = String(disciplineName || '').trim().toLowerCase();
  if (!normalised) return;
  const existing = seedState.disciplines[normalised] || { runs: 0 };
  seedState.disciplines[normalised] = {
    status: 'complete',
    completed_at: new Date().toISOString(),
    runs: (existing.runs || 0) + 1,
  };
}

function buildResumingFromStateBlock(seedState) {
  const disciplines = seedState && seedState.disciplines;
  if (!disciplines || Object.keys(disciplines).length === 0) return '';

  const completed = [];
  const pending = [];
  for (const name of SEEDING_DISCIPLINES) {
    const entry = disciplines[name];
    if (entry && entry.status === 'complete') {
      completed.push(name);
    } else {
      pending.push(name);
    }
  }

  const lines = [
    '[RESUMING FROM STATE — authoritative, trust over your own memory]',
    `Completed disciplines (${completed.length}/${SEEDING_DISCIPLINES.length}): ${completed.join(', ') || '(none)'}`,
    `Remaining disciplines: ${pending.join(', ') || '(none)'}`,
    'Do not re-run any discipline marked complete. Resume at the next remaining discipline. If the previous output left a discipline mid-work, restart that discipline cleanly from its opening — do not try to patch around where you think you stopped.',
    '[END STATE]',
    '',
    '',
  ];
  return lines.join('\n');
}

function isRateLimited(text) {
  if (!text) return false;
  if (text.length > 200) return false;
  const lower = text.toLowerCase();
  return lower.includes('hit your limit') ||
         lower.includes('too many requests') ||
         (lower.includes('resets ') && lower.includes('limit'));
}

function tryParseClaudeOutput(raw) {
  try { return JSON.parse(raw); } catch {}
  const jsonMatch = raw.match(/\{[\s\S]*"result"[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return null;
}

// Marker regex used in bot.js lines 1139, 1171, 1324, 1347
const DISCIPLINE_COMPLETE_RE = /\[DISCIPLINE_COMPLETE:\s*(\S+)\]/g;

// ---------------------------------------------------------------------------
// generateCycleContext needs filesystem fixtures. We build a helper that
// mirrors the real function's logic but operates on a temp directory.
// ---------------------------------------------------------------------------

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

/**
 * Minimal reimplementation of generateCycleContext that operates on a given
 * projectDir (so we can use a temp directory). Mirrors the logic in bot.js.
 */
function generateCycleContext(projectDir) {
  const specDir = path.join(projectDir, 'seed_spec');

  const featureAreas = [];
  const seedState = readJson(path.join(projectDir, 'state.json'));
  if (seedState && seedState.milestones && seedState.milestones.length > 0) {
    for (const m of seedState.milestones) {
      featureAreas.push({ name: m.name, status: m.status || 'pending' });
    }
  } else if (fs.existsSync(specDir)) {
    const specFiles = fs.readdirSync(specDir).filter(f => f.startsWith('spec-') && f.endsWith('.md')).sort();
    for (const file of specFiles) {
      const name = file.replace(/^spec-\d+-/, '').replace('.md', '');
      featureAreas.push({ name, status: 'pending' });
    }
  }

  const designFile = path.join(specDir, 'design-artifact.yaml');
  const hasDesign = fs.existsSync(designFile);

  const infrastructure = (() => {
    const vision = readJson(path.join(projectDir, 'vision.json'));
    const visionInfra = vision?.infrastructure || {};
    return {
      needs_database: visionInfra.needs_database ?? false,
      needs_auth: visionInfra.needs_auth ?? false,
      needs_payments: visionInfra.needs_payments ?? false,
      deployment_target: visionInfra.deployment_target || null,
      ...(visionInfra.services ? { services: visionInfra.services } : {}),
      ...(visionInfra.framework ? { framework: visionInfra.framework } : {}),
    };
  })();

  let milestoneCount = 0;
  let storyCount = 0;
  let acCount = 0;
  let schemaVersion = 'v2';
  if (seedState && Array.isArray(seedState.milestones) && seedState.milestones.length > 0) {
    schemaVersion = 'v3';
    milestoneCount = seedState.milestones.length;
    for (const m of seedState.milestones) {
      const stories = Array.isArray(m.stories) ? m.stories : [];
      storyCount += stories.length;
      for (const s of stories) {
        const acs = Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [];
        acCount += acs.length;
      }
    }
    if (acCount === 0 && fs.existsSync(specDir)) {
      const msFile = path.join(specDir, 'milestones.json');
      if (fs.existsSync(msFile)) {
        try {
          const msData = JSON.parse(fs.readFileSync(msFile, 'utf8'));
          const msArr = Array.isArray(msData.milestones) ? msData.milestones : (Array.isArray(msData) ? msData : []);
          for (const m of msArr) {
            const stories = Array.isArray(m.stories) ? m.stories : [];
            for (const s of stories) {
              const acs = Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [];
              acCount += acs.length;
            }
          }
        } catch {}
      }
    }
  }

  return {
    featureAreas: featureAreas.length,
    specFiles: fs.existsSync(specDir)
      ? fs.readdirSync(specDir).filter(f => f.startsWith('spec-')).sort().length
      : 0,
    milestones: milestoneCount,
    stories: storyCount,
    acceptanceCriteria: acCount,
    schemaVersion,
    infrastructure,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isRateLimited', () => {
  test('returns false for null/undefined/empty', () => {
    assert.strictEqual(isRateLimited(null), false);
    assert.strictEqual(isRateLimited(undefined), false);
    assert.strictEqual(isRateLimited(''), false);
  });

  test('detects "hit your limit" in short text', () => {
    assert.strictEqual(isRateLimited("You've hit your limit for today."), true);
  });

  test('detects "too many requests" in short text', () => {
    assert.strictEqual(isRateLimited('Error: too many requests'), true);
  });

  test('detects "resets" + "limit" combo', () => {
    assert.strictEqual(isRateLimited('Rate limit resets in 5 minutes'), true);
  });

  test('returns false for long text mentioning rate limits (real content)', () => {
    const longText = 'Here is how to handle rate limits in your API client. ' +
      'You should implement exponential backoff when you hit your limit. ' +
      'The server returns 429 too many requests. ' + 'x'.repeat(100);
    assert.ok(longText.length > 200);
    assert.strictEqual(isRateLimited(longText), false);
  });

  test('returns false for short text without rate-limit keywords', () => {
    assert.strictEqual(isRateLimited('All good, task completed.'), false);
  });
});

describe('tryParseClaudeOutput', () => {
  test('parses clean JSON', () => {
    const result = tryParseClaudeOutput('{"result": "done", "session_id": "abc"}');
    assert.deepStrictEqual(result, { result: 'done', session_id: 'abc' });
  });

  test('extracts JSON with "result" key from mixed output', () => {
    const raw = 'Setting up project...\nRunning analysis...\n{"result": "success", "files": 3}';
    const result = tryParseClaudeOutput(raw);
    assert.deepStrictEqual(result, { result: 'success', files: 3 });
  });

  test('parses JSON on last line when earlier lines are not JSON', () => {
    const raw = 'Progress: 50%\nProgress: 100%\n{"status": "complete"}';
    const result = tryParseClaudeOutput(raw);
    assert.deepStrictEqual(result, { status: 'complete' });
  });

  test('returns null for completely non-JSON output', () => {
    assert.strictEqual(tryParseClaudeOutput('Just some plain text output'), null);
  });

  test('handles embedded JSON with "result" in prose', () => {
    const raw = 'Here is the output: {"result": "found 5 items", "count": 5} end.';
    const result = tryParseClaudeOutput(raw);
    // The regex greedily matches from first { to last } containing "result"
    assert.ok(result !== null);
    assert.strictEqual(result.result, 'found 5 items');
  });
});

describe('updateDisciplineTracker', () => {
  test('creates disciplines map if missing', () => {
    const seedState = {};
    updateDisciplineTracker(seedState, 'brainstorming');
    assert.ok(seedState.disciplines);
    assert.strictEqual(seedState.disciplines.brainstorming.status, 'complete');
    assert.strictEqual(seedState.disciplines.brainstorming.runs, 1);
  });

  test('normalises name: case-insensitive and trims whitespace', () => {
    const seedState = {};
    updateDisciplineTracker(seedState, '  SPEC  ');
    assert.ok(seedState.disciplines.spec);
    assert.strictEqual(seedState.disciplines.spec.status, 'complete');
  });

  test('increments run count on repeated calls', () => {
    const seedState = { disciplines: {} };
    updateDisciplineTracker(seedState, 'design');
    assert.strictEqual(seedState.disciplines.design.runs, 1);
    updateDisciplineTracker(seedState, 'design');
    assert.strictEqual(seedState.disciplines.design.runs, 2);
  });

  test('no-ops on empty/null discipline name', () => {
    const seedState = { disciplines: {} };
    updateDisciplineTracker(seedState, '');
    updateDisciplineTracker(seedState, null);
    updateDisciplineTracker(seedState, undefined);
    assert.strictEqual(Object.keys(seedState.disciplines).length, 0);
  });

  test('sets completed_at timestamp', () => {
    const seedState = {};
    const before = new Date().toISOString();
    updateDisciplineTracker(seedState, 'taste');
    const after = new Date().toISOString();
    assert.ok(seedState.disciplines.taste.completed_at >= before);
    assert.ok(seedState.disciplines.taste.completed_at <= after);
  });
});

describe('buildResumingFromStateBlock', () => {
  test('returns empty string when no disciplines', () => {
    assert.strictEqual(buildResumingFromStateBlock({}), '');
    assert.strictEqual(buildResumingFromStateBlock({ disciplines: {} }), '');
    assert.strictEqual(buildResumingFromStateBlock(null), '');
  });

  test('lists completed and remaining disciplines', () => {
    const seedState = {
      disciplines: {
        brainstorming: { status: 'complete' },
        competition: { status: 'complete' },
      },
    };
    const block = buildResumingFromStateBlock(seedState);
    assert.ok(block.includes('Completed disciplines (2/8)'));
    assert.ok(block.includes('brainstorming, competition'));
    assert.ok(block.includes('Remaining disciplines: taste, spec, infrastructure, design, legal-privacy, marketing'));
    assert.ok(block.includes('[RESUMING FROM STATE'));
    assert.ok(block.includes('[END STATE]'));
  });

  test('shows all completed when every discipline is done', () => {
    const disciplines = {};
    for (const d of SEEDING_DISCIPLINES) {
      disciplines[d] = { status: 'complete' };
    }
    const block = buildResumingFromStateBlock({ disciplines });
    assert.ok(block.includes(`Completed disciplines (8/8)`));
    assert.ok(block.includes('Remaining disciplines: (none)'));
  });
});

describe('DISCIPLINE_COMPLETE marker parsing', () => {
  test('extracts single discipline marker', () => {
    const text = 'Some output [DISCIPLINE_COMPLETE: brainstorming] more text';
    const matches = [...text.matchAll(DISCIPLINE_COMPLETE_RE)];
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], 'brainstorming');
  });

  test('extracts multiple discipline markers', () => {
    const text = '[DISCIPLINE_COMPLETE: spec] then [DISCIPLINE_COMPLETE: design]';
    const matches = [...text.matchAll(DISCIPLINE_COMPLETE_RE)];
    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0][1], 'spec');
    assert.strictEqual(matches[1][1], 'design');
  });

  test('strips markers from response text', () => {
    const text = 'Hello [DISCIPLINE_COMPLETE: taste] world';
    const cleaned = text.replace(/\[DISCIPLINE_COMPLETE:\s*\S+\]/g, '').trim();
    assert.strictEqual(cleaned, 'Hello  world');
  });

  test('handles extra whitespace after colon', () => {
    const text = '[DISCIPLINE_COMPLETE:   infrastructure]';
    const matches = [...text.matchAll(DISCIPLINE_COMPLETE_RE)];
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], 'infrastructure');
  });
});

describe('generateCycleContext', () => {
  let tmpDir;

  function setup() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-bot-test-'));
  }

  function teardown() {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  test('V3: counts milestones, stories, and acceptance criteria from state.json', () => {
    setup();
    try {
      writeJson(path.join(tmpDir, 'state.json'), {
        milestones: [
          {
            name: 'core-engine',
            status: 'pending',
            stories: [
              { name: 's1', acceptance_criteria: ['ac1', 'ac2'] },
              { name: 's2', acceptance_criteria: ['ac3'] },
            ],
          },
          {
            name: 'ui-layer',
            status: 'pending',
            stories: [
              { name: 's3', acceptance_criteria: ['ac4', 'ac5', 'ac6'] },
            ],
          },
        ],
      });
      const result = generateCycleContext(tmpDir);
      assert.strictEqual(result.schemaVersion, 'v3');
      assert.strictEqual(result.milestones, 2);
      assert.strictEqual(result.stories, 3);
      assert.strictEqual(result.acceptanceCriteria, 6);
      assert.strictEqual(result.featureAreas, 2);
    } finally {
      teardown();
    }
  });

  test('V2: falls back to spec-*.md files when no milestones in state', () => {
    setup();
    try {
      writeJson(path.join(tmpDir, 'state.json'), {});
      const specDir = path.join(tmpDir, 'seed_spec');
      fs.mkdirSync(specDir);
      fs.writeFileSync(path.join(specDir, 'spec-01-auth.md'), '# Auth');
      fs.writeFileSync(path.join(specDir, 'spec-02-dashboard.md'), '# Dashboard');
      const result = generateCycleContext(tmpDir);
      assert.strictEqual(result.schemaVersion, 'v2');
      assert.strictEqual(result.featureAreas, 2);
      assert.strictEqual(result.specFiles, 2);
      assert.strictEqual(result.milestones, 0);
    } finally {
      teardown();
    }
  });

  test('reads infrastructure from vision.json (#91 fix)', () => {
    setup();
    try {
      writeJson(path.join(tmpDir, 'state.json'), { milestones: [{ name: 'm1', stories: [] }] });
      writeJson(path.join(tmpDir, 'vision.json'), {
        infrastructure: {
          needs_database: true,
          needs_auth: true,
          needs_payments: false,
          deployment_target: 'vercel',
          framework: 'nextjs',
        },
      });
      const result = generateCycleContext(tmpDir);
      assert.strictEqual(result.infrastructure.needs_database, true);
      assert.strictEqual(result.infrastructure.needs_auth, true);
      assert.strictEqual(result.infrastructure.needs_payments, false);
      assert.strictEqual(result.infrastructure.deployment_target, 'vercel');
      assert.strictEqual(result.infrastructure.framework, 'nextjs');
    } finally {
      teardown();
    }
  });

  test('defaults infrastructure to false/null when vision.json is absent', () => {
    setup();
    try {
      writeJson(path.join(tmpDir, 'state.json'), { milestones: [{ name: 'm1', stories: [] }] });
      const result = generateCycleContext(tmpDir);
      assert.strictEqual(result.infrastructure.needs_database, false);
      assert.strictEqual(result.infrastructure.needs_auth, false);
      assert.strictEqual(result.infrastructure.deployment_target, null);
    } finally {
      teardown();
    }
  });

  test('V3: falls back to milestones.json for acceptance criteria when state.json has none', () => {
    setup();
    try {
      writeJson(path.join(tmpDir, 'state.json'), {
        milestones: [
          { name: 'core', stories: [{ name: 's1' }] }, // no acceptance_criteria
        ],
      });
      const specDir = path.join(tmpDir, 'seed_spec');
      fs.mkdirSync(specDir);
      writeJson(path.join(specDir, 'milestones.json'), {
        milestones: [
          { name: 'core', stories: [{ name: 's1', acceptance_criteria: ['a', 'b', 'c'] }] },
        ],
      });
      const result = generateCycleContext(tmpDir);
      assert.strictEqual(result.schemaVersion, 'v3');
      assert.strictEqual(result.acceptanceCriteria, 3);
    } finally {
      teardown();
    }
  });
});
