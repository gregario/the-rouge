import { readFileSync, appendFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SeedingChatMessage } from './types'

const CHAT_FILE = 'seeding-chat.jsonl'

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
}
