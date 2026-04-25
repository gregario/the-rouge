# GC.1 — Judge vs Pipeline Boundary

**Status:** enforced (existing).
**Date:** 2026-04-25 (this doc — the boundary itself has been live since the self-improve subsystem landed).
**Related code:** `rouge.config.json` `self_improvement.{allowlist,blocklist}`, `src/launcher/config-protection.js`, `src/launcher/self-improve-safety.js`, `test/launcher/self-improve-safety.test.js`.

## The boundary

Rouge has two kinds of files that affect what it builds:

- **Generation / operational** files tell Claude *what to build, fix, document, or report*. The phase prompts in `src/prompts/loop/01-building.md`, `03-qa-fixing.md`, `04-analyzing.md`, `05-change-spec-generation.md`, `07-ship-promote.md`, `08-document-release.md`, `09-cycle-retrospective.md`, plus most of `src/prompts/seeding/`. These files are the *factory floor*.

- **Judge / instrument** files define *what "good" looks like, how to score it, and when to gate*. Every `02*` evaluation sub-phase, `06-vision-check.md`, `10-final-review.md`, `seeding/03-taste.md`, `_preamble.md`, every `library/global/*.json` heuristic, every `library/rubrics/**` rubric, every `library/rules/**` rule, every reviewer persona in `library/agents/**`, the templates in `library/templates/**`, the schemas in `schemas/library-entry-v*.json`. These files are the *measurement instrument*.

**Rouge's self-improvement pipeline can edit only generation/operational files. It cannot edit judges, rubrics, schemas, gold-sets, or any other measurement surface.** The judge surface is human-authored.

## Why this matters

A self-improving system that can edit its own measurement instrument will, over time, soften the instrument through sequences of individually-defensible edits until real failures stop being caught. Each edit has a plausible local justification ("this rubric was too strict for this case"); the cumulative effect is a frog that boils over months.

The asymmetry is non-negotiable: Rouge's value comes from honest measurement of what it builds, and a measurement instrument that can be edited by the thing being measured has a known failure mode. Other safety systems we admire (production observability stacks, financial audit logs, regulatory benchmarks) all enforce the same separation.

## Enforcement

Two layers, each standalone:

### `rouge.config.json` `self_improvement` block

```jsonc
{
  "self_improvement": {
    "allowlist": [
      "src/prompts/loop/01-building.md",
      "src/prompts/loop/03-qa-fixing.md",
      "src/prompts/loop/04-analyzing.md",
      "src/prompts/loop/05-change-spec-generation.md",
      "src/prompts/loop/07-ship-promote.md",
      "src/prompts/loop/08-document-release.md",
      "src/prompts/loop/09-cycle-retrospective.md",
      "src/prompts/seeding/00-foundation-building.md",
      // ... operational seeding disciplines
    ],
    "blocklist": [
      "src/prompts/loop/02*.md",
      "src/prompts/loop/06-vision-check.md",
      "src/prompts/loop/10-final-review.md",
      "src/prompts/loop/_preamble.md",
      "src/prompts/seeding/03-taste.md",
      "library/**",
      "schemas/**",
      "rouge.config.json",
      "rouge-vision.json"
    ]
  }
}
```

### `config-protection.js` pre-write hook

The retrospective phase drafts self-improvement PRs but never auto-applies them. Before any write, the pre-write hook checks the target path against the allowlist/blocklist; blocked paths are dropped with a structured log entry. The retrospective phase records which suggestions were dropped so the human reviewer sees them when reading the PR.

### Test enforcement

`test/launcher/self-improve-safety.test.js` asserts:
1. Every blocklist pattern is non-empty and matches at least one real file (no dead patterns).
2. Every file in the allowlist is a generation/operational prompt (greps for judge keywords; fails if any allowlisted file contains the rubric/heuristic markers).
3. No path is in both allowlist and blocklist.
4. The retrospective phase can produce a draft amendment file but cannot apply it.

## Repair path when a judge surface needs to change

When a heuristic is miscalibrated, a rubric is wrong, or a schema needs evolution:

1. Human edits the file.
2. PR includes the rationale (calibration data, gold-set diff, failed examples).
3. Reviewer verifies the change isn't being driven by retrospective-suggested drift.
4. Merge.

Never: retrospective draft → auto-applied. Never: AI edit to a judge file via any pipeline, even with human approval at the PR stage, because the *suggestion source* matters as much as the merge.

## Out of scope

- **Judge surface evolution at language-model release boundaries.** When Anthropic ships a new model that changes evaluation behavior, rubrics may need recalibration. That's a planned, human-authored sweep, not a self-improvement event.
- **Rouge's own dogfood metrics.** Rouge measuring how well Rouge builds products is the inner loop; the outer loop (humans deciding whether Rouge gets better at the meta-task) is governed by ordinary code review, not GC.1.
