import type { ProjectSpec } from '@/bridge/spec-reader'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type { ProjectSpec }

// Canonical labels for the well-known seed artifact files. Anything not in
// this map falls through to the raw filename.
const SEED_ARTIFACT_LABELS: Record<string, string> = {
  'brainstorming.md': 'Brainstorming',
  'competition_brief.md': 'Competition Brief',
  'taste_verdict.md': 'Taste Verdict',
  'design_artifact.md': 'Design Artifact',
  'vision.md': 'Vision',
  'marketing.md': 'Marketing',
  'legal.md': 'Legal & Privacy',
  'infrastructure.md': 'Infrastructure',
}

function artifactLabel(filename: string): string {
  return SEED_ARTIFACT_LABELS[filename] ?? filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}

export function SpecView({ spec }: { spec: ProjectSpec | null }) {
  if (spec === null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm text-gray-500">Loading spec…</p>
      </div>
    )
  }

  if (!spec.hasVision && !spec.hasMilestones && !spec.hasLegacySpec) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm text-gray-500">
          No spec artifacts written yet. If seeding just finished, try refreshing —
          it may still be writing files.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {spec.hasVision && spec.vision && <VisionCard vision={spec.vision} />}
      {spec.hasMilestones && spec.milestones && (
        <MilestonePlanCard milestones={spec.milestones} />
      )}
      {spec.hasLegacySpec && spec.legacySpecFiles && (
        <SeedArtifactsCard
          files={spec.legacySpecFiles}
          // If milestones exist, these are supplementary seed artifacts.
          // If not, they ARE the spec (legacy markdown-only projects).
          isSupplementary={spec.hasMilestones}
        />
      )}
    </div>
  )
}

function SeedArtifactsCard({
  files,
  isSupplementary,
}: {
  files: NonNullable<ProjectSpec['legacySpecFiles']>
  isSupplementary: boolean
}) {
  const title = isSupplementary ? 'Seed Artifacts' : 'Spec files'
  const subtitle = isSupplementary
    ? 'Outputs from the seeding disciplines — brainstorming, competition, taste, design.'
    : 'Legacy markdown-based spec format (pre-V3). Each file describes one feature area.'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        {title} ({files.length})
      </h3>
      <p className="mb-4 text-xs text-gray-500">{subtitle}</p>
      <div className="flex flex-col gap-3">
        {files.map(file => (
          <details
            key={file.name}
            className="rounded-md border border-gray-200 bg-white p-3"
          >
            <summary className="cursor-pointer text-sm font-medium text-gray-900">
              {artifactLabel(file.name)}
              <span className="ml-2 text-[10px] font-mono text-gray-400">{file.name}</span>
            </summary>
            <div className="prose prose-sm mt-3 max-w-none text-gray-800 prose-headings:font-semibold prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-li:text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function VisionCard({ vision }: { vision: NonNullable<ProjectSpec['vision']> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <div className="mb-4">
        {vision.name && (
          <h2 className="text-xl font-semibold text-gray-900">{vision.name}</h2>
        )}
        {vision.tagline && (
          <p className="text-sm text-gray-500">{vision.tagline}</p>
        )}
      </div>

      {vision.one_liner && (
        <p className="mb-5 text-base text-gray-900">{vision.one_liner}</p>
      )}

      {vision.problem && (
        <Section label="Problem">
          <p className="text-sm text-gray-900">{vision.problem}</p>
        </Section>
      )}

      {vision.user && (vision.user.primary || vision.user.segments?.length) && (
        <Section label="Target users">
          {vision.user.primary && (
            <p className="mb-2 text-sm text-gray-900">{vision.user.primary}</p>
          )}
          {vision.user.segments && vision.user.segments.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
              {vision.user.segments.map((segment, i) => (
                <li key={i}>{segment}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {vision.emotional_north_star && (
        <Section label="Emotional north star">
          <p className="border-l-2 border-gray-300 pl-3 text-sm italic text-gray-700">
            {vision.emotional_north_star}
          </p>
        </Section>
      )}

      {vision.differentiators && vision.differentiators.length > 0 && (
        <Section label="Differentiators">
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
            {vision.differentiators.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {vision.competitors && vision.competitors.length > 0 && (
        <Section label="Competitors">
          <ul className="space-y-2">
            {vision.competitors.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.mechanic && (
                  <span className="text-gray-700"> — {c.mechanic}</span>
                )}
                {c.weakness && (
                  <div className="text-gray-500">Weakness: {c.weakness}</div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function MilestonePlanCard({
  milestones,
}: {
  milestones: NonNullable<ProjectSpec['milestones']>
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Initial milestone plan
      </h3>
      <ol className="space-y-4">
        {milestones.map((m, i) => (
          <li key={m.name} className="rounded border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {i + 1}. {m.display_name ?? m.name}
                </div>
                {m.depends_on_milestones && m.depends_on_milestones.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.depends_on_milestones.map((dep) => (
                      <span
                        key={dep}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                      >
                        depends: {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="whitespace-nowrap text-xs text-gray-500">
                {m.stories.length} {m.stories.length === 1 ? 'story' : 'stories'}
              </span>
            </div>
            {m.stories.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  Show stories
                </summary>
                <ul className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                  {m.stories.map((s) => (
                    <li key={s.id} className="text-sm">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      {s.acceptance_criteria && s.acceptance_criteria.length > 0 && (
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-gray-600">
                          {s.acceptance_criteria.map((ac, i) => (
                            <li key={i}>{ac}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      {children}
    </div>
  )
}
