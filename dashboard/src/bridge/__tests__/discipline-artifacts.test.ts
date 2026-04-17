import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { verifyDisciplineArtifact } from '../discipline-artifacts'

let PROJECT_DIR: string

beforeEach(() => {
  PROJECT_DIR = mkdtempSync(join(tmpdir(), 'rouge-artifact-'))
})

afterEach(() => {
  rmSync(PROJECT_DIR, { recursive: true, force: true })
})

function writeFile(rel: string, body: string): void {
  const full = join(PROJECT_DIR, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
}

function writeDir(rel: string, files: Record<string, string>): void {
  mkdirSync(join(PROJECT_DIR, rel), { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(PROJECT_DIR, rel, name), body)
  }
}

const LONG_BODY = 'x'.repeat(1000)
const TINY_BODY = 'x'.repeat(50)

describe('verifyDisciplineArtifact', () => {
  it('accepts brainstorming when seed_spec/brainstorming.md has real content', () => {
    writeFile('seed_spec/brainstorming.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  it('accepts brainstorming-design-doc.md as an alternate filename', () => {
    writeFile('seed_spec/brainstorming-design-doc.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  it('accepts brainstorming written under docs/ when the agent improvised the path', () => {
    writeFile('docs/brainstorming.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  it('rejects brainstorming when the file exists but is a stub', () => {
    writeFile('seed_spec/brainstorming.md', TINY_BODY)
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no artifact found/i)
  })

  it('rejects brainstorming when no file exists', () => {
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(false)
  })

  it('accepts competition via competition_brief.md', () => {
    writeFile('seed_spec/competition_brief.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'competition').ok).toBe(true)
  })

  it('accepts competition written under docs/', () => {
    writeFile('docs/competition.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'competition').ok).toBe(true)
  })

  it('accepts taste via seed_spec/taste_verdict.md', () => {
    writeFile('seed_spec/taste_verdict.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'taste').ok).toBe(true)
  })

  it('accepts taste written under docs/', () => {
    writeFile('docs/taste.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'taste').ok).toBe(true)
  })

  it('accepts spec via seed_spec/milestones.json', () => {
    writeFile('seed_spec/milestones.json', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts infrastructure via infrastructure_manifest.json', () => {
    writeFile('infrastructure_manifest.json', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(true)
  })

  it('accepts design when design/ has at least one file', () => {
    writeDir('design', { 'layout.yaml': 'hi' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('rejects design when design/ is empty', () => {
    writeDir('design', {})
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(false)
  })

  it('rejects design when design/ only contains dotfiles', () => {
    writeDir('design', { '.DS_Store': '' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(false)
  })

  it('accepts legal-privacy when legal/ has a file', () => {
    writeDir('legal', { 'terms.md': 'hi' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(true)
  })

  it('accepts marketing when marketing/ has a file', () => {
    writeDir('marketing', { 'landing.md': 'hi' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(true)
  })
})
