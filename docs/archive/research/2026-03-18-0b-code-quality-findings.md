# 0b Battle Test: Code Quality Tools Findings

**Date:** 2026-03-18
**Tested in:** Next.js 16.1.7 testbed

## Verdict: All tools produce parseable output. Two gotchas documented.

---

## ESLint

```bash
npx eslint src/ --format json
```

Output: JSON array. Each entry: `{ filePath, errorCount, warningCount, messages[] }`.
Exit code: 1 on errors, 0 otherwise.
Works as expected.

## jscpd (Duplication)

```bash
npx jscpd src/ --min-lines 6 --reporters json --threshold 5 --output ./reports
```

Output: `reports/jscpd-report.json` with `statistics.total.percentage` float.
**GOTCHA: Always exits 0** even above threshold. Parse JSON and check `percentage` manually.

## madge (Circular Dependencies)

```bash
npx madge --circular src/
```

Output: Text list of circular dependency chains.
Exit code: 1 if circular deps found, 0 if clean.
**GOTCHA: `--json` flag suppresses non-zero exit.** Use without `--json` for CI gating.

For TypeScript: add `--ts-config tsconfig.json`.

## knip (Dead Code)

```bash
npx knip --reporter json
```

Output: JSON with `{ files: [], issues: [] }`.
Exit code: 1 if issues found.
Detects: unused files, unused exports, unused/unlisted dependencies.

## c8 (Coverage)

```bash
npx c8 --reporter=json-summary --check-coverage --branches 80 npx vitest run
```

Output: JSON coverage summary.
Exit code: Non-zero if below threshold.
Vitest alternative: `vitest run --coverage --coverage.reporter=json`.
