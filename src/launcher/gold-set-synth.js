/**
 * Synthetic gold-set generator (P1.18b).
 *
 * Produces gold-set entries for library/gold-sets/product-eval/ without
 * requiring human labor. The "ground truth" comes from deterministic
 * mapping rules: for each target score on each rubric dimension, the
 * generator builds a cycle_context_excerpt whose signals match that
 * dimension's rubric anchor language.
 *
 * Why synthetic instead of human labels: the owner is not a data-labeling
 * worker. Designing the calibrator to depend on owner labels makes the
 * gate permanently dormant. Synthetic ground truth is frozen-in-time —
 * if rubric v1 anchors change meaning, regenerate fixtures against the
 * new anchors (rubric_version bump).
 *
 * Guarantees:
 *   - Deterministic: same plan array → same fixture files, byte-for-byte.
 *   - Schema-compliant: every emitted entry passes validateGoldSetEntry.
 *   - Verdict aggregation matches rubric rules — no zeros → at-least-one-3
 *     + no ones = PRODUCTION_READY; any one = NEEDS_IMPROVEMENT; any zero =
 *     NOT_READY. See library/rubrics/product-quality-v1.md "Aggregating to
 *     PO verdict + confidence."
 *
 * What fixtures exercise:
 *   - Per-dimension Kappa requires score variance across entries on each
 *     dimension. The DEFAULT_PLAN is chosen so every dimension takes at
 *     least 3 distinct values across the 20-entry set — avoids
 *     distribution-collapse on any axis.
 *   - Verdict distribution spans all three verdicts — avoids
 *     verdict-agreement collapse.
 */

const path = require('node:path');
const fs = require('node:fs');

const { RUBRIC_DIMENSIONS, validateGoldSetEntry } = require('./gold-set-calibrator.js');

const SYNTH_LABELER = 'synthetic-v1';
const SYNTH_TIMESTAMP = '2026-04-23T00:00:00Z';
const SYNTH_PROJECT = 'synthetic';

/**
 * 20 score plans covering the PR / NI / NR verdict space with varied
 * per-dimension patterns. Order is: [journey_completeness, interaction_fidelity,
 * visual_coherence, content_grounding, edge_resilience, vision_fit].
 *
 * Invariants (checked by tests):
 *   - Every dimension appears with at least 3 distinct scores across the set.
 *   - At least 4 PR, 7 NI, 7 NR verdicts to keep distributions non-degenerate.
 */
const DEFAULT_PLAN = Object.freeze([
  // PRODUCTION_READY — every dim ≥ 2, at least one 3, no zeros, no ones.
  [3, 3, 3, 3, 3, 3],
  [3, 2, 3, 2, 3, 2],
  [2, 3, 2, 3, 2, 3],
  [3, 3, 2, 2, 3, 2],
  [2, 2, 3, 3, 2, 3],

  // NEEDS_IMPROVEMENT — at least one 1, no zeros.
  [3, 1, 3, 3, 2, 3],
  [2, 1, 2, 3, 2, 2],
  [3, 2, 1, 2, 2, 3],
  [2, 3, 1, 3, 1, 2],
  [1, 2, 2, 2, 3, 2],
  [1, 3, 1, 2, 3, 2],
  [2, 2, 2, 1, 2, 3],
  [3, 2, 2, 1, 1, 3],

  // NOT_READY — at least one 0.
  [0, 3, 3, 3, 3, 3],
  [3, 0, 2, 3, 2, 3],
  [2, 2, 3, 0, 3, 3],
  [3, 2, 2, 3, 0, 2],
  [0, 0, 2, 2, 3, 2],
  [1, 0, 1, 2, 2, 1],
  [0, 1, 2, 0, 1, 0],
]);

/**
 * Pick the rubric-prescribed verdict for a 6-tuple of scores.
 * Mirrors library/rubrics/product-quality-v1.md aggregation:
 *   - any 0 → NOT_READY
 *   - any 1 (and no 0) → NEEDS_IMPROVEMENT
 *   - every score ≥ 2 AND at least one 3 → PRODUCTION_READY
 *   - fallback (e.g. all 2s) → NEEDS_IMPROVEMENT (no dimension at 3 is a
 *     rough product per the rubric — nothing that actively impresses)
 */
function deriveVerdict(scores) {
  const values = RUBRIC_DIMENSIONS.map((dim) => scores[dim]);
  if (values.some((s) => s === 0)) return 'NOT_READY';
  if (values.some((s) => s === 1)) return 'NEEDS_IMPROVEMENT';
  if (values.every((s) => s >= 2) && values.some((s) => s === 3)) return 'PRODUCTION_READY';
  return 'NEEDS_IMPROVEMENT';
}

