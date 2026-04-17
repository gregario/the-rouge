import { readFileSync, appendFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SeedingChatMessage } from './types'
import { rotateJsonlIfNeeded } from './jsonl-rotation'

const CHAT_FILE = 'seeding-chat.jsonl'

// Cap at 1000 messages. Long seeding sessions can rack up hundreds of
// turns; without a cap the file grows unbounded and every readChatLog
// (called per dashboard poll) walks the whole thing. 1000 fits ~5 MB at
// avg 5 KB/msg and covers far more than any real seeding conversation.
const MAX_CHAT_ENTRIES = 1000

export function readChatLog(projectDir: string): SeedingChatMessage[] {
  const path = join(projectDir, CHAT_FILE)
  if (!existsSync(path)) return []

  const raw = readFileSync(path, 'utf-8').trim()
  if (!raw) return []

  const messages: SeedingChatMessage[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      // Skip malformed
    }
  }
  return messages
}

export function appendChatMessage(projectDir: string, message: SeedingChatMessage): void {
  const path = join(projectDir, CHAT_FILE)
  appendFileSync(path, JSON.stringify(message) + '\n')
  rotateJsonlIfNeeded(path, MAX_CHAT_ENTRIES)
}
