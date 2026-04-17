const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { statePath, statePathForWrite, hasStateFile, ROUGE_DIR, STATE_FILE } = require('../../src/launcher/state-path.js');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-state-path-'));
}

test('statePath prefers .rouge/state.json when both exist', () => {
  const dir = mkdtemp();
  try {
    fs.mkdirSync(path.join(dir, ROUGE_DIR));
    fs.writeFileSync(path.join(dir, ROUGE_DIR, STATE_FILE), '{}');
    fs.writeFileSync(path.join(dir, STATE_FILE), '{}');
    assert.strictEqual(statePath(dir), path.join(dir, ROUGE_DIR, STATE_FILE));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('statePath falls back to legacy state.json when .rouge/state.json is missing', () => {
  const dir = mkdtemp();
  try {
    fs.writeFileSync(path.join(dir, STATE_FILE), '{}');
    assert.strictEqual(statePath(dir), path.join(dir, STATE_FILE));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('statePath returns the new path when neither file exists', () => {
  const dir = mkdtemp();
  try {
    assert.strictEqual(statePath(dir), path.join(dir, ROUGE_DIR, STATE_FILE));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('statePathForWrite always returns .rouge/state.json and creates the dir', () => {
  const dir = mkdtemp();
  try {
    assert.strictEqual(fs.existsSync(path.join(dir, ROUGE_DIR)), false);
    const p = statePathForWrite(dir);
    assert.strictEqual(p, path.join(dir, ROUGE_DIR, STATE_FILE));
    assert.strictEqual(fs.existsSync(path.join(dir, ROUGE_DIR)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hasStateFile is true for new or legacy location', () => {
  const newOnly = mkdtemp();
  const legacyOnly = mkdtemp();
  const empty = mkdtemp();
  try {
    fs.mkdirSync(path.join(newOnly, ROUGE_DIR));
    fs.writeFileSync(path.join(newOnly, ROUGE_DIR, STATE_FILE), '{}');
    assert.strictEqual(hasStateFile(newOnly), true);

    fs.writeFileSync(path.join(legacyOnly, STATE_FILE), '{}');
    assert.strictEqual(hasStateFile(legacyOnly), true);

    assert.strictEqual(hasStateFile(empty), false);
  } finally {
    fs.rmSync(newOnly, { recursive: true, force: true });
    fs.rmSync(legacyOnly, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