function scoresFromTuple(tuple) {
  if (!Array.isArray(tuple) || tuple.length !== RUBRIC_DIMENSIONS.length) {
    throw new Error(
      `score tuple must have ${RUBRIC_DIMENSIONS.length} entries; got ${JSON.stringify(tuple)}`
    );
  }
  const out = {};
  for (let i = 0; i < RUBRIC_DIMENSIONS.length; i++) {
    const s = tuple[i];
    if (!Number.isInteger(s) || s < 0 || s > 3) {
      throw new Error(
        `score for ${RUBRIC_DIMENSIONS[i]} must be integer 0..3; got ${JSON.stringify(s)}`
      );
    }
    out[RUBRIC_DIMENSIONS[i]] = s;
  }
  return out;
}

/**
 * Build a minimal cycle_context_excerpt whose fields carry the signals
 * each rubric dimension's anchor would look at. Not a real cycle; just
 * enough shape + language that a reader can see why scores are what they are.
 */
function buildExcerpt(scores) {
  return {
    product_walk: {
      journeys: buildJourneys(scores.journey_completeness),
      screens: buildScreens(scores),
    },
    design_review: {
      category_scores: designCategoryScores(scores.visual_coherence),
      copy_quality: copyQualityNote(scores.content_grounding),
      ai_slop_score: aiSlopScore(scores.visual_coherence),
    },
    functional_correctness: functionalCorrectness(scores),
    console_errors: consoleErrorCount(scores),
    active_spec_fit: visionFitNote(scores.vision_fit),
  };
}

function buildJourneys(score) {
  // journey_completeness anchor: "Every journey in the spec is complete..."
  const arr = [];
  const totalSpec = 3;
  const completed =
    score === 3 ? totalSpec :
    score === 2 ? totalSpec - 1 :
    score === 1 ? 1 :
                  0;
  for (let i = 0; i < totalSpec; i++) {
    arr.push({
      id: `journey-${i + 1}`,
      steps: i < completed ? 4 : (score === 0 ? 1 : 3),
      reached_success_state: i < completed,
      result:
        i < completed
          ? 'visible success state reached'
          : (score === 0
              ? 'blocked at step 1 — button returns no response'
              : 'dead-end at final step; success state not observed'),
    });
  }
  return arr;
}

function buildScreens(scores) {
  const intrScore = scores.interaction_fidelity;
  const edgeScore = scores.edge_resilience;
  const screens = [];
  for (let i = 0; i < 2; i++) {
    const totalElems = 5;
    const dead = intrScore === 3 ? 0 : intrScore === 2 ? 1 : intrScore === 1 ? 3 : 5;
    const interactive = [];
    for (let j = 0; j < totalElems; j++) {
      const isDead = j < dead;
      interactive.push({
        kind: j % 2 === 0 ? 'button' : 'link',
        result: isDead
          ? 'no visible response'
          : 'expected state change observed (toast, navigation, or update)',
        loading_indicator: intrScore >= 2,
      });
    }
    screens.push({
      name: `screen-${i + 1}`,
      interactive_elements: interactive,
      edge_states_handled: edgeStates(edgeScore),
    });
  }
  return screens;
}

function edgeStates(score) {
  // edge_resilience anchor: empty, error, loading, overflow.
  const all = ['empty', 'error', 'loading', 'overflow'];
  const handled =
    score === 3 ? all :
    score === 2 ? all.slice(0, 3) :
    score === 1 ? all.slice(0, 1) :
                  [];
  return {
    handled,
    unhandled: all.filter((s) => !handled.includes(s)),
    note:
      score === 0
        ? 'happy path only; any off-path click dumps user in an uncrossable void'
        : score === 3
          ? 'every observed edge state has explicit handling with user guidance'
          : 'most edges handled, a couple rough',
  };
}

function designCategoryScores(visualScore) {
  // visual_coherence — typography, color, spacing, layout, components.
  const v = visualScore;
  return {
    typography: scoreWord(v),
    color: scoreWord(v),
    spacing: scoreWord(v),
    layout: scoreWord(v),
    components: scoreWord(v),
  };
}

function scoreWord(v) {
  return v === 3 ? 'strong-consistent' :
         v === 2 ? 'mostly-consistent' :
         v === 1 ? 'visibly-inconsistent' :
                   'ai-slop-aesthetic';
}

function copyQualityNote(contentScore) {
  return contentScore === 3
    ? 'labels specific to what button does; errors name what went wrong and what user can do next'
    : contentScore === 2
      ? 'mostly grounded, one or two generic phrases slipped in'
      : contentScore === 1
        ? 'multiple generic / marketing-speak phrases; error messages "Error occurred" without context'
        : 'llm-generic throughout: "next-generation", "unlock value", lorem ipsum remnants';
}

