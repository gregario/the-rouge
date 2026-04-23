# Product-Eval Gold Set

Human-labeled cycles used to calibrate Rouge's product-quality judge
(`src/prompts/loop/02e-evaluation.md` PO lens) against the rubric at
`library/rubrics/product-quality-v1.md`.

## What this exists for

A judge prompt can silently drift. Tests pass, JSON shapes remain valid,
but the distribution of verdicts moves. Without an external anchor there
is no way to notice that "evaluation changed" is the same event as "the
bar moved."

This gold set is the external anchor. For each entry, a human has recorded
what *they* think the rubric scores should be for a real cycle. The
calibrator (`src/launcher/gold-set-calibrator.js`, run via
`rouge eval-calibrate`) compares those human labels against the current
judge's output and requires a quadratic-weighted Cohen's Kappa of ≥ 0.75
per dimension before a prompt change to the judgment layer is considered
safe to promote.

## Who edits this directory

**Humans only.** The self-improve pipeline's blocklist
(`rouge.config.json` → `self_improvement.blocklist` → `library/gold-sets/**`)
prevents Rouge from authoring or editing gold-set entries. If the pipeline
could edit them, it could quietly retune labels to match drifting model
output, and every calibration would pass by construction.

Changes to gold-set entries go through a regular PR review with a human
in the loop. Rubric-version bumps require new labels, not edits to existing ones.

## Entry shape

See `schemas/gold-set-entry-v1.json`. Each entry:

```json
{
  "schema_version": "gold-set-entry-v1",
  "id": "proj-foo-cycle-7",
  "rubric_id": "product-quality",
  "rubric_version": 1,
  "source": {
    "project": "proj-foo",
    "cycle_id": "cycle-7",
    "captured_at": "2026-04-23T12:00:00Z"
  },
  "cycle_context_excerpt": { "product_walk": "...", "code_review_report": "..." },
  "human_labels": {
    "journey_completeness": 3,
    "interaction_fidelity": 2,
    "visual_coherence": 2,
    "content_grounding": 3,
    "edge_resilience": 1,
    "vision_fit": 3
  },
  "human_verdict": "NEEDS_IMPROVEMENT",
  "labeler": "gregj64@gmail.com",
  "labeled_at": "2026-04-23T14:30:00Z",
  "notes": "Journey and copy are strong; edge resilience was obvious — empty list state showed a raw stack trace."
}
```

Scores are integers `0..3` per rubric anchor, or `null` to abstain when
product_walk evidence didn't resolve for that dimension. Abstain excludes
that dimension from the calibration for this entry — it doesn't lower the
score.

## How to label an entry

1. Pick a cycle from a real build. Record enough of `cycle_context`
   inline in `cycle_context_excerpt` to make the scores reproducible —
   product_walk observations and code_review findings are the most useful.
2. Score each rubric dimension against `library/rubrics/product-quality-v1.md`
   anchors. Do not soften — a 1 is a 1. The point is to capture honest
   signal, not to make the model look good.
3. Assign the overall `human_verdict` using the rubric's aggregation rules
   as a starting point, but override if your gut says the aggregated
   verdict is wrong (e.g. edge_resilience scored 0 but you know it's env_limited).
4. Write `notes` explaining *why* — future readers need to see whether a
   calibration regression reflects real judge drift or labeler drift.

## How the calibrator uses these

`rouge eval-calibrate --gold-set library/gold-sets/product-eval --model-labels <path>`

- Loads every `*.json` entry here.
- Expects `--model-labels` to be a JSON file mapping `entry-id →
  {labels: {<dim>: score}, verdict: "..."}` — produced by running the judge
  against the same cycles and extracting the `evaluation_report.po.rubric_scores`.
- Computes quadratic-weighted Cohen's Kappa per dimension.
- Exits 0 if every dimension ≥ `eval_calibration.min_kappa` AND
  `eval_calibration.min_entries` paired entries exist.
- Exits 1 if any dimension fails or collapses.
- Exits 2 if there's not enough data yet.

## Bootstrap

This directory ships empty on purpose. Calibration requires real human
labels; seeding sample data would game the gate. Until
`eval_calibration.min_entries` (default 20) entries exist here, the CLI
exits 2 ("insufficient data") — clear signal that the gate isn't wired
yet, as opposed to a false green.

When min_entries is met, CI can start enforcing the gate on PRs that
touch judgment-layer files.
