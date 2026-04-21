/**
 * Per-discipline recovery prompts for the seed-daemon's self-heal
 * path. When a turn returns bare prose (no gate, no decision, no
 * completion marker), the daemon fires a recovery turn asking Rouge
 * to continue. A discipline-specific prompt gives the recovery a
 * better chance of producing markers than a generic "continue".
 *
 * The daemon calls `recoveryPromptFor(disciplineOrNull)`; if the
 * discipline is unknown (or null), it returns a generic fallback.
 *
 * All prompts are wrapped in a `[SYSTEM]` bracket so the handler's
 * normal marker parsing doesn't mistake them for chat content.
 */

export interface RecoveryPrompt {
  /**
   * The system text injected into the next turn. Keep these short —
   * the handler concatenates them with the orchestrator prompt +
   * sub-prompt on the first turn, so recovery turns already have
   * context; the recovery text just narrows what we expect to see.
   */
  text: string
}

const GENERIC_RECOVERY: RecoveryPrompt = {
  text:
    '[SYSTEM] Recovery: the previous turn returned without markers. ' +
    'Continue the current discipline — emit `[DECISION:]`, `[WROTE:]`, ' +
    '`[HEARTBEAT:]`, `[GATE:]`, or `[DISCIPLINE_COMPLETE:]` as appropriate. ' +
    'If you have a question for the human, emit `[GATE:]` and stop. ' +
    'If you are mid-autonomous-work, emit a `[DECISION:]` or `[HEARTBEAT:]` and return.',
}

const RECOVERY_BY_DISCIPLINE: Record<string, RecoveryPrompt> = {
  brainstorming: {
    text:
      '[SYSTEM] Recovery: brainstorming is in progress but the last turn produced no marker. ' +
      'Check where you are in the four-beat flow (premise gate → shape → deep FA writes → sign-off). ' +
      'If you still owe the human a gate answer, emit `[GATE:]` and stop. ' +
      'If you are mid-FA-write, emit the next `[WROTE: faN-spec-written]` as soon as the FA hits disk. ' +
      'If the skeleton + all FAs are on disk and the rollup is written, emit `[DISCIPLINE_COMPLETE: brainstorming]`.',
  },
  competition: {
    text:
      '[SYSTEM] Recovery: competition is active but the last turn produced no marker. ' +
      'Continue the competitive scan. Emit a `[DECISION:]` for each real competitor you classify, ' +
      'a `[WROTE: competition-analysis]` when the full comparison lands on disk, ' +
      'and `[DISCIPLINE_COMPLETE: competition]` once the human has signed off on the competitive positioning.',
  },
  taste: {
    text:
      '[SYSTEM] Recovery: taste is active but the last turn produced no marker. ' +
      'Continue the references + moodboard work. Emit `[DECISION:]` for each taste anchor you commit to, ' +
      '`[WROTE: taste-brief]` when the taste brief is on disk, ' +
      'and `[DISCIPLINE_COMPLETE: taste]` after the human signs off.',
  },
  spec: {
    text:
      '[SYSTEM] Recovery: spec is mid-decomposition. The three beats are (1) decomposition gate, ' +
      '(2) complexity shape decision, (3) per-FA deep writes. If you are in Beat 3, emit the NEXT ' +
      '`[WROTE: faN-spec-written]` as soon as its FA markdown is on disk — do NOT batch FAs into one message. ' +
      'If you owe a gate answer, emit `[GATE:]` and stop. If all FAs are written and the scope summary ' +
      'is on disk, emit `[DISCIPLINE_COMPLETE: spec]`.',
  },
  infrastructure: {
    text:
      '[SYSTEM] Recovery: infrastructure is deciding the deploy/DB/auth stack. ' +
      'Emit `[DECISION:]` for each resolved choice, `[WROTE: infrastructure-manifest]` when ' +
      '`infrastructure_manifest.json` is on disk, and `[DISCIPLINE_COMPLETE: infrastructure]` ' +
      'once the manifest is complete and the human has signed off on the stack.',
  },
  design: {
    text:
      '[SYSTEM] Recovery: design is producing key screens. Emit `[DECISION:]` for each binding design choice, ' +
      '`[WROTE: design-<screen>]` per screen artifact, and `[DISCIPLINE_COMPLETE: design]` when ' +
      'the design brief and screen set are all on disk with human sign-off.',
  },
  'legal-privacy': {
    text:
      '[SYSTEM] Recovery: legal/privacy is producing the terms + privacy posture. ' +
      'Emit `[DECISION:]` for each resolved legal choice, `[WROTE: legal-brief]` when the artifact ' +
      'is on disk, and `[DISCIPLINE_COMPLETE: legal-privacy]` after human sign-off.',
  },
  marketing: {
    text:
      '[SYSTEM] Recovery: marketing is shaping voice + landing copy. ' +
      'Emit `[DECISION:]` for each positioning choice, `[WROTE: marketing-brief]` when the artifact ' +
      'lands, and `[DISCIPLINE_COMPLETE: marketing]` after human sign-off.',
  },
}

/**
 * Return the discipline-specific recovery prompt, or the generic
 * fallback. Call site: seed-daemon's maybeFireRecovery.
 */
export function recoveryPromptFor(discipline: string | null | undefined): RecoveryPrompt {
  if (!discipline) return GENERIC_RECOVERY
  return RECOVERY_BY_DISCIPLINE[discipline] ?? GENERIC_RECOVERY
}
