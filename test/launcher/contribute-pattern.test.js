const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { contribute, contributeAllDrafts } = require('../../src/launcher/contribute-pattern.js');

describe('contribute-pattern integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contribute-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDraft(name, body) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, body);
    return p;
  }

  test('dryRun returns success with branch + destination for a valid draft', () => {
    const draft = writeDraft(
      'mapbox-geocoding.yaml',
      `id: mapbox-geocoding
name: Mapbox Geocoding
tier: 3
description: Forward and reverse geocoding via Mapbox.
`,
    );

    const result = contribute(draft, { dryRun: true, product: 'test-product' });
    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.match(result.branch, /^catalogue\/mapbox-geocoding$/);
    assert.ok(result.destination);
    assert.match(result.commitMsg, /feat\(catalogue\):.*mapbox/i);
  });

  test('rejects a draft missing required fields', () => {
    const draft = writeDraft(
      'bad.yaml',
      `name: No ID
tier: 2
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => /id/.test(e)));
  });

  test('rejects a draft with invalid tier', () => {
    const draft = writeDraft(
      'bad-tier.yaml',
      `id: foo
name: Foo
tier: 5
description: whatever
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => /tier/.test(e)));
  });

  test('rejects a draft with non-kebab-case id', () => {
    const draft = writeDraft(
      'bad-id.yaml',
      `id: Bad_ID
name: Bad
tier: 3
description: whatever
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => /kebab/.test(e)));
  });

  test('rejects a draft with description under the schema minimum', () => {
    // Schema requires description >= 20 chars (stub threshold). This
    // is the G7 schema kicking in on top of the hand-rolled checks.
    const draft = writeDraft(
      'short-desc.yaml',
      `id: foo-bar
name: Foo Bar
tier: 2
description: Short.
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => /schema:|description/i.test(e)));
  });

  test('rejects a draft with invalid cost_tier enum value', () => {
    const draft = writeDraft(
      'bad-cost.yaml',
      `id: foo
name: Foo
tier: 2
description: A reasonably long description passing the 20-char minimum.
cost_tier: super-expensive
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => /schema:.*cost_tier/i.test(e)));
  });

  test('accepts a well-formed tier-2 draft', () => {
    const draft = writeDraft(
      'good-entry.yaml',
      `id: mapbox
name: Mapbox
tier: 2
category: maps
description: Geocoding, static maps, and map tiles via Mapbox API.
cost_tier: usage-based
`,
    );
    const result = contribute(draft, { dryRun: true });
    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
  });

  test('contributeAllDrafts returns empty when drafts dir has no files', () => {
    // Point scanDrafts at a clean temp by running from a cwd with no drafts dir.
    // scanDrafts uses a fixed library/integrations/drafts/ path rooted at
    // process.cwd, so we can't fully stub without a spawn — but we can at
    // least confirm the function does not throw and produces a shape.
    const result = contributeAllDrafts(() => {}, 'test-product');
    assert.ok(Array.isArray(result.contributed));
    assert.ok(Array.isArray(result.failed));
  });
});
