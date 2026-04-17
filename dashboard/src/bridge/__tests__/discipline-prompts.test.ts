import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  loadDisciplinePrompt,
  resolveDisciplinePromptPath,
} from '../discipline-prompts'

// We point ROUGE_PROMPTS_DIR at a temp seed-prompts dir so the test
// doesn't rely on the repo's real prompts or on any cwd heuristic.
let PROMPTS_DIR: string
let prevEnv: string | undefined

beforeEach(() => {
  PROMPTS_DIR = mkdtempSync(join(tmpdir(), 'rouge-prompts-'))
  prevEnv = process.env.ROUGE_PROMPTS_DIR
  process.env.ROUGE_PROMPTS_DIR = PROMPTS_DIR
})

afterEach(() => {
  if (prevEnv === undefined) delete process.env.ROUGE_PROMPTS_DIR
  else process.env.ROUGE_PROMPTS_DIR = prevEnv
  rmSync(PROMPTS_DIR, { recursive: true, force: true })
})

function seed(filename: string, body: string): void {
  mkdirSync(PROMPTS_DIR, { recursive: true })
  writeFileSync(join(PROMPTS_DIR, filename), body)
}

describe('resolveDisciplinePromptPath', () => {
  it('maps each discipline to its numbered sub-prompt filename', () => {
    seed('01-brainstorming.md', 'x')
    seed('02-competition.md', 'x')
    seed('03-taste.md', 'x')
    seed('04-spec.md', 'x')
    seed('05-design.md', 'x')
    seed('06-legal-privacy.md', 'x')
    seed('07-marketing.md', 'x')
    seed('08-infrastructure.md', 'x')

    expect(resolveDisciplinePromptPath('brainstorming')).toContain('01-brainstorming.md')
    expect(resolveDisciplinePromptPath('competition')).toContain('02-competition.md')
    expect(resolveDisciplinePromptPath('taste')).toContain('03-taste.md')
    expect(resolveDisciplinePromptPath('spec')).toContain('04-spec.md')
    expect(resolveDisciplinePromptPath('design')).toContain('05-design.md')
    expect(resolveDisciplinePromptPath('legal-privacy')).toContain('06-legal-privacy.md')
    expect(resolveDisciplinePromptPath('marketing')).toContain('07-marketing.md')
    expect(resolveDisciplinePromptPath('infrastructure')).toContain('08-infrastructure.md')
  })

  it('returns null when the file does not exist anywhere', () => {
    expect(resolveDisciplinePromptPath('brainstorming')).toBeNull()
  })
})

describe('loadDisciplinePrompt', () => {
  it('returns the file body for an existing discipline', () => {
    seed('01-brainstorming.md', '# BRAINSTORMING\n\nAsk about user, pain, trigger.')
    const body = loadDisciplinePrompt('brainstorming')
    expect(body).not.toBeNull()
    expect(body).toContain('Ask about user, pain, trigger.')
  })

  it('returns null for a discipline whose file is missing', () => {
    expect(loadDisciplinePrompt('taste')).toBeNull()
  })
})
