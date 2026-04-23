'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { check, isProtectedFile, findWeakeningSignals, hasRationaleMarker } =
  require('../src/launcher/config-protection.js');

test('isProtectedFile identifies TS/JS lint configs', () => {
  assert.ok(isProtectedFile('.eslintrc.json'));
  assert.ok(isProtectedFile('eslint.config.js'));
  assert.ok(isProtectedFile('.eslintrc.cjs'));
  assert.ok(isProtectedFile('tsconfig.json'));
  assert.ok(isProtectedFile('path/to/tsconfig.build.json'));
  assert.ok(isProtectedFile('.prettierrc'));
});

test('isProtectedFile identifies Python lint configs', () => {
  assert.ok(isProtectedFile('pyproject.toml'));
  assert.ok(isProtectedFile('ruff.toml'));
  assert.ok(isProtectedFile('mypy.ini'));
});

test('isProtectedFile identifies coverage / test configs', () => {
  assert.ok(isProtectedFile('.c8rc.json'));
  assert.ok(isProtectedFile('jest.config.js'));
  assert.ok(isProtectedFile('vitest.config.ts'));
});

test('isProtectedFile identifies CI workflow files', () => {
  assert.ok(isProtectedFile('.github/workflows/ci.yml'));
  assert.ok(isProtectedFile('.github/workflows/deploy.yaml'));
});

test('isProtectedFile rejects ordinary source files', () => {
  assert.ok(!isProtectedFile('src/foo.ts'));
  assert.ok(!isProtectedFile('tests/bar.test.js'));
  assert.ok(!isProtectedFile('README.md'));
});

test('findWeakeningSignals flags strict-mode disable', () => {
  const diff = '{\n  "compilerOptions": {\n    "strict": false\n  }\n}';
  const sigs = findWeakeningSignals(diff);
  assert.ok(sigs.length >= 1);
});

test('findWeakeningSignals flags eslint-disable blanket', () => {
  const diff = '/* eslint-disable */\nexport function x() { return 1; }';
  const sigs = findWeakeningSignals(diff);
  assert.ok(sigs.length >= 1);
});

test('findWeakeningSignals flags lowered coverage threshold', () => {
  const diff = '"lines": 60,\n"branches": 55,';
  const sigs = findWeakeningSignals(diff);
  assert.ok(sigs.length >= 1);
});

test('findWeakeningSignals ignores strengthening edits', () => {
  const diff = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}';
  const sigs = findWeakeningSignals(diff);
  assert.equal(sigs.length, 0);
});

test('hasRationaleMarker recognizes JS and Python rationale comments', () => {
  assert.ok(hasRationaleMarker('// rationale: fixtures file, any is fine'));
  assert.ok(hasRationaleMarker('# rationale: legacy code, will remove'));
  assert.ok(!hasRationaleMarker('// just disabling this\n"strict": false'));
});

test('check: non-protected file always allow', () => {
  const r = check({ filePath: 'src/foo.ts', diff: 'strict: false' });
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'ok');
});

test('check: protected file with weakening signal + no rationale → warn (default)', () => {
  const r = check({
    filePath: 'tsconfig.json',
    diff: '{\n  "compilerOptions": { "strict": false }\n}',
  });
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'warn');
  assert.ok(r.signals.length >= 1);
});

test('check: protected file with weakening signal + rationale → allow, severity ok', () => {
  const r = check({
    filePath: 'tsconfig.json',
    diff: '// rationale: generated-code directory, cannot use strict\n"strict": false',
  });
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'ok');
});

test('check: strict mode → blocks weakening without rationale', () => {
  const r = check({
    filePath: '.eslintrc.json',
    diff: '"rules": { "no-unused-vars": "off" }',
    mode: 'block',
  });
  assert.equal(r.allow, false);
  assert.equal(r.severity, 'block');
});

test('check: off mode → never blocks or warns', () => {
  const r = check({
    filePath: '.eslintrc.json',
    diff: '"rules": { "no-unused-vars": "off" }',
    mode: 'off',
  });
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'ok');
});

test('check: no filePath → allow, severity ok', () => {
  const r = check({});
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'ok');
});

test('check: protected file, no weakening signal → allow', () => {
  const r = check({
    filePath: 'tsconfig.json',
    diff: '{\n  "compilerOptions": { "strict": true, "target": "ES2022" }\n}',
  });
  assert.equal(r.allow, true);
  assert.equal(r.severity, 'ok');
});
