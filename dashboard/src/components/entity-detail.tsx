import type { CatalogueEntity } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function lifecycleColor(lifecycle: string) {
  if (lifecycle === 'production') return 'bg-green-100 text-green-800 border-green-200'
  if (lifecycle === 'experimental') return 'bg-amber-100 text-amber-800 border-amber-200'
  return ''
}

export function EntityDetail({
  entity,
  allEntities,
}: {
  entity: CatalogueEntity
  allEntities: CatalogueEntity[]
}) {
  // Resolve dependsOn IDs to entity objects
  const dependencies = entity.dependsOn
    .map((id) => allEntities.find((e) => e.id === id))
    .filter(Boolean) as CatalogueEntity[]

  // Reverse lookup: who depends on this entity
  const dependedOnBy = allEntities.filter((e) => e.dependsOn.includes(entity.id))

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link
        href="/catalogue"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="size-4" />
        Catalogue
      </Link>

      {/* Title row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {entity.name}
        </h1>
        <Badge variant="outline">{entity.kind}</Badge>
        <Badge variant="secondary" className="capitalize">
          {entity.type}
        </Badge>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lifecycleColor(entity.lifecycle)}`}
        >
          {entity.lifecycle}
        </span>
      </div>

      {/* Description */}
      <p className="max-w-2xl text-sm text-gray-500">{entity.description}</p>

      {/* Capabilities */}
      {entity.capabilities.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Capabilities
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {entity.capabilities.map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Depends on */}
      {dependencies.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Depends on
          </h2>
          <ul className="flex flex-wrap gap-2">
            {dependencies.map((dep) => (
              <li key={dep.id}>
                <Link
                  href={`/catalogue/${dep.id}`}
                  className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  {dep.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Depended on by */}
      {dependedOnBy.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Depended on by
          </h2>
          <ul className="flex flex-wrap gap-2">
            {dependedOnBy.map((dep) => (
              <li key={dep.id}>
                <Link
                  href={`/catalogue/${dep.id}`}
                  className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  {dep.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Used by projects */}
      {entity.usedBy.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Used by
          </h2>
          <ul className="flex flex-wrap gap-2">
            {entity.usedBy.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/projects/${slug}`}
                  className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  {slug}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
