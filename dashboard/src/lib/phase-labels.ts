import type { ProjectState } from './types'

/**
 * User-facing phase labels.
 *
 * Rouge's internal state names (`foundation`, `foundation-eval`,
 * `generating-change-spec`, etc.) are precise but cryptic. The page
 * used to surface them raw, which caused user confusion when someone
 * read "foundation" as the *product* milestone called "Foundation &
 * First-Run Setup" instead of the launcher's scaffolding phase.
 *
 * Every surface that renders a phase name should route through
 * `phaseLabel()`. `phaseGloss()` provides a longer sentence suitable
 * for tooltips / hover hints so power users can still find the
 * original vocabulary.
 */

interface Label {
  short: string
  gloss: string
}

const LABELS: Record<string, Label> = {
  seeding: {
    short: 'Seeding the spec',
    gloss: 'Interactive brainstorm + discipline work to shape what Rouge is going to build.',
  },
  ready: {
    short: 'Ready to build',
    gloss: 'The spec is locked and Rouge is waiting for you to press Start.',
  },
  foundation: {
    short: 'Setting up the project',
    gloss: 'Scaffolding the database schema, auth, deploy pipeline, and seed data before any user story runs. Internal phase: foundation.',
  },
  'foundation-eval': {
    short: 'Checking the setup',
    gloss: 'Evaluating foundation completeness across 6 dimensions before starting stories. Internal phase: foundation-eval.',
  },
  'story-building': {
    short: 'Building this story',
    gloss: 'TDD-building the current story. Internal phase: story-building.',
  },
  'milestone-check': {
    short: 'Reviewing the milestone',
    gloss: 'Running test-integrity, code review, product walk, and PO review on the completed stories. Internal phase: milestone-check.',
  },
  'milestone-fix': {
    short: 'Fixing review findings',
    gloss: 'Addressing gaps that the milestone review flagged. Internal phase: milestone-fix.',
  },
  analyzing: {
    short: 'Analysing what just happened',
    gloss: 'Deciding whether to deepen, broaden, pivot, or ship based on the latest evaluation. Internal phase: analyzing.',
  },
  'generating-change-spec': {
    short: 'Planning extra work',
    gloss: 'Converting analysis recommendations into new stories. Internal phase: generating-change-spec.',
  },
  'vision-check': {
    short: 'Checking alignment with the vision',
    gloss: 'Making sure the build is still on vision before shipping. Internal phase: vision-check.',
  },
  shipping: {
    short: 'Publishing',
    gloss: 'Version bump, changelog, PR, deploy. Internal phase: shipping.',
  },
  'final-review': {
    short: 'Final walkthrough',
    gloss: 'Last customer walk-through before marking the project complete. Internal phase: final-review.',
  },
  complete: {
    short: 'Shipped',
    gloss: 'The project is live and marked complete.',
  },
  escalation: {
    short: 'Needs your input',
    gloss: "Rouge hit something it can't resolve on its own. Open the escalation to respond, dismiss, hand off, or abort.",
  },
  'waiting-for-human': {
    short: 'Waiting for you',
    gloss: 'Paused until you take an action.',
  },
}

export function phaseLabel(state: ProjectState | string): string {
  return LABELS[state]?.short ?? state
}

export function phaseGloss(state: ProjectState | string): string {
  return LABELS[state]?.gloss ?? ''
}

/**
 * Plural list of all known states. Exported so tests can assert
 * coverage when a new state is added to ProjectState.
 */
export function knownPhaseStates(): string[] {
  return Object.keys(LABELS)
}
