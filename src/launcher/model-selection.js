/**
 * V3 Per-phase model selection.
 *
 * Default is Opus — the work Rouge does is almost entirely reasoning
 * (spec decomposition, code review, root-cause analysis, ship-readiness
 * judgement, spin detection). Sonnet was originally used for "mechanical"
 * phases to save cost, but most of those phases turned out to be
 * judgement-heavy in practice:
 *
 *   - foundation-building: "do we need a shared data model here" is a
 *     design call, not mechanical.
 *   - foundation-eval / milestone-fix: run the evaluation sub-phase
 *     chain (test-integrity → code-review → product-walk → evaluation);
 *     each sub-phase is reasoning.
 *   - ship-promote: "is this actually ready to ship" is judgement.
 *   - story-diagnosis: root-cause analysis of failure.
 *
 * The one remaining Sonnet assignment is `milestone-check`: a boolean
 * "are all stories done?" that really is bookkeeping.
 *
 * Override per-phase via `rouge.config.json.model_overrides.<phase>`.
 */

const STATE_TO_MODEL = {
  'seeding':                'opus',
  'analyzing':              'opus',
  'vision-check':           'opus',
  'generating-change-spec': 'opus',
  'final-review':           'opus',
  'story-building':         'opus',
  'foundation':             'opus',
  'foundation-eval':        'opus',
  'milestone-fix':          'opus',
  'shipping':               'opus',
  'story-diagnosis':        'opus',

  // Bookkeeping-only — count story statuses and transition. Cheap.
  'milestone-check':        'sonnet',
};

function getModelForPhase(phase, configOverrides = {}) {
  return configOverrides[phase] || STATE_TO_MODEL[phase] || 'opus';
}

module.exports = { getModelForPhase, STATE_TO_MODEL };
