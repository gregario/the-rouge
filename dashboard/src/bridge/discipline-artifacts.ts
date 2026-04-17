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

// Each discipline produces at least one of these artifacts. Any hit wins.
// Paths are relative to the project directory.
const ARTIFACT_SPECS: Record<Discipline, ArtifactSpec[]> = {
  brainstorming: [
    { kind: 'file', path: 'seed_spec/brainstorming.md', minBytes: 500 },
    { kind: 'file', path: 'seed_spec/brainstorming-design-doc.md', minBytes: 500 },
  ],
  competition: [
    { kind: 'file', path: 'seed_spec/competition_brief.md', minBytes: 500 },
    { kind: 'file', path: 'seed_spec/competition.md', minBytes: 500 },
  ],
  taste: [
    { kind: 'file', path: 'seed_spec/taste_verdict.md', minBytes: 300 },
    { kind: 'file', path: 'seed_spec/taste.md', minBytes: 300 },
  ],
  spec: [{ kind: 'file', path: 'seed_spec/milestones.json', minBytes: 500 }],
  infrastructure: [{ kind: 'file', path: 'infrastructure_manifest.json', minBytes: 200 }],
  design: [{ kind: 'dir', path: 'design', minFiles: 1 }],
  'legal-privacy': [{ kind: 'dir', path: 'legal', minFiles: 1 }],
  marketing: [{ kind: 'dir', path: 'marketing', minFiles: 1 }],
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
    const full = join(projectDir, spec.path)
    checked.push(spec.path)
    if (!existsSync(full)) continue

    if (spec.kind === 'file') {
      try {
        const size = statSync(full).size
        if (size >= spec.minBytes) return { ok: true, discipline, checkedPaths: checked }
      } catch {
        continue
      }
    } else {
      try {
        const entries = readdirSync(full).filter((f) => !f.startsWith('.'))
        if (entries.length >= spec.minFiles) return { ok: true, discipline, checkedPaths: checked }
      } catch {
        continue
      }
    }
  }

  return {
    ok: false,
    discipline,
    reason: `no artifact found matching ${specs
      .map((s) => (s.kind === 'file' ? `file ${s.path} (≥${s.minBytes}B)` : `dir ${s.path}/ (≥${s.minFiles} files)`))
      .join(' or ')}`,
    checkedPaths: checked,
  }
}
