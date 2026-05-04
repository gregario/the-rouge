import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Discipline } from './discipline-prompts'
import {
  validateSizing,
  validateInfraManifest,
  validateMilestones,
  type ArtifactKind,
  type ValidationResult,
  type SchemaError,
} from './artifact-schemas'

/**
 * Verifies the artifact(s) a discipline is required to produce before its
 * `[DISCIPLINE_COMPLETE: X]` marker is accepted.
 *
 * The orchestrator prompt is emphatic that the marker must follow real
 * on-disk content, not summaries or intentions (lines 30-51 of
 * `00-swarm-orchestrator.md`). The agent still emits the marker
 * prematurely sometimes — today's testimonials run did so with zero
 * brainstorming artifact on disk. Policing it agent-side was not
 * sufficient; we now police it dashboard-side. See #147.
 */

type ArtifactSpec =
  | { kind: 'file'; path: string; minBytes: number; schema?: ArtifactKind }
  | { kind: 'dir'; path: string; minFiles: number; minFileBytes?: number }
  // All listed files must exist with their minBytes. Used where a
  // discipline's contract mandates multiple discrete outputs (e.g.
  // DESIGN's three scored passes) — a single-dir existence check
  // accepts work that only did one pass and called it done.
  | { kind: 'files'; paths: { path: string; minBytes: number }[] }

// Each discipline produces at least one of these artifacts. Any hit wins.
// Paths are relative to the project directory — `join(projectDir, path)`
// handles separators on Windows and Unix.
//
// Every discipline has a canonical output path pinned in its sub-prompt.
// The verifier also accepts common alternatives agents have been seen to
// improvise into (`docs/`, inline markdown for directory-artifacts) so
// real work is recognised rather than rejected on a path technicality.
// Infrastructure stays strict because `infrastructure_manifest.json` is
// consumed by the launcher at build time — the path is load-bearing.
const ARTIFACT_SPECS: Record<Discipline, ArtifactSpec[]> = {
  sizing: [
    { kind: 'file', path: 'seed_spec/sizing.json', minBytes: 50, schema: 'sizing' },
  ],
  brainstorming: [
    { kind: 'file', path: 'seed_spec/brainstorming.md', minBytes: 500 },
    { kind: 'file', path: 'seed_spec/brainstorming-design-doc.md', minBytes: 500 },
    { kind: 'file', path: 'docs/brainstorming.md', minBytes: 500 },
  ],
  competition: [
    { kind: 'file', path: 'seed_spec/competition.md', minBytes: 500 },
    { kind: 'file', path: 'seed_spec/competition_brief.md', minBytes: 500 },
    { kind: 'file', path: 'docs/competition.md', minBytes: 500 },
    { kind: 'file', path: 'docs/competition_brief.md', minBytes: 500 },
  ],
  taste: [
    { kind: 'file', path: 'seed_spec/taste.md', minBytes: 300 },
    { kind: 'file', path: 'seed_spec/taste_verdict.md', minBytes: 300 },
    { kind: 'file', path: 'docs/taste.md', minBytes: 300 },
    { kind: 'file', path: 'docs/taste_verdict.md', minBytes: 300 },
  ],
  spec: [
    { kind: 'file', path: 'seed_spec/milestones.json', minBytes: 500, schema: 'milestones' },
    { kind: 'file', path: 'seed_spec/spec.md', minBytes: 500 },
    { kind: 'file', path: 'docs/spec.md', minBytes: 500 },
  ],
  infrastructure: [
    { kind: 'file', path: 'infrastructure_manifest.json', minBytes: 50, schema: 'infrastructure-manifest' },
  ],
  design: [
    // Primary: all three scored passes must exist as discrete YAML
    // artifacts. Prevents the phantom-complete pattern where Pass 1
    // ran, the agent emitted DISCIPLINE_COMPLETE, and Pass 2/3 were
    // never actually performed — observed in the Praise session.
    {
      kind: 'files',
      paths: [
        { path: 'design/pass-1-ux-architecture.yaml', minBytes: 300 },
        { path: 'design/pass-2-component-design.yaml', minBytes: 300 },
        { path: 'design/pass-3-visual-design.yaml', minBytes: 300 },
      ],
    },
    // Underscore variant of the three-pass set. Observed in the
    // testimonial session: the agent wrote `pass_1_ux_architecture.yaml`
    // rather than `pass-1-...`, even with the hyphenated names pinned
    // in the sub-prompt. Recognise the work rather than reject 80KB of
    // real content over a typographic detail.
    {
      kind: 'files',
      paths: [
        { path: 'design/pass_1_ux_architecture.yaml', minBytes: 300 },
        { path: 'design/pass_2_component_design.yaml', minBytes: 300 },
        { path: 'design/pass_3_visual_design.yaml', minBytes: 300 },
      ],
    },
    // Fallback: combined design.yaml large enough to plausibly contain
    // all three passes. ~2KB covers the orchestrator's scored-dimension
    // structure for three passes.
    { kind: 'file', path: 'design/design.yaml', minBytes: 2000 },
    // Legacy / agent-improvised paths. Keep for backwards compat with
    // older convention (construction-coordinator's design_artifact.md).
    { kind: 'file', path: 'seed_spec/design.md', minBytes: 2000 },
    { kind: 'file', path: 'seed_spec/design_artifact.md', minBytes: 2000 },
    { kind: 'file', path: 'seed_spec/design_artifact.yaml', minBytes: 2000 },
    { kind: 'file', path: 'docs/design.md', minBytes: 2000 },
  ],
  'legal-privacy': [
    { kind: 'dir', path: 'legal', minFiles: 1, minFileBytes: 100 },
    { kind: 'file', path: 'seed_spec/legal.md', minBytes: 300 },
    { kind: 'file', path: 'docs/legal.md', minBytes: 300 },
  ],
  marketing: [
    { kind: 'dir', path: 'marketing', minFiles: 1, minFileBytes: 100 },
    { kind: 'file', path: 'seed_spec/marketing.md', minBytes: 300 },
    { kind: 'file', path: 'docs/marketing.md', minBytes: 300 },
  ],
}

