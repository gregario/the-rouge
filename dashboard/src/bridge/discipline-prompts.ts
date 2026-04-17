import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Loads the detailed sub-discipline prompt for a given seeding phase.
 *
 * The orchestrator prompt (`00-swarm-orchestrator.md`) only *mentions* the
 * sub-prompt filenames — it never instructs the agent to read them and
 * never inlines their content. As a result, the agent has been running
 * each discipline off four-word descriptions like "Depth-first idea
 * exploration" and improvising. That's why brainstorming was opening
 * with stack-architecture questions instead of asking about user / pain /
 * trigger as the real prompt demands. See #147.
 *
 * We inject the active discipline's full sub-prompt at every transition
 * so Claude has the detailed rules in context when it needs them.
 */

export type Discipline =
  | 'brainstorming'
  | 'competition'
  | 'taste'
  | 'spec'
  | 'infrastructure'
  | 'design'
  | 'legal-privacy'
  | 'marketing'

// Maps discipline names to their prompt filenames in `src/prompts/seeding/`.
const DISCIPLINE_FILES: Record<Discipline, string> = {
  brainstorming: '01-brainstorming.md',
  competition: '02-competition.md',
  taste: '03-taste.md',
  spec: '04-spec.md',
  design: '05-design.md',
  'legal-privacy': '06-legal-privacy.md',
  marketing: '07-marketing.md',
  infrastructure: '08-infrastructure.md',
}

function candidatesFor(filename: string): string[] {
  const envHint = process.env.ROUGE_PROMPTS_DIR
  // When the env var is set it's authoritative — callers use it to pin
  // lookup to a specific directory (tests do this, and operators can use
  // it to point Rouge at a custom prompt checkout). Don't fall back to
  // cwd/__dirname in that case or tests silently pick up the repo's real
  // prompts and false-pass.
  if (envHint) return [resolve(envHint, filename)]
  return [
    // Dashboard invoked from repo root.
    resolve(process.cwd(), 'src/prompts/seeding', filename),
    // Dashboard invoked from its own dir (`cd dashboard && npm run dev`).
    resolve(process.cwd(), '../src/prompts/seeding', filename),
    // __dirname fallbacks — unreliable under Turbopack, useful when the
    // module is imported directly from tests or a standalone server.
    resolve(__dirname, '../../../src/prompts/seeding', filename),
    resolve(__dirname, '../..', '../src/prompts/seeding', filename),
  ]
}

/**
 * Returns the absolute path to a discipline's sub-prompt on disk, or null
 * if we can't find it anywhere. Throws nothing — callers handle null by
 * falling back to the orchestrator's summary alone.
 */
export function resolveDisciplinePromptPath(discipline: Discipline): string | null {
  const filename = DISCIPLINE_FILES[discipline]
  if (!filename) return null
  for (const candidate of candidatesFor(filename)) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Returns the full text of a discipline's sub-prompt, or null if the file
 * can't be located or read. Caller is responsible for handling null —
 * usually by sending the user message bare, which degrades to the old
 * improvised behaviour rather than crashing.
 */
export function loadDisciplinePrompt(discipline: Discipline): string | null {
  const path = resolveDisciplinePromptPath(discipline)
  if (!path) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}
