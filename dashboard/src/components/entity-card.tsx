import Link from 'next/link'
import type { CatalogueEntity } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

export function EntityCard({ entity }: { entity: CatalogueEntity }) {
  const projectCount = entity.usedBy.length

  return (
    <Link
      href={'/catalogue/' + entity.id}
      data-testid="entity-card"
      className="block rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm hover:border-gray-300 transition-colors cursor-pointer"
    >
      {/* Header: name + type badge + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-900 truncate">{entity.name}</span>
          <Badge variant="outline" className="capitalize shrink-0">
            {entity.type}
          </Badge>
        </div>
        {entity.status === 'available' ? (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" aria-label="available" />
        ) : (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {entity.status}
          </Badge>
        )}
      </div>

      {/* Description */}
      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-1">
        {entity.description}
      </p>

      {/* Capability tags */}
      {entity.capabilities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entity.capabilities.map((cap) => (
            <span
              key={cap}
              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* Footer: project count */}
      {projectCount > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Used by {projectCount} projects
        </p>
      )}
    </Link>
  )
}
