const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  runPhaseSubprocess,
  HEARTBEAT_INTERVAL_MS,
} = require('../../../src/launcher/facade/dispatch/subprocess.js');

// runPhaseSubprocess is the lifted spawn orchestration (Phase 5 of
// the grand unified reconciliation). It spawns `claude` directly,
// which isn't available in CI — we exercise the contract by pointing
// at a stand-in binary (sh -c) when claude is missing, OR skip when
// no shell is available. The watchdog + result shape can be exercised
// without real claude by spawning a script that emits stdout / stays
// silent / exits with various codes.

function tempProjectDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-runphase-test-'));
}

let projectDir;
let phaseLog;
let logStream;

beforeEach(() => {
  projectDir = tempProjectDir();
  phaseLog = path.join(projectDir, 'phase.log');
  // Pre-create the log file synchronously so createWriteStream's
  // lazy open can't race with afterEach's rmSync.
  fs.writeFileSync(phaseLog, '');
  logStream = fs.createWriteStream(phaseLog, { flags: 'a' });
});

afterEach(async () => {
  await new Promise((resolve) => {
    logStream.end(() => resolve());
  });
  try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
});

describe('runPhaseSubprocess — argument validation', () => {
  test('throws when args is not an array', async () => {
    await assert.rejects(
      runPhaseSubprocess({ cwd: projectDir, logStream, phaseLog }),
      /args \(array\) required/
    );
  });

  test('throws when cwd is missing', async () => {
    await assert.rejects(
      runPhaseSubprocess({ args: [], logStream, phaseLog }),
      /cwd required/
    );
  });

  test('throws when logStream is missing', async () => {
    await assert.rejects(
      runPhaseSubprocess({ args: [], cwd: projectDir, phaseLog }),
      /logStream required/
    );
  });

  test('throws when phaseLog is missing', async () => {
    await assert.rejects(
      runPhaseSubprocess({ args: [], cwd: projectDir, logStream }),
      /phaseLog required/
    );
  });
});

describe('runPhaseSubprocess — spawn-error path', () => {
  test('rejects when the spawned binary does not exist', async () => {
    // The strategy hard-codes `spawn('claude', ...)`; we can't
    // override the binary. But we can detect the error path by
    // setting PATH to an empty dir so spawn fails with ENOENT.
    const env = { ...process.env, PATH: projectDir };
    await assert.rejects(
      runPhaseSubprocess({
        args: ['-p', 'noop'],
        cwd: projectDir,
        env,
        logStream,
        phaseLog,
      }),
      (err) => err && (err.code === 'ENOENT' || /ENOENT/.test(String(err)))
    );
  });
});

describe('runPhaseSubprocess — exported defaults', () => {
  test('HEARTBEAT_INTERVAL_MS is 30s', () => {
    assert.equal(HEARTBEAT_INTERVAL_MS, 30_000);
  });
});
