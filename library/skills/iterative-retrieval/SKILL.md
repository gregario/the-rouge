---
name: iterative-retrieval
description: 4-phase retrieval loop — dispatch broad, score relevance 0-1, refine criteria, loop up to N cycles. Use when a subagent or phase needs scoped context from a large source (codebase, catalogue, web).
origin: ECC
tier: global
stage: [seeding, loop]
status: active
---

# Iterative Retrieval

Borrowed from everything-claude-code. Solves the "context problem" where a naive retrieval dumps too much irrelevant material, wasting tokens and diluting the signal.

## When to activate

- Seeding / brainstorm: competitive landscape research across unknown sources
- Seeding / competition: feature pattern surveying
- Loop / building: "find every consumer of X" or "find the existing pattern for Y" in a large codebase
- Loop / analyzing: "find all prior cycles that hit similar root causes"

## Four phases

### 1. Dispatch
Start with a broad query. Collect candidate items without filtering.

### 2. Evaluate
Score each candidate 0.0–1.0 against the actual need:
- **0.8–1.0** — directly answers the question
- **0.5–0.7** — related pattern, adapt with care
- **0.2–0.4** — tangential, keep only if top N are thin
- **0.0–0.2** — irrelevant, discard

### 3. Refine
If the top scores are < 0.6, the query was off. Update criteria based on what the scored items revealed. Re-dispatch with narrower terms.

### 4. Loop
Max 3 refinement cycles. If still no 0.6+ match after 3 cycles, escalate ("no match found, suggest relaxing scope or asking human").

## Output shape

```json
{
  "query_initial": "...",
  "cycles": [
    { "query": "...", "candidates_scored": [...], "top_score": 0.85 }
  ],
  "selected": [
    { "source": "path/or/url", "score": 0.9, "why": "..." }
  ],
  "escalated": false
}
```

## Config

```json
{ "max_cycles": 3, "min_acceptable_score": 0.6, "top_n": 5 }
```

## Anti-patterns

- Don't skip the Evaluate phase. Unscored retrieval is grep.
- Don't loop past max_cycles. Escalate instead.
- Don't keep items scoring below 0.4 unless you have less than `top_n` above.