function aiSlopScore(visualScore) {
  // Inverse of visual coherence — higher score = more slop.
  return visualScore === 3 ? 0.1 : visualScore === 2 ? 0.3 : visualScore === 1 ? 0.7 : 0.95;
}

function functionalCorrectness(scores) {
  // A blend of journey + interaction signals.
  const j = scores.journey_completeness;
  const i = scores.interaction_fidelity;
  const avg = (j + i) / 2;
  if (avg >= 2.5) return 'PASS';
  if (avg >= 1.5) return 'NEEDS_IMPROVEMENT';
  return 'FAIL';
}

function consoleErrorCount(scores) {
  // Interaction + edge scores drive console noise.
  const i = scores.interaction_fidelity;
  const e = scores.edge_resilience;
  const min = i === 0 || e === 0 ? 5 : i === 1 || e === 1 ? 2 : 0;
  return min;
}

function visionFitNote(score) {
  return score === 3
    ? 'observed product delivers the stated value proposition; no scope drift'
    : score === 2
      ? 'on-vision with minor scope movement; soul intact'
      : score === 1
        ? 'recognizable as a cousin of the vision, muddied in key intent'
        : 'off-vision; user reading spec would be surprised by what shipped';
}

/**
 * Produce one synthetic gold-set entry. Deterministic given id + tuple.
 */
function synthesizeEntry(id, tuple) {
  const scores = scoresFromTuple(tuple);
  const excerpt = buildExcerpt(scores);
  const verdict = deriveVerdict(scores);
  return {
    schema_version: 'gold-set-entry-v1',
    id,
    rubric_id: 'product-quality',
    rubric_version: 1,
    source: {
      project: SYNTH_PROJECT,
      cycle_id: id,
      captured_at: SYNTH_TIMESTAMP,
    },
    cycle_context_excerpt: excerpt,
    human_labels: scores,
    human_verdict: verdict,
    labeler: SYNTH_LABELER,
    labeled_at: SYNTH_TIMESTAMP,
    notes:
      `Synthetic fixture. cycle_context_excerpt fields are rule-derived from the target scores ` +
      `via src/launcher/gold-set-synth.js — regenerate when the rubric or generator changes.`,
  };
}

/**
 * Emit the default 20-entry plan as a batch. Each entry's id is
 * `synthetic-NN` where NN is the 1-based index zero-padded to 2 chars.
 */
function generateDefaultSet() {
  return DEFAULT_PLAN.map((tuple, i) => {
    const idx = String(i + 1).padStart(2, '0');
    const entry = synthesizeEntry(`synthetic-${idx}`, tuple);
    const check = validateGoldSetEntry(entry);
    if (!check.valid) {
      throw new Error(`internal generator bug: entry ${idx} fails validation: ${check.reason}`);
    }
    return entry;
  });
}

/**
 * Write a batch of entries to disk as one JSON file per entry.
 * File name: `<entry.id>.json`. Pretty-printed with trailing newline.
 *
 * If `overwriteNonSynthetic: false` (default), a file that already exists
 * and whose existing content has a non-synthetic labeler is preserved; the
 * function throws rather than clobber human (or other) labels. Use
 * `overwriteNonSynthetic: true` only when you explicitly want to replace
 * existing entries.
 */
function writeEntries(entries, dir, { overwriteNonSynthetic = false, dryRun = false } = {}) {
  const written = [];
  const skipped = [];
  const refused = [];

  if (!dryRun && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const entry of entries) {
    const file = path.join(dir, `${entry.id}.json`);
    if (fs.existsSync(file) && !overwriteNonSynthetic) {
      try {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (existing.labeler !== SYNTH_LABELER) {
          refused.push({ file, reason: `existing labeler is ${JSON.stringify(existing.labeler)}; refusing to clobber non-synthetic entry` });
          continue;
        }
      } catch (err) {
        refused.push({ file, reason: `existing file unreadable/invalid JSON: ${err.message}` });
        continue;
      }
    }
    if (dryRun) {
      skipped.push(file);
      continue;
    }
    fs.writeFileSync(file, JSON.stringify(entry, null, 2) + '\n');
    written.push(file);
  }
  return { written, skipped, refused };
}

module.exports = {
  DEFAULT_PLAN,
  SYNTH_LABELER,
  deriveVerdict,
  scoresFromTuple,
  buildExcerpt,
  synthesizeEntry,
  generateDefaultSet,
  writeEntries,
};
