import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const ROUGE_DIR = '.rouge'
export const STATE_FILE = 'state.json'

export function statePath(projectDir: string): string {
  const newPath = join(projectDir, ROUGE_DIR, STATE_FILE)
  if (existsSync(newPath)) return newPath
  const oldPath = join(projectDir, STATE_FILE)
  if (existsSync(oldPath)) return oldPath
  return newPath
}

export function statePathForWrite(projectDir: string): string {
  const dir = join(projectDir, ROUGE_DIR)
  mkdirSync(dir, { recursive: true })
  return join(dir, STATE_FILE)
}

export function hasStateFile(projectDir: string): boolean {
  return (
    existsSync(join(projectDir, ROUGE_DIR, STATE_FILE)) ||
    existsSync(join(projectDir, STATE_FILE))
  )
}