export interface ArtifactCheck {
  ok: boolean
  discipline: Discipline
  reason?: string
  checkedPaths: string[]
  schemaErrors?: SchemaError[]
  killVerdict?: boolean
}

function checkTasteKillVerdict(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/)
    if (!jsonMatch) return false
    const data = JSON.parse(jsonMatch[1])
    return data?.verdict === 'kill'
  } catch {
    return false
  }
}

function tryParseJson(filePath: string): unknown | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function runSchemaCheck(
  projectDir: string,
  path: string,
  schema: ArtifactKind,
): ValidationResult | null {
  const data = tryParseJson(join(projectDir, path))
  if (data === null) {
    return { ok: false, errors: [{ field: '(root)', expected: 'valid JSON', actual: 'parse error' }] }
  }
  const VALIDATORS: Record<string, (d: unknown) => ValidationResult> = {
    'sizing': validateSizing,
    'infrastructure-manifest': validateInfraManifest,
    'milestones': validateMilestones,
  }
  const validator = VALIDATORS[schema]
  if (!validator) return null
  return validator(data)
}

export function verifyDisciplineArtifact(
  projectDir: string,
  discipline: Discipline,
): ArtifactCheck {
  const specs = ARTIFACT_SPECS[discipline]
  if (!specs) {
    return { ok: false, discipline, reason: 'unknown discipline', checkedPaths: [] }
  }

  const checked: string[] = []
  for (const spec of specs) {
    if (spec.kind === 'file') {
      const full = join(projectDir, spec.path)
      checked.push(spec.path)
      if (!existsSync(full)) continue
      try {
        if (statSync(full).size < spec.minBytes) continue
      } catch { continue }

      // Byte check passed — run schema validation if configured
      if (spec.schema) {
        const result = runSchemaCheck(projectDir, spec.path, spec.schema)
        if (result && !result.ok) {
          return {
            ok: false,
            discipline,
            reason: `${spec.path} failed schema validation: ${result.errors.map(
              (e) => `${e.field} expected ${e.expected}, got ${e.actual}`,
            ).join('; ')}`,
            checkedPaths: checked,
            schemaErrors: result.errors,
          }
        }
      }
      // Brainstorming-specific: verify Classifier Signals section exists.
      // Without it, the auto-classifier can't determine project size and
      // sizing stalls. Better to reject the artifact early with a clear
      // message than let it fail downstream.
      if (discipline === 'brainstorming' && spec.path.endsWith('.md')) {
        try {
          const content = readFileSync(join(projectDir, spec.path), 'utf-8')
          if (!/^##+\s*Classifier Signals/im.test(content)) {
            return {
              ok: false,
              discipline,
              reason: `${spec.path} is missing the required "## Classifier Signals" section. The auto-classifier needs entity_count, integration_count, role_count, journey_count, and screen_count to determine project size.`,
              checkedPaths: checked,
            }
          }
        } catch { /* file unreadable — already passed byte check, unexpected */ }
      }
      // Taste-specific: detect kill verdict in the fenced JSON block
      if (discipline === 'taste') {
        const killVerdict = checkTasteKillVerdict(join(projectDir, spec.path))
        if (killVerdict) {
          return { ok: true, discipline, checkedPaths: checked, killVerdict: true }
        }
      }
      return { ok: true, discipline, checkedPaths: checked }
    } else if (spec.kind === 'dir') {
      const full = join(projectDir, spec.path)
      checked.push(spec.path)
      if (!existsSync(full)) continue
      try {
        const entries = readdirSync(full).filter((f) => !f.startsWith('.'))
        // If minFileBytes is set, only count files that meet the floor
        const qualifying = spec.minFileBytes
          ? entries.filter((f) => {
              try { return statSync(join(full, f)).size >= spec.minFileBytes! } catch { return false }
            })
          : entries
        if (qualifying.length >= spec.minFiles) {
          return { ok: true, discipline, checkedPaths: checked }
        }
      } catch { /* skip */ }
    } else {
      // 'files' — all listed paths must exist at their floor.
      for (const p of spec.paths) {
        if (!checked.includes(p.path)) checked.push(p.path)
      }
      const allOk = spec.paths.every((p) => {
        const full = join(projectDir, p.path)
        if (!existsSync(full)) return false
        try {
          return statSync(full).size >= p.minBytes
        } catch {
          return false
        }
      })
      if (allOk) {
        // Design-specific: reject if any pass file contains slop_detected: true
        if (discipline === 'design') {
          for (const p of spec.paths) {
            try {
              const content = readFileSync(join(projectDir, p.path), 'utf-8')
              if (/slop_detected\s*:\s*true/i.test(content)) {
                return {
                  ok: false,
                  discipline,
                  reason: `${p.path} contains slop_detected: true — design has unresolved quality issues`,
                  checkedPaths: checked,
                }
              }
            } catch { /* file unreadable — byte check already passed, so this is unexpected */ }
          }
        }
        return { ok: true, discipline, checkedPaths: checked }
      }
    }
  }

  return {
    ok: false,
    discipline,
    reason: `no artifact found matching ${specs
      .map((s) => {
        if (s.kind === 'file') return `file ${s.path} (≥${s.minBytes}B)`
        if (s.kind === 'dir') return `dir ${s.path}/ (≥${s.minFiles} files)`
        return `all of [${s.paths.map((p) => p.path).join(', ')}] (each ≥${s.paths[0]?.minBytes ?? 0}B)`
      })
      .join(' or ')}`,
    checkedPaths: checked,
  }
}
