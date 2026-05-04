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
const REAL_CONTENT = 'x'.repeat(200)

const BRAINSTORMING_BODY = [
  '# Product Brainstorm',
  'x'.repeat(600),
  '## Classifier Signals',
  '- entity_count: 2',
  '- integration_count: 0',
  '- role_count: 1',
  '- journey_count: 1',
  '- screen_count: 1',
].join('\n')

const VALID_MILESTONES = JSON.stringify({
  milestones: [{
    name: 'MVP',
    stories: [
      { id: 's-1', name: 'First story — user can sign up and see dashboard', status: 'pending', acceptance_criteria: ['User sees welcome screen', 'Navigation renders correctly'] },
      { id: 's-2', name: 'Second story — data model and seed data', status: 'pending', acceptance_criteria: ['Schema migrates', 'Seed data loads'] },
      { id: 's-3', name: 'Third story — core CRUD operations', status: 'pending', acceptance_criteria: ['Create works', 'Read works', 'Update works', 'Delete works'] },
    ],
  }],
}, null, 2)

const VALID_MANIFEST = JSON.stringify({
  deploy: { target: 'vercel', mode: 'serverless', reason: 'Best fit for Next.js with edge functions' },
  database: { type: 'postgres', provider: 'supabase', client: 'drizzle', reason: 'Managed Postgres with generous free tier' },
  auth: { strategy: 'email-password', provider: 'supabase-auth', notes: 'Built-in with Supabase' },
  integrations: [],
}, null, 2)

