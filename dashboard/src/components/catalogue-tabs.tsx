'use client'

import { useState, useMemo } from 'react'
import type { CatalogueEntity } from '@/lib/types'
import { EntityCard } from '@/components/entity-card'

type Kind = 'Component' | 'Resource' | 'API'

export function CatalogueTabs({ entities }: { entities: CatalogueEntity[] }) {
  const [activeTab, setActiveTab] = useState<Kind>('Component')
  const [activeType, setActiveType] = useState<string | null>(null)

  const byKind = useMemo(() => {
    const map: Record<Kind, CatalogueEntity[]> = {
      Component: [],
      Resource: [],
      API: [],
    }
    for (const e of entities) {
      map[e.kind]?.push(e)
    }
    return map
  }, [entities])

  const tabEntities = byKind[activeTab]

  const uniqueTypes = useMemo(
    () => [...new Set(tabEntities.map((e) => e.type))].sort(),
    [tabEntities],
  )

  const filtered = activeType
    ? tabEntities.filter((e) => e.type === activeType)
    : tabEntities

  const tabs: { kind: Kind; label: string }[] = [
    { kind: 'Component', label: `Components (${byKind.Component.length})` },
    { kind: 'Resource', label: `Resources (${byKind.Resource.length})` },
    { kind: 'API', label: `APIs (${byKind.API.length})` },
  ]

  function handleTabClick(kind: Kind) {
    setActiveTab(kind)
    setActiveType(null)
  }

  function handleTypeClick(type: string) {
    setActiveType((prev) => (prev === type ? null : type))
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-6 border-b border-gray-200">
        {tabs.map(({ kind, label }) => (
          <button
            key={kind}
            role="tab"
            aria-selected={activeTab === kind}
            onClick={() => handleTabClick(kind)}
            className={
              activeTab === kind
                ? 'border-b-2 border-gray-900 pb-2 text-gray-900 font-semibold'
                : 'pb-2 text-gray-500 hover:text-gray-700'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {uniqueTypes.map((type) => (
          <button
            key={type}
            data-testid="type-chip"
            onClick={() => handleTypeClick(type)}
            className={
              activeType === type
                ? 'rounded-full px-3 py-1 text-sm bg-gray-900 text-white'
                : 'rounded-full px-3 py-1 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          >
            {type}
          </button>
        ))}
      </div>

      {/* Entity grid */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((entity) => (
          <EntityCard key={entity.id} entity={entity} />
        ))}
      </div>
    </div>
  )
}
