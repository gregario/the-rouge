// Empirical test: how does `claude -p` behave when asked to run a denied tool?
//
// This is the gating test for #103 PR (b). The plan assumes denied tool calls
// in -p mode return an error string that Claude can react to, not a TTY prompt
// that hangs a headless subprocess. If that assumption is wrong, the Rouge
// loop can't drop --dangerously-skip-permissions without stalling.
//
// We also test whether deny rules bite when --dangerously-skip-permissions
// is set. If the dangerous flag bypasses deny entirely, baking deny rules
// into settings.json would have been theater.
//
// Skip in CI (needs the claude CLI on PATH): ROUGE_SKIP_CLI_TESTS=1

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

// Skip when:
//   - ROUGE_SKIP_CLI_TESTS=1 (explicit opt-out, e.g. fast unit-only runs)
//   - the `claude` binary isn't on PATH (CI runners without Claude Code installed)
// The empirical assertions can only run with a real claude CLI; auto-
// skipping when it's missing keeps the suite green on stock GitHub
// Actions runners while still catching regressions on dev machines.
const SKIP = (() => {
  if (process.env.ROUGE_SKIP_CLI_TESTS === '1') return true;
  const probe = spawnSync('claude', ['--version'], { stdio: 'ignore' });
  return probe.error != null || probe.status !== 0;
})();
const TIMEOUT_MS = 45_000;

function runClaude(args, prompt) {
  return spawnSync('claude', args, {
    input: prompt,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    env: { ...process.env, CLAUDE_CODE_DISABLE_TELEMETRY: '1' },
  });
}

describe('claude -p denial behavior (empirical)', { skip: SKIP }, () => {
  test('denied Bash pattern in -p returns a string result, does not hang', () => {
    const prompt = 'Run the shell command: gh repo view. Then say DONE.';
    const result = runClaude(
      ['-p', prompt, '--allowedTools', 'Bash(echo *)'],
      prompt
    );

    assert.notStrictEqual(
      result.signal,
      'SIGTERM',
      'subprocess hit TIMEOUT — -p hung on denial instead of returning an error'
    );
    assert.strictEqual(typeof result.status, 'number', 'no exit status');

    const output = (result.stdout || '') + (result.stderr || '');
    const sawDenialOrContinuation = /deny|not allow|permission|DONE/i.test(output);
    assert.ok(
      sawDenialOrContinuation,
      `expected denial evidence or continuation; got: ${output.slice(0, 500)}`
    );
  });

  test('--dangerously-skip-permissions + deny rule: which wins?', () => {
    // Probes whether the dangerous flag bypasses deny. This gates whether
    // the shadow-mode default (both flags set) actually enforces anything.
    const prompt = 'Run the shell command: gh repo view. Then say DONE.';
    const result = runClaude(
      [
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        '--disallowedTools',
        'Bash(gh *)',
      ],
      prompt
    );

    assert.notStrictEqual(result.signal, 'SIGTERM', 'hung under dangerous+deny');
    assert.strictEqual(typeof result.status, 'number');

    const output = (result.stdout || '') + (result.stderr || '');
    console.error('[EMPIRICAL] dangerous+deny output:\n', output.slice(0, 2000));
    assert.ok(output.length > 0, 'no output from combined flags');
  });

  test('allowed Bash pattern runs without prompts in -p mode', () => {
    const prompt = 'Run: echo rouge-empirical-probe. Then say DONE.';
    const result = runClaude(
      ['-p', prompt, '--allowedTools', 'Bash(echo *)'],
      prompt
    );

    assert.notStrictEqual(result.signal, 'SIGTERM');
    const output = (result.stdout || '') + (result.stderr || '');
    assert.match(
      output,
      /rouge-empirical-probe|DONE/,
      'allowed tool did not execute'
    );
  });
});