describe('verifyDisciplineArtifact', () => {
  it('accepts brainstorming when seed_spec/brainstorming.md has real content', () => {
    writeFile('seed_spec/brainstorming.md', BRAINSTORMING_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  it('accepts brainstorming-design-doc.md as an alternate filename', () => {
    writeFile('seed_spec/brainstorming-design-doc.md', BRAINSTORMING_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  it('accepts brainstorming written under docs/ when the agent improvised the path', () => {
    writeFile('docs/brainstorming.md', BRAINSTORMING_BODY)
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
    writeFile('seed_spec/milestones.json', VALID_MILESTONES)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts spec via seed_spec/spec.md when agent inlines', () => {
    writeFile('seed_spec/spec.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts spec via docs/spec.md when agent improvises', () => {
    writeFile('docs/spec.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'spec').ok).toBe(true)
  })

  it('accepts infrastructure via infrastructure_manifest.json', () => {
    writeFile('infrastructure_manifest.json', VALID_MANIFEST)
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

  it('accepts legal-privacy when legal/ has a file with real content', () => {
    writeDir('legal', { 'terms.md': REAL_CONTENT })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(true)
  })

  it('accepts legal-privacy via docs/legal.md fallback', () => {
    writeFile('docs/legal.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(true)
  })

  it('accepts marketing when marketing/ has a file with real content', () => {
    writeDir('marketing', { 'landing.md': REAL_CONTENT })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(true)
  })

  it('accepts marketing via seed_spec/marketing.md fallback', () => {
    writeFile('seed_spec/marketing.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(true)
  })

  it('keeps infrastructure strict — only infrastructure_manifest.json wins', () => {
    writeFile('docs/infrastructure.md', LONG_BODY)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(false)
    writeFile('infrastructure_manifest.json', VALID_MANIFEST)
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(true)
  })

  // ── Schema validation tests ─────────────────────────────────────

  it('rejects milestones.json with valid JSON but wrong structure', () => {
    writeFile('seed_spec/milestones.json', JSON.stringify({ foo: 'bar', padding: 'x'.repeat(500) }))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'spec')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/schema validation/)
    expect(r.schemaErrors).toBeDefined()
    expect(r.schemaErrors!.some(e => e.field === 'milestones')).toBe(true)
  })

  it('rejects milestones.json with empty milestones array', () => {
    writeFile('seed_spec/milestones.json', JSON.stringify({ milestones: [], padding: 'x'.repeat(500) }))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'spec')
    expect(r.ok).toBe(false)
    expect(r.schemaErrors).toBeDefined()
  })

  it('rejects infrastructure_manifest.json with valid JSON but missing deploy.target', () => {
    writeFile('infrastructure_manifest.json', JSON.stringify({ database: null, padding: 'x'.repeat(200) }))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/schema validation/)
    expect(r.schemaErrors!.some(e => e.field === 'deploy')).toBe(true)
  })

  it('accepts infrastructure_manifest.json with stub: true (auto-generated for skipped disciplines)', () => {
    writeFile('infrastructure_manifest.json', JSON.stringify({
      stub: true,
      stub_reason: 'XS project',
      deploy: { target: 'vercel' },
      database: null,
      auth: null,
      integrations: [],
    }, null, 2))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'infrastructure').ok).toBe(true)
  })

  it('rejects sizing.json with invalid project_size', () => {
    writeFile('seed_spec/sizing.json', JSON.stringify({
      project_size: 'HUGE',
      signals: { entity_count: 1, integration_count: 0, role_count: 1, journey_count: 1, screen_count: 1 },
      reasoning: 'test',
    }))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'sizing')
    expect(r.ok).toBe(false)
    expect(r.schemaErrors!.some(e => e.field === 'project_size')).toBe(true)
  })

  it('accepts valid sizing.json', () => {
    writeFile('seed_spec/sizing.json', JSON.stringify({
      schema_version: 'sizing-v1',
      project_size: 'XS',
      signals: { entity_count: 1, integration_count: 0, role_count: 1, journey_count: 1, screen_count: 1 },
      reasoning: 'Classified XS: all signals low',
      classifier_version: 'bridge-v1',
      classified_at: new Date().toISOString(),
      decided_by: 'auto-classifier',
      human_override: null,
    }))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'sizing').ok).toBe(true)
  })

  it('rejects sizing.json that is not valid JSON but meets byte floor', () => {
    writeFile('seed_spec/sizing.json', 'this is not json but it is over fifty bytes of content to pass the size check')
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'sizing')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/schema validation/)
    expect(r.schemaErrors!.some(e => e.actual === 'parse error')).toBe(true)
  })

  it('falls back to spec.md when milestones.json fails schema validation', () => {
    // milestones.json exists but has wrong structure
    writeFile('seed_spec/milestones.json', JSON.stringify({ foo: 'bar', padding: 'x'.repeat(500) }))
    // But spec.md also exists and is large enough (no schema check for .md)
    writeFile('seed_spec/spec.md', LONG_BODY)
    // Schema failure on milestones.json should still reject (it's checked first
    // and fails structurally), but spec.md would pass if milestones.json
    // weren't checked first. The current behavior: milestones.json is checked
    // first, fails schema, returns failure immediately.
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'spec')
    expect(r.ok).toBe(false)
  })

  // ── minFileBytes tests (V-13 fix) ──────────────────────────────

  it('rejects legal-privacy when legal/ has only empty files', () => {
    writeDir('legal', { 'terms.md': '', 'privacy.md': '' })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'legal-privacy').ok).toBe(false)
  })

  it('rejects marketing when marketing/ has only tiny files', () => {
    writeDir('marketing', { 'landing.md': 'x'.repeat(10) })
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'marketing').ok).toBe(false)
  })

  // ── Taste kill verdict ──────────────────────────────────────────

  it('detects taste kill verdict and sets killVerdict flag', () => {
    writeFile('seed_spec/taste.md', [
      '# Taste Verdict',
      '',
      'The idea was pressure-tested across all dimensions. The fundamental problem is that no concrete persona exists. Without a specific user in mind, the product has no anchor and will drift during the build phase. The competitive landscape also shows three strong incumbents.',
      '',
      '```json',
      '{ "discipline": "taste", "verdict": "kill", "mode": "hold", "confidence": 0.9, "graveyard_entry": { "killed_because": "no persona" } }',
      '```',
    ].join('\n'))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'taste')
    expect(r.ok).toBe(true)
    expect(r.killVerdict).toBe(true)
  })

  it('does not set killVerdict for taste pass', () => {
    writeFile('seed_spec/taste.md', [
      '# Taste Verdict',
      '',
      'Strong idea with clear persona, validated problem, and identifiable killer edge. Scope boundaries are crisp. The expansion mode confirmed the 10-star vision is achievable within two build cycles. Competitive analysis validates the gap.',
      '',
      '```json',
      '{ "discipline": "taste", "verdict": "pass", "mode": "hold", "confidence": 0.85, "sharpened_brief": { "one_liner": "test" } }',
      '```',
    ].join('\n'))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'taste')
    expect(r.ok).toBe(true)
    expect(r.killVerdict).toBeUndefined()
  })

  // ── Brainstorming Classifier Signals check ─────────────────────

  it('rejects brainstorming without Classifier Signals section', () => {
    writeFile('seed_spec/brainstorming.md', 'x'.repeat(600))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Classifier Signals/)
  })

  it('accepts brainstorming with Classifier Signals section', () => {
    writeFile('seed_spec/brainstorming.md', [
      '# Product Brainstorm',
      'x'.repeat(500),
      '## Classifier Signals',
      '- entity_count: 2',
      '- integration_count: 0',
      '- role_count: 1',
      '- journey_count: 1',
      '- screen_count: 1',
    ].join('\n'))
    expect(verifyDisciplineArtifact(PROJECT_DIR, 'brainstorming').ok).toBe(true)
  })

  // ── Design slop_detected check ─────────────────────────────────

  it('rejects design with slop_detected: true in a pass file', () => {
    writeFile('design/pass-1-ux-architecture.yaml', 'slop_detected: false\n' + 'x'.repeat(400))
    writeFile('design/pass-2-component-design.yaml', 'slop_detected: true\n' + 'x'.repeat(400))
    writeFile('design/pass-3-visual-design.yaml', 'slop_detected: false\n' + 'x'.repeat(400))
    const r = verifyDisciplineArtifact(PROJECT_DIR, 'design')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/slop_detected/)
  })
})
