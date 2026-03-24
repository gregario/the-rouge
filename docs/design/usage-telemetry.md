# Usage Telemetry Design (Open Source)

> Adapted from gstack's opt-in telemetry system. Implementation priority: post-V1 launch.

## Principles

1. **Opt-in only.** Telemetry is OFF by default. First run asks once. "No" is permanent until manually changed.
2. **Transparent.** Every data point collected is documented here. No hidden fields.
3. **Anonymous.** No personally identifiable information. No project names, file paths, code content, or spec content.
4. **Useful.** Every field must answer a specific product question. No "nice to have" fields.

## What We Collect

### Per-Cycle Event

```json
{
  "event": "cycle_complete",
  "session_id": "<UUID, rotated per session>",
  "install_id": "<UUID, stable per install>",
  "rouge_version": "1.0.0",
  "source": "live | ci | evaluation",
  "timestamp": "<ISO 8601>",

  "cycle": {
    "number": 0,
    "type": "initial-build | feature-build | qa-fix | re-evaluation",
    "evaluation_tier": "full | gate",
    "duration_seconds": 0,
    "phases_executed": ["building", "evaluation", "qa-fixing"],
    "phases_retried": 0
  },

  "outcome": {
    "qa_verdict": "PASS | FAIL",
    "po_verdict": "PRODUCTION_READY | NEEDS_IMPROVEMENT | NOT_READY | SKIPPED",
    "escalations": 0,
    "shipped": false
  },

  "project_shape": {
    "domain": "web | game | artifact",
    "feature_areas_total": 0,
    "feature_areas_complete": 0,
    "total_cycles": 0
  }
}
```

### Product Questions This Answers

| Question | Field(s) |
|----------|----------|
| How many cycles does it take to ship a product? | total_cycles, shipped |
| Which phase is the bottleneck? | phases_executed, duration_seconds, phases_retried |
| How often does the loop escalate to humans? | escalations |
| What project types are people building? | domain |
| Does gate-tier evaluation save meaningful cycles? | evaluation_tier, qa_verdict |
| How often does PO Review disagree with QA? | qa_verdict vs po_verdict |

## What We Do NOT Collect

- Project names, URLs, or code
- Spec content, vision documents, or Library heuristics
- File paths or directory structures
- Error messages or stack traces (may contain code)
- User names, emails, or machine identifiers beyond install_id

## Implementation Notes

- **Endpoint:** HTTPS POST to a telemetry endpoint (self-hosted, not third-party)
- **Failure mode:** Fire-and-forget. Telemetry failures NEVER block the loop. No retries.
- **Storage:** Append-only JSONL. No database. Read with jq for analysis.
- **Consent file:** `~/.rouge/telemetry-consent` — `opted-in | opted-out | not-asked`
- **Source tagging:** Launcher sets `source` based on environment detection (CI env vars, evaluation flag, default to live)

## gstack Reference

gstack's implementation: session-meta partial (source tagging), telemetry send logic, TRANSPARENCY.md (public disclosure).
