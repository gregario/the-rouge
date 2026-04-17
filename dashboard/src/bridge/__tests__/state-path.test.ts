import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { statePath, statePathForWrite, hasStateFile, ROUGE_DIR, STATE_FILE } from '../state-path'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rouge-state-path-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('statePath', () => {
  it('prefers .rouge/state.json when it exists', () => {
    mkdirSync(join(dir, ROUGE_DIR))
    writeFileSync(join(dir, ROUGE_DIR, STATE_FILE), '{}')
    writeFileSync(join(dir, STATE_FILE), '{}')
    expect(statePath(dir)).toBe(join(dir, ROUGE_DIR, STATE_FILE))
  })

  it('falls back to legacy state.json when .rouge/state.json is missing', () => {
    writeFileSync(join(dir, STATE_FILE), '{}')
    expect(statePath(dir)).toBe(join(dir, STATE_FILE))
  })

  it('returns the new path when neither exists (for writes-into-nothing callers)', () => {
    expect(statePath(dir)).toBe(join(dir, ROUGE_DIR, STATE_FILE))
  })
})

describe('statePathForWrite', () => {
  it('always returns the .rouge/state.json path', () => {
    writeFileSync(join(dir, STATE_FILE), '{}')
    expect(statePathForWrite(dir)).toBe(join(dir, ROUGE_DIR, STATE_FILE))
  })

  it('creates .rouge/ if missing', () => {
    expect(existsSync(join(dir, ROUGE_DIR))).toBe(false)
    statePathForWrite(dir)
    expect(existsSync(join(dir, ROUGE_DIR))).toBe(true)
  })
})

describe('hasStateFile', () => {
  it('is true when .rouge/state.json exists', () => {
    mkdirSync(join(dir, ROUGE_DIR))
    writeFileSync(join(dir, ROUGE_DIR, STATE_FILE), '{}')
    expect(hasStateFile(dir)).toBe(true)
  })

  it('is true when only legacy state.json exists', () => {
    writeFileSync(join(dir, STATE_FILE), '{}')
    expect(hasStateFile(dir)).toBe(true)
  })

  it('is false when neither exists', () => {
    expect(hasStateFile(dir)).toBe(false)
  })
})
