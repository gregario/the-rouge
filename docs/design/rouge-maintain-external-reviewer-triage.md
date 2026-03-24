# External Reviewer Triage Pattern (Rouge Maintain)

> Reference document for Rouge Maintain implementation. Adapted from gstack's Greptile triage system.

## Problem

Rouge Maintain will process automated feedback from external tools:
- Dependabot (dependency updates)
- Snyk / CodeQL (vulnerability scanning)
- Lighthouse CI (performance regression)
- ESLint / type-check (code quality)
- Automated PR reviewers (Greptile, CodeRabbit, etc.)

Without triage, these generate noise. False positives pile up. Already-fixed issues get re-flagged. The autonomous loop wastes cycles on non-issues.

## Pattern: Classify → Act → Learn

### Classification

For each external finding, classify as:

| Classification | Meaning | Action |
|----------------|---------|--------|
| **VALID_ACTIONABLE** | Real issue, needs fixing | Create fix task, prioritize by severity |
| **VALID_ALREADY_FIXED** | Real issue, but already addressed in a recent commit | Auto-reply with fix SHA, suppress |
| **FALSE_POSITIVE** | Not a real issue (tool misunderstanding, style preference, context-insensitive) | Suppress, add to suppression list |
| **DEFERRED** | Real issue, but not urgent enough for this cycle | Log to backlog, revisit in N cycles |

### History Tracking

Per-project history file: `projects/<name>/external-review-history.json`

```json
{
  "suppressions": [
    { "tool": "dependabot", "pattern": "eslint-*", "reason": "Pinned to v8 until Next.js 15 migration", "added": "2026-03-24", "expires": "2026-06-01" }
  ],
  "false_positive_patterns": [
    { "tool": "coderabbit", "file_pattern": "*.test.ts", "category": "no-magic-numbers", "reason": "Test fixtures use literal values by design" }
  ],
  "triage_stats": {
    "total_findings": 0,
    "valid_actionable": 0,
    "false_positives": 0,
    "already_fixed": 0,
    "deferred": 0
  }
}
```

### Learning Loop

After each triage cycle:
1. Check if any suppression has expired → un-suppress
2. Check if any false positive pattern no longer matches → remove
3. Update triage stats
4. If `false_positives / total_findings > 0.5` for a tool → flag the tool as noisy, consider disabling

## gstack Reference

gstack's implementation: `review/greptile-triage.md` in the gstack repo.
Key patterns to adapt: per-project history file, auto-reply for already-fixed, suppression list with expiry dates.
