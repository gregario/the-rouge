/**
 * V3 Per-phase model selection — Opus for reasoning, Sonnet for mechanical.
 * Estimated 40-50% cost reduction vs all-Opus.
 */

const STATE_TO_MODEL = {
  // Reasoning-heavy → Opus
  'seeding':                'opus',
  'analyzing':              'opus',
  'vision-check':           'opus',
  'generating-change-spec': 'opus',
  'final-review':           'opus',
  'story-building':         'opus',

  // Mechanical → Sonnet
  'foundation':             'sonnet',
  'foundation-eval':        'sonnet',
  'milestone-check':        'sonnet',
  'milestone-fix':          'sonnet',
  'shipping':               'sonnet',
  'story-diagnosis':        'sonnet',
};

function getModelForPhase(phase, configOverrides = {}) {
  return configOverrides[phase] || STATE_TO_MODEL[phase] || 'opus';
}

module.exports = { getModelForPhase, STATE_TO_MODEL };
