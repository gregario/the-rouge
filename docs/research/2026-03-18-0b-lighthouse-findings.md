# 0b Battle Test: Lighthouse Findings

**Date:** 2026-03-18
**Tested with:** Lighthouse via `@lhci/cli` 0.15.1

## Verdict: Works fully headless with parseable JSON output.

---

## Command

```bash
npx lighthouse <url> --output=json --output-path=./report.json --chrome-flags="--headless=new"
```

Runtime: ~15 seconds per run.

## JSON Output Structure

Scores are in `categories.<name>.score` as floats (0-1):

```javascript
{
  categories: {
    performance: { score: 0.96 },
    accessibility: { score: 1.0 },
    "best-practices": { score: 1.0 },
    seo: { score: 1.0 }
  }
}
```

Parse with:
```bash
cat report.json | jq '{
  performance: .categories.performance.score,
  accessibility: .categories.accessibility.score,
  bestPractices: .categories["best-practices"].score,
  seo: .categories.seo.score
}'
```

## Baseline Scores (Minimal Next.js on CF Workers)

| Category | Score |
|----------|-------|
| Performance | 96 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

## LHCI Multi-Run Alternative

```bash
npx lhci autorun --collect.url=<url> --collect.numberOfRuns=3
```

Runs multiple times and reports median scores. More reliable for performance measurements.

## Requirements

- Chrome/Chromium must be installed on the machine
- `--headless=new` flag is required (old `--headless` is deprecated)
- Works in `claude -p` mode (no display needed)
