const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { migrateProject } = require('../../src/launcher/migrate-projects-out-of-repo.js');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-migrate-proj-'));
}

test('moves the project directory from source to destination', () => {
  const root = mkdtemp();
  try {
    const src = path.join(root, 'src', 'alpha');
    const dst = path.join(root, 'dst', 'alpha');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'state.json'), '{"current_state":"seeding"}');

    const result = migrateProject(src, dst);
    assert.strictEqual(result.status, 'migrated');
    assert.ok(fs.existsSync(path.join(dst, 'state.json')));
    assert.ok(!fs.existsSync(src));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports already-migrated when destination exists and source is gone', () => {
  const root = mkdtemp();
  try {
    const src = path.join(root, 'src', 'alpha');
    const dst = path.join(root, 'dst', 'alpha');
    fs.mkdirSync(dst, { recursive: true });
    fs.writeFileSync(path.join(dst, 'state.json'), '{}');

    const result = migrateProject(src, dst);
    assert.strictEqual(result.status, 'already-migrated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('flags conflict when both source and destination have content', () => {
  const root = mkdtemp();
  try {
    const src = path.join(root, 'src', 'alpha');
    const dst = path.join(root, 'dst', 'alpha');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dst, { recursive: true });
    fs.writeFileSync(path.join(src, 'state.json'), '{"v":1}');
    fs.writeFileSync(path.join(dst, 'state.json'), '{"v":2}');

    const result = migrateProject(src, dst);
    assert.strictEqual(result.status, 'conflict');
    // Both sides remain untouched for manual resolution.
    assert.ok(fs.existsSync(path.join(src, 'state.json')));
    assert.ok(fs.existsSync(path.join(dst, 'state.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cleans up an empty destination dir before moving source over it', () => {
  const root = mkdtemp();
  try {
    const src = path.join(root, 'src', 'alpha');
    const dst = path.join(root, 'dst', 'alpha');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'state.json'), '{"v":1}');
    fs.mkdirSync(dst, { recursive: true }); // empty placeholder

    const result = migrateProject(src, dst);
    assert.strictEqual(result.status, 'migrated');
    assert.ok(fs.existsSync(path.join(dst, 'state.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no-op when the source does not exist', () => {
  const root = mkdtemp();
  try {
    const src = path.join(root, 'src', 'missing');
    const dst = path.join(root, 'dst', 'missing');
    const result = migrateProject(src, dst);
    assert.strictEqual(result.status, 'missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
