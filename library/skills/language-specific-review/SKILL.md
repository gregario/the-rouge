---
name: language-specific-review
description: Dispatch code review to a language-specific reviewer agent based on the active product's primary language. Falls back silently if no agent exists for the language. Invoked from 02c-code-review.md.
origin: ECC
tier: global
stage: [loop]
status: active
---

# Language-Specific Review

Code review that knows the language's idioms, common pitfalls, and tooling. Borrowed from everything-claude-code's language-reviewer agent pattern; adapted to Rouge's evaluation flow.

## When to activate

Invoked from `src/prompts/loop/02c-code-review.md` after Step 1 (Static Analysis) and before Step 2 (AI Code Audit). Also usable from foundation-building evaluation.

## Dispatch logic

```
lang = cycle_context.active_spec.infrastructure.primary_language  // lower-cased, e.g. "typescript"
agent_file = "library/agents/" + lang + "-reviewer.md"

if exists(agent_file):
    invoke agent from agent_file
    rules_loaded = library/rules/common/*.md + library/rules/{lang}/*.md + (library/rules/web/*.md if target is browser)
    write findings to cycle_context.code_review_report.language_review[lang]
else:
    log "language-specific-review: no agent for language '{lang}', skipping"
    skip silently — generic review in Step 2 still runs
```

## Fallback

If `primary_language` is unset, unknown, or has no matching agent file, this step is a no-op. The generic AI code audit (Step 2 of 02c) still runs. **Never fails the cycle due to missing language agent.**

## Output shape

Added to `code_review_report` as a new key (does not replace anything):

```json
{
  "code_review_report": {
    "language_review": {
      "language": "typescript",
      "agent": "library/agents/typescript-reviewer.md",
      "rules_loaded": ["library/rules/common/*", "library/rules/typescript/*", "library/rules/web/*"],
      "blocking": [...],
      "warnings": [...],
      "informational": [...],
      "uncertain": [...]
    }
  }
}
```

If skipped:
```json
{
  "code_review_report": {
    "language_review": {
      "skipped_reason": "no agent for language 'elixir'"
    }
  }
}
```

## Supported languages (as of 2026-04-23)

- typescript / javascript → `typescript-reviewer`
- python → `python-reviewer`
- rust → `rust-reviewer`
- golang → `golang-reviewer`

Others fall through gracefully. Adding a language = adding `library/agents/<lang>-reviewer.md` + corresponding `library/rules/<lang>/` directory.

## Why this pattern

- **Quality floor improves per stack.** Generic review catches generic issues; language-specific catches Rust lifetime misuse, Python mutable defaults, TS `any` leaks.
- **Additive and graceful.** Zero risk for stacks without an agent — the generic review keeps running.
- **Evolvable.** New agents land independently, validated by `scripts/ci/validate-agents.js`.
