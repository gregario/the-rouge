import { readFileSync, writeFileSync, existsSync } from 'fs'
import { runClaude } from './claude-runner'
import { readChatLog } from './chat-reader'
import { statePath } from './state-path'

/**
 * One-shot working-title derivation. Called after the first user message
 * lands when the project display name is still a placeholder ("Untitled").
 *
 * Replaces the old polling `NameSuggestionBanner` — we ask once, cheaply,
 * with the user's first message as the only context, and write the result
 * directly to state.json.name. User can still rename inline on the
 * project page if they hate it.
 *
 * Fire-and-forget from the caller. All failure modes are silent — a bad
 * title derivation should never block the conversation.
 */
export async function maybeDeriveWorkingTitle(
  projectDir: string,
  firstUserMessage: string,
): Promise<void> {
  try {
    if (!isPlaceholderName(readCurrentName(projectDir))) return
    // Guard: only derive right after the first user message. If there
    // are already multiple human messages, someone else handled naming
    // (or the user renamed manually) — leave it alone.
    const humanCount = readChatLog(projectDir).filter((m) => m.role === 'human').length
    if (humanCount > 1) return

    const prompt = `The user wants to build something. Their first message is below. Propose a 2-4 word working title for this project. Respond with ONLY the title, no punctuation, no explanation, no quotes. If the message is too vague to title, respond with exactly: UNCLEAR

First message:
${firstUserMessage.slice(0, 2000)}`

    const result = await runClaude({
      projectDir,
      prompt,
      sessionId: null,
      model: 'haiku',
      maxTurns: 1,
      timeoutMs: 30_000,
    })
    if (result.error || result.timeout) return

    const title = cleanTitle(result.result)
    if (!title) return

    // Final check: don't overwrite if the user renamed during the derive
    // call (race).
    if (!isPlaceholderName(readCurrentName(projectDir))) return
    writeName(projectDir, title)
  } catch {
    // Silent — title derivation is best-effort.
  }
}

function readCurrentName(projectDir: string): string {
  const file = statePath(projectDir)
  if (!existsSync(file)) return ''
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { name?: string; project?: string }
    return (raw.project ?? raw.name ?? '').trim()
  } catch {
    return ''
  }
}

function writeName(projectDir: string, title: string): void {
  const file = statePath(projectDir)
  if (!existsSync(file)) return
  const raw = JSON.parse(readFileSync(file, 'utf-8'))
  raw.name = title
  raw.project = title
  writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')
}

function isPlaceholderName(n: string): boolean {
  const t = n.trim().toLowerCase()
  return t === '' || t === 'untitled' || t === 'untitled spec'
}

function cleanTitle(raw: string): string | null {
  // Haiku sometimes adds quotes, markdown, or framing despite the prompt.
  // Strip common decorations and reject anything that looks like prose.
  const candidate = raw
    .trim()
    .replace(/^["'`*_]+|["'`*_.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!candidate) return null
  if (candidate.toUpperCase() === 'UNCLEAR') return null
  const words = candidate.split(' ')
  // Rough sanity filter — working titles are short.
  if (words.length === 0 || words.length > 6) return null
  if (candidate.length > 60) return null
  return candidate
}
