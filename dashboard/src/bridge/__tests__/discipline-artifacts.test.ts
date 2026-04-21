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

  // Spec contract is narrative AND decomposition. Accepting just one
  // (uat-test, 2026-04-21) lets foundation kick off with an empty ledger.
  it('rejects spec when only seed_spec/milestones.json exists (no narrative)', () => {
    writeFile('seed_spec/milestones.json', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(false)
  })

  it('rejects spec when only seed_spec/spec.md exists (no decomposition)', () => {
    writeFile('seed_spec/spec.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(false)
  })

  it('accepts spec when both seed_spec/milestones.json AND seed_spec/spec.md exist', () => {
    writeFile('seed_spec/milestones.json', LONG_BODY)
    writeFile('seed_spec/spec.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts spec when milestones.json pairs with docs/spec.md (agent improv)', () => {
    writeFile('seed_spec/milestones.json', LONG_BODY)
    writeFile('docs/spec.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts infrastructure via infrastructure_manifest.json', () => {
    writeFile('infrastructure_manifest.json', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(true)
  })

  it('accepts design when all three pass files exist', () => {
    writeFile('design/pass-1-ux-architecture.yaml', 'x'.repeat(400))
    writeFile('design/pass-2-component-design.yaml', 'x'.repeat(400))
    writeFile('design/pass-3-visual-design.yaml', 'x'.repeat(400))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('accepts design when the three pass files use underscore names (testimonial session shape)', () => {
    // Agent wrote pass_1_ux_architecture.yaml etc. even with hyphens
    // pinned in the sub-prompt. Recognise the work.
    writeFile('design/pass_1_ux_architecture.yaml', 'x'.repeat(400))
    writeFile('design/pass_2_component_design.yaml', 'x'.repeat(400))
    writeFile('design/pass_3_visual_design.yaml', 'x'.repeat(400))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('still rejects when only one underscore-named pass exists (incomplete design)', () => {
    writeFile('design/pass_1_ux_architecture.yaml', 'x'.repeat(400))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(false)
  })

  it('rejects design when only Pass 1 exists (phantom-complete bug from Praise session)', () => {
    writeFile('design/pass-1-ux-architecture.yaml', 'x'.repeat(400))
    // Pass 2 and Pass 3 missing — the exact failure mode the user
    // flagged. Single-file design/ shouldn't satisfy the marker.
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'design')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/pass-2-component-design/)
  })

  it('accepts design via combined design/design.yaml when large enough', () => {
    writeFile('design/design.yaml', 'x'.repeat(2500))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('rejects a small design/design.yaml that likely contains only one pass', () => {
    writeFile('design/design.yaml', 'x'.repeat(400))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(false)
  })

  it('accepts design via seed_spec/design_artifact.md fallback (old convention)', () => {
    writeFile('seed_spec/design_artifact.md', 'x'.repeat(2500))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('accepts design via docs/design.md when agent improvises', () => {
    writeFile('docs/design.md', 'x'.repeat(2500))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(true)
  })

  it('rejects design when no artifact pattern is satisfied', () => {
    writeDir('design', { '.DS_Store': '' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'design').ok).toBe(false)
  })

  it('accepts legal-privacy when legal/ has a file', () => {
    writeDir('legal', { 'terms.md': 'hi' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(true)
  })

  it('accepts legal-privacy via docs/legal.md fallback', () => {
    writeFile('docs/legal.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(true)
  })

  it('accepts marketing when marketing/ has a file', () => {
    writeDir('marketing', { 'landing.md': 'hi' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(true)
  })

  it('accepts marketing via seed_spec/marketing.md fallback', () => {
    writeFile('seed_spec/marketing.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(true)
  })

  it('keeps infrastructure strict — only infrastructure_manifest.json wins', () => {
    writeFile('docs/infrastructure.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(false)
    writeFile('infrastructure_manifest.json', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(true)
  })
})
