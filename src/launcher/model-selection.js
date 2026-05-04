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

  // Bookkeeping-only — count story statuses and transition. Cheap.
  'milestone-check':        'sonnet',
};

function getModelForPhase(phase, configOverrides = {}) {
  return configOverrides[phase] || STATE_TO_MODEL[phase] || 'opus';
}

/**
 * Per-story model selection for story-building phase.
 * Routes routine/mechanical stories to Sonnet (5x cheaper cache reads).
 * Escalates to Opus for: foundation, retries, first-in-milestone, complex stories.
 */
function getModelForStory(story, milestone, state, configOverrides = {}) {
  if (configOverrides['story-building']) return configOverrides['story-building'];
  if (story.complexity === 'routine') return 'sonnet';
  if (story.foundation) return 'opus';
  if ((story.attempts || 0) > 0) return 'opus';
  const doneInMilestone = (milestone?.stories || []).filter(s => s.status === 'done').length;
  if (doneInMilestone === 0) return 'opus';
  const acCount = (story.acceptance_criteria || []).length;
  if (acCount <= 3 && (story.depends_on || []).length === 0) return 'sonnet';
  return 'opus';
}

module.exports = { getModelForPhase, getModelForStory, STATE_TO_MODEL };
