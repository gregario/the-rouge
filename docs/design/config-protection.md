# Config Protection Hook (design)

**Status:** designed, not wired in
**Borrowed from:** everything-claude-code's `scripts/hooks/config-protection.js`
**Date:** 2026-04-23

## Problem

The factory hits a linter/type-checker/test error. Instead of fixing the code, it "fixes" the config (disables the rule, lowers the threshold, adds the file to ignore). Tests pass. Eval passes. Real bug ships to user.

This is a silent-failure class Rouge's current safety hooks don't catch. `rouge-safety-check.sh` blocks destructive commands but doesn't notice when the factory weakens its own guardrails.

## Protected paths

Any write or edit to these files during a **factory phase** (`story-building`, `foundation`, `milestone-fix`) triggers the hook:

- `.eslintrc*`, `eslint.config.*`
- `.prettierrc*`, `prettier.config.*`
- `tsconfig.json`, `jsconfig.json`
- `pyproject.toml` (only the `[tool.ruff]`, `[tool.mypy]`, `[tool.pytest]` sections)
- `ruff.toml`, `mypy.ini`, `pytest.ini`, `pyrightconfig.json`
- `.rustfmt.toml`, `clippy.toml`
- `.golangci.yml`, `.golangci.yaml`
- `Cargo.toml` (only the `[lints]` section)
- `package.json` (only `"scripts"` section and devDeps downgrades)
- `.c8rc*`, `jest.config.*`, `vitest.config.*` (coverage configs)
- `.github/workflows/*.yml` (CI config — factory should rarely touch)

## Behavior

**Default: warn, don't block.** Exit code 0 with a prominent warning appended to the audit log. Pattern borrowed from ECC — intentional friction, not a hard stop, because legitimate config updates happen.

**Strict mode** (`config_protection: strict` in rouge.config.json): exit code 2, hard block, factory must escalate.

When warning mode triggers, the audit log captures:
- Which file was edited
- Which rule/threshold/setting changed
- The prior value vs new value
- The factory's current story/milestone for attribution

## Escalation ladder

The factory's only legitimate reasons to touch a protected file:
1. A new dependency pulled in requires a config section (e.g., added Tailwind → need postcss config)
2. A rule genuinely doesn't apply to the project (e.g., disabling `@typescript-eslint/no-explicit-any` in a test fixtures file only)
3. Upgrading a tooling version required config migration

For each of these, the factory must include a `// rationale:` comment in the config diff OR escalate. The config-protection hook parses the diff for the rationale marker and passes if present.

## Implementation plan

### Phase A (this PR): design + helper script, NOT wired

- `src/launcher/config-protection.js` — stateless JS module that accepts a file path + diff and returns `{ allow: bool, reason: string, severity: "warn"|"block" }`
- Unit tests in `tests/config-protection.test.js`
- **Not invoked by rouge-safety-check.sh yet.** Human reviews this PR first.

### Phase B (follow-up PR, after human review):

- Add a call to `config-protection.js` from inside `rouge-safety-check.sh` pre-write hook
- Add `config_protection` field to rouge.config.json: `"off" | "warn" | "block"`. Default `"warn"`.
- Add integration tests: factory edits eslint config → hook warns; factory edits with `// rationale:` marker → hook allows.

### Phase C (future):

- Extend to cover CI workflow files
- Add per-rule whitelist (some rules are safe to toggle, e.g., formatting preferences)
- Wire into governance events (Phase 6) so every override is queryable

## Why not block by default

ECC's lesson: blocking legitimate config updates trains the factory to find workarounds (adding `// eslint-disable-next-line` instead of editing the config, which is worse). Warning captures the signal without driving the failure mode.

Rouge can always escalate `config_protection: strict` for specific projects where linter discipline is especially load-bearing (e.g., shipping to regulated domains).

## Reference

- ECC source: `everything-claude-code/scripts/hooks/config-protection.js` (~150 lines)
- Rouge blocklist: `rouge.config.json` → `self_improvement.blocklist` already protects Rouge's own launcher configs; this hook extends the pattern to the products Rouge builds.
