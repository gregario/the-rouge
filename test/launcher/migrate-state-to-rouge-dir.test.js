const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { migrateProject } = require('../../src/launcher/migrate-state-to-rouge-dir.js');
const { ROUGE_DIR, STATE_FILE } = require('../../src/launcher/state-path.js');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-state-migrate-'));
}

test('migrates legacy state.json into .rouge/', () => {
  const dir = mkdtemp();
  try {
    fs.writeFileSync(path.join(dir, STATE_FILE), '{"current_state":"seeding"}');
    const result = migrateProject(dir);
    assert.strictEqual(result.status, 'migrated');
    assert.ok(fs.existsSync(path.join(dir, ROUGE_DIR, STATE_FILE)));
    assert.ok(!fs.existsSync(path.join(dir, STATE_FILE)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips projects already migrated', () => {
  const dir = mkdtemp();
  try {
    fs.mkdirSync(path.join(dir, ROUGE_DIR));
    fs.writeFileSync(path.join(dir, ROUGE_DIR, STATE_FILE), '{}');
    const result = migrateProject(dir);
    assert.strictEqual(result.status, 'already-migrated');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('removes stale legacy file when contents match new', () => {
  const dir = mkdtemp();
  try {
    const content = '{"current_state":"ready"}';
    fs.mkdirSync(path.join(dir, ROUGE_DIR));
    fs.writeFileSync(path.join(dir, ROUGE_DIR, STATE_FILE), content);
    fs.writeFileSync(path.join(dir, STATE_FILE), content);
    const result = migrateProject(dir);
    assert.strictEqual(result.status, 'cleaned-stale-legacy');
    assert.ok(!fs.existsSync(path.join(dir, STATE_FILE)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags conflict when both exist with different content', () => {
  const dir = mkdtemp();
  try {
    fs.mkdirSync(path.join(dir, ROUGE_DIR));
    fs.writeFileSync(path.join(dir, ROUGE_DIR, STATE_FILE), '{"current_state":"ready"}');
    fs.writeFileSync(path.join(dir, STATE_FILE), '{"current_state":"seeding"}');
    const result = migrateProject(dir);
    assert.strictEqual(result.status, 'conflict');
    // Both files must remain so operator can resolve manually.
    assert.ok(fs.existsSync(path.join(dir, STATE_FILE)));
    assert.ok(fs.existsSync(path.join(dir, ROUGE_DIR, STATE_FILE)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no-op on directories without state.json', () => {
  const dir = mkdtemp();
  try {
    const result = migrateProject(dir);
    assert.strictEqual(result.status, 'no-state');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
