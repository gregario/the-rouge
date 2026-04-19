/**
 * Bridge payloads arrive as `string` on the wire. The dashboard types
 * narrow those strings to finite unions (ProjectState, SeedingDiscipline,
 * StoryStatus, etc.), which is only safe if the value really is one
 * of the permitted members. Previously the mapper used bare `as`
 * casts that silently let a launcher typo leak through:
 *
 *   raw.currentDiscipline = 'brainstormng'   // typo on disk
 *   mapped.currentDiscipline = 'brainstormng' as SeedingDiscipline
 *   // DisciplineStepper can't find it → blank render, no warning
 *
 * These helpers validate the value against the known set, log a
 * warning once per unknown value, and return either the narrowed
 * value or `undefined` so callers can render a graceful empty state
 * instead of crashing.
 */

const warnedValues = new Map<string, Set<string>>()

function warnOnce(tag: string, value: string): void {
  if (typeof console === 'undefined') return
  let seen = warnedValues.get(tag)
  if (!seen) {
    seen = new Set()
    warnedValues.set(tag, seen)
  }
  if (seen.has(value)) return
  seen.add(value)
  // eslint-disable-next-line no-console -- one-time dev surface for schema drift
  console.warn(
    `[validate-enum] ${tag}: unknown value "${value}" — launcher schema and dashboard type are out of sync`,
  )
}

/**
 * Returns `value` if it's a member of `allowed`, otherwise undefined
 * plus a one-time console.warn tagged with `tag` for diagnosis.
 */
export function narrowEnum<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
  tag: string,
): T | undefined {
  if (value == null) return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  warnOnce(tag, value)
  return undefined
}

/**
 * Like narrowEnum but returns a supplied fallback when the value is
 * unknown, for fields where `undefined` would cascade into a crash.
 */
export function narrowEnumWithDefault<T extends string>(
  value: string | undefined | null,
  allowed: readonly T[],
  fallback: T,
  tag: string,
): T {
  return narrowEnum(value, allowed, tag) ?? fallback
}
