/**
 * Typical wall-clock durations per seeding discipline, in seconds.
 *
 * Used by two callers:
 *   1. Chat panel's `ElapsedTimeIndicator` — renders "typical for
 *      <discipline>: <low>–<high>" under the "Rouge is thinking" bar.
 *   2. `use-seeding` — derives the stall-detection threshold, so long
 *      disciplines (spec, design) don't false-alarm as stalled when
 *      they legitimately take 5–10 minutes for one turn.
 *
 * The daemon's background heartbeat ticker writes the heartbeat file
 * every 5s regardless of what the main loop is doing, so a genuine
 * stall is detectable well inside the 30s default. This per-discipline
 * table is the belt-and-braces: on the off chance the event loop is
 * pinned (a very slow sync operation) or some pathological case, the
 * UI won't yell about a stall while Rouge is genuinely inside a
 * normal-length turn for its discipline.
 */
export const TYPICAL_DURATION_SEC: Record<string, { low: number; high: number }> = {
  brainstorming: { low: 60, high: 180 },
  competition: { low: 90, high: 240 },
  taste: { low: 60, high: 150 },
  spec: { low: 180, high: 480 },
  infrastructure: { low: 60, high: 180 },
  design: { low: 240, high: 600 },
  'legal-privacy': { low: 60, high: 180 },
  marketing: { low: 120, high: 300 },
}

/**
 * Derive a stall threshold in milliseconds for a given discipline.
 *
 * Rule: max(defaultMs, typical.high * 1000 + 60000). So a discipline
 * with typical.high of 600s gets a 660s stall threshold (11 min); a
 * discipline with typical.high of 180s keeps the 30s default. The 60s
 * buffer on top of typical.high catches the "daemon actually died"
 * case without firing while Rouge is genuinely still within a
 * reasonable turn window.
 */
export function stallThresholdMsForDiscipline(
  discipline: string | null | undefined,
  defaultMs: number,
): number {
  if (!discipline) return defaultMs
  const typical = TYPICAL_DURATION_SEC[discipline]
  if (!typical) return defaultMs
  const derived = typical.high * 1000 + 60_000
  return Math.max(defaultMs, derived)
}
