const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Seeding prompts run during the interactive swarm phase. They have
// different expectations than loop prompts — they converse with the
// user, emit [GATE:] / [DECISION:] / [HEARTBEAT:] markers, and write
// discipline artifacts to disk. This suite covers the contract that
// the dashboard + orchestrator rely on.

const SEEDING_DIR = path.join(__dirname, '../../src/prompts/seeding');
const SEEDING_FILES = fs.readdirSync(SEEDING_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('00-swarm'))
  .sort();

describe('Seeding prompt contract', () => {
  test('all discipline prompts present', () => {
    // Eight disciplines + conditional infrastructure. If a new one
    // appears, the orchestrator DISCIPLINE_SEQUENCE needs updating too.
    assert.ok(SEEDING_FILES.length >= 8, `Expected at least 8 discipline prompts, found ${SEEDING_FILES.length}: ${SEEDING_FILES.join(', ')}`);
  });

  for (const file of SEEDING_FILES) {
    describe(file, () => {
      const content = fs.readFileSync(path.join(SEEDING_DIR, file), 'utf8');

      test('declares at least one hard gate', () => {
        // Each discipline needs a hard-gate checkpoint so Rouge pauses
        // for the human before finalising. Found via the [GATE:] marker
        // convention or an explicit "H1 / H2" hard-gate header.
        const hasMarker = /\[GATE:\s*H\d/i.test(content);
        const hasHeader = /^##\s*H\d[\s\.:]/m.test(content);
        const hasHardGateSection = /hard gate/i.test(content);
        // Infrastructure is conditional — if it mentions "conditional"
        // or "skipped", a missing gate is acceptable.
        const isConditional = /conditional|skipped when|opt[- ]out/i.test(content);
        assert.ok(
          hasMarker || hasHeader || hasHardGateSection || isConditional,
          `${file} has no visible hard-gate checkpoint`,
        );
      });

      test('writes a discipline artifact', () => {
        // Every discipline produces at least one file on disk for the
        // next phase to read. This test only checks that the prompt
        // explicitly mentions writing something — it doesn't verify
        // the file path matches.
        const writes = /write|produce|emit|save|output/i.test(content);
        assert.ok(writes, `${file} never mentions writing output`);
      });

      test('emits DISCIPLINE_COMPLETE marker at end', () => {
        // The handler watches for [DISCIPLINE_COMPLETE: <name>] to
        // advance state. Missing this marker means the discipline
        // never finishes from the dashboard's perspective.
        assert.ok(
          /\[DISCIPLINE_COMPLETE:/i.test(content),
          `${file} missing [DISCIPLINE_COMPLETE:] marker`,
        );
      });
    });
  }
});
