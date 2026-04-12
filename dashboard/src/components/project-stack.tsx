import Link from 'next/link'
import { catalogue } from '@/data/catalogue'

interface ProjectStackProps {
  stack: {
    components: string[]
    resources: string[]
    apis: string[]
  }
}

function resolveName(id: string): string {
  const entity = catalogue.find((e) => e.id === id)
  return entity ? entity.name : id
}

function KindRow({ label, ids }: { label: string; ids: string[] }) {
  if (ids.length === 0) return null

  return (
    <div className="flex items-baseline gap-3">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {ids.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-x-2">
            <Link
              href={'/catalogue/' + id}
              className="text-sm text-gray-700 hover:text-gray-900 transition-colors"
            >
              {resolveName(id)}
            </Link>
            {i < ids.length - 1 && (
              <span className="text-gray-300" aria-hidden="true">&middot;</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProjectStack({ stack }: ProjectStackProps) {
  return (
    <div className="flex flex-col gap-2">
      <KindRow label="Components" ids={stack.components} />
      <KindRow label="Resources" ids={stack.resources} />
      <KindRow label="APIs" ids={stack.apis} />
    </div>
  )
}
