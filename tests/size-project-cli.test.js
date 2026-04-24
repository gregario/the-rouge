const { test, describe } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI_PATH = path.join(__dirname, '..', 'src', 'launcher', 'rouge-cli.js');

function runCLI(args) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status === undefined ? 1 : err.status,
      stdout: (err.stdout || '').toString(),
      stderr: (err.stderr || '').toString(),
    };
  }
}

function makeProject(signals) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-sizing-'));
  const seedDir = path.join(dir, 'seed_spec');
  fs.mkdirSync(seedDir);
  const signalsBlock = signals === null
    ? ''
    : `\n\n## Classifier Signals\n\n` + Object.entries(signals).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
  fs.writeFileSync(
    path.join(seedDir, 'brainstorming.md'),
    `# Test product\n\n## Some section\nSome prose.${signalsBlock}`
  );
  return { dir, seedDir };
}

describe('rouge size-project CLI', () => {
  test('--help exits 0 with usage text', () => {
    const r = runCLI(['size-project', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('SIZING sub-phase driver'));
    assert.ok(r.stdout.includes('--override'));
  });

  test('unknown flag exits 2', () => {
    const r = runCLI(['size-project', '--nope']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('Unknown flag'));
  });

  test('--override without --reasoning exits 2', () => {
    const r = runCLI(['size-project', '--override', 'M']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('--override requires --reasoning'));
  });

  test('--reasoning without --override exits 2', () => {
    const r = runCLI(['size-project', '--reasoning', 'why']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('--reasoning requires --override'));
  });

  test('missing brainstorming.md exits 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-sizing-missing-'));
    try {
      const r = runCLI(['size-project', '--project-dir', dir]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes('brainstorming.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('brainstorming.md missing signals block exits 1', () => {
    const { dir } = makeProject(null);
    try {
      const r = runCLI(['size-project', '--project-dir', dir]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes('Classifier Signals'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('partial signals block exits 1', () => {
    const { dir } = makeProject({ entity_count: 5, role_count: 2 });
    try {
      const r = runCLI(['size-project', '--project-dir', dir]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes('Incomplete signals'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('classifies calculator-shaped project as XS and writes sizing.json', () => {
    const { dir, seedDir } = makeProject({
      entity_count: 1,
      integration_count: 0,
      role_count: 1,
      journey_count: 1,
      screen_count: 1,
    });
    try {
      const r = runCLI(['size-project', '--project-dir', dir]);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('Tier:        XS'));
      const sizingPath = path.join(seedDir, 'sizing.json');
      assert.ok(fs.existsSync(sizingPath));
      const artifact = JSON.parse(fs.readFileSync(sizingPath, 'utf8'));
      assert.equal(artifact.project_size, 'XS');
      assert.equal(artifact.decided_by, 'classifier');
      assert.equal(artifact.schema_version, 'sizing-v1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--json emits only the JSON on stdout', () => {
    const { dir } = makeProject({
      entity_count: 1,
      integration_count: 0,
      role_count: 1,
      journey_count: 1,
      screen_count: 1,
    });
    try {
      const r = runCLI(['size-project', '--project-dir', dir, '--json']);
      assert.equal(r.status, 0);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.project_size, 'XS');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('override path: exits 1 when sizing.json does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-override-bare-'));
    try {
      const r = runCLI([
        'size-project',
        '--project-dir', dir,
        '--override', 'L',
        '--reasoning', 'because I say so',
      ]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes('No existing sizing.json'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('override path: applies override and records classifier_would_pick', () => {
    const { dir, seedDir } = makeProject({
      entity_count: 5,
      integration_count: 3,
      role_count: 2,
      journey_count: 5,
      screen_count: 7,
    });
    try {
      // First run: initial classification (should be M).
      const r1 = runCLI(['size-project', '--project-dir', dir]);
      assert.equal(r1.status, 0);
      const before = JSON.parse(fs.readFileSync(path.join(seedDir, 'sizing.json'), 'utf8'));
      assert.equal(before.project_size, 'M');

      // Second run: human overrides to L.
      const r2 = runCLI([
        'size-project',
        '--project-dir', dir,
        '--override', 'L',
        '--reasoning', 'this is going to grow',
      ]);
      assert.equal(r2.status, 0);
      const after = JSON.parse(fs.readFileSync(path.join(seedDir, 'sizing.json'), 'utf8'));
      assert.equal(after.project_size, 'L');
      assert.equal(after.decided_by, 'human-override');
      assert.equal(after.human_override.classifier_would_pick, 'M');
      assert.ok(after.human_override.human_reasoning.includes('grow'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('override path: invalid tier exits 2', () => {
    const { dir } = makeProject({
      entity_count: 1, integration_count: 0, role_count: 1, journey_count: 1, screen_count: 1,
    });
    try {
      runCLI(['size-project', '--project-dir', dir]); // initial run first
      const r = runCLI([
        'size-project',
        '--project-dir', dir,
        '--override', 'XXL',
        '--reasoning', 'huge',
      ]);
      assert.equal(r.status, 2);
      assert.ok(r.stderr.includes('must be one of'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
