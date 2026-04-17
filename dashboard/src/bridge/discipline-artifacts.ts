import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Discipline } from './discipline-prompts'

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
  | { kind: 'file'; path: string; minBytes: number }
  | { kind: 'dir'; path: string; minFiles: number }
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
    { kind: 'file', path: 'seed_spec/milestones.json', minBytes: 500 },
    { kind: 'file', path: 'seed_spec/spec.md', minBytes: 500 },
    { kind: 'file', path: 'docs/spec.md', minBytes: 500 },
  ],
  infrastructure: [
    { kind: 'file', path: 'infrastructure_manifest.json', minBytes: 200 },
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
    { kind: 'dir', path: 'legal', minFiles: 1 },
    { kind: 'file', path: 'seed_spec/legal.md', minBytes: 300 },
    { kind: 'file', path: 'docs/legal.md', minBytes: 300 },
  ],
  marketing: [
    { kind: 'dir', path: 'marketing', minFiles: 1 },
    { kind: 'file', path: 'seed_spec/marketing.md', minBytes: 300 },
    { kind: 'file', path: 'docs/marketing.md', minBytes: 300 },
  ],
}

export interface ArtifactCheck {
  ok: boolean
  discipline: Discipline
  reason?: string
  checkedPaths: string[]
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
        if (statSync(full).size >= spec.minBytes) {
          return { ok: true, discipline, checkedPaths: checked }
        }
      } catch { /* skip */ }
    } else if (spec.kind === 'dir') {
      const full = join(projectDir, spec.path)
      checked.push(spec.path)
      if (!existsSync(full)) continue
      try {
        const entries = readdirSync(full).filter((f) => !f.startsWith('.'))
        if (entries.length >= spec.minFiles) {
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
      if (allOk) return { ok: true, discipline, checkedPaths: checked }
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
