'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ProviderQuota } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StackIcon } from '@/components/stack-icons'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react'

interface ProviderCardProps {
  quota: ProviderQuota
}

function quotaColor(pct: number): string {
  if (pct > 80) return 'text-red-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-green-600'
}

function quotaBarColor(pct: number): string {
  if (pct > 80) return 'bg-red-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-green-500'
}

const providerDashboardUrls: Record<string, string> = {
  cloudflare: 'https://dash.cloudflare.com',
  supabase: 'https://supabase.com/dashboard',
  vercel: 'https://vercel.com/dashboard',
}

// Mock cost data per provider
const providerCosts: Record<string, string> = {
  cloudflare: '$5.00',
  supabase: '$25.00',
  vercel: '$20.00',
}

type ProjectStatus = 'live' | 'paused' | 'inactive'

function statusBadgeColor(status: ProjectStatus): string {
  switch (status) {
    case 'live':
      return 'bg-green-50 text-green-700 border-green-300'
    case 'paused':
      return 'bg-amber-50 text-amber-700 border-amber-300'
    case 'inactive':
      return 'bg-gray-100 text-gray-500 border-gray-300'
  }
}

export function ProviderCard({ quota }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [projectStatuses, setProjectStatuses] = useState<Record<string, ProjectStatus>>(
    () => Object.fromEntries(quota.projects.map((slug) => [slug, 'live' as ProjectStatus]))
  )
  const pct = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0

  const toggleProjectStatus = (slug: string) => {
    setProjectStatuses((prev) => ({
      ...prev,
      [slug]: prev[slug] === 'live' ? 'paused' : 'live',
    }))
  }

  return (
    <Card
      data-testid="provider-card"
      className={cn(
        'cursor-pointer transition-all',
        expanded && 'ring-1 ring-foreground/20',
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StackIcon service={quota.provider} size={20} className="text-foreground" />
            <CardTitle>{quota.displayName}</CardTitle>
          </div>
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quota — large number display */}
        <div className="flex items-end gap-3">
          <span className={cn('text-3xl font-bold tabular-nums', quotaColor(pct))}>
            {Math.round(pct)}%
          </span>
          <span className="mb-1 text-sm text-muted-foreground" data-testid="quota-count">
            {quota.used} / {quota.limit} slots
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" data-testid="quota-bar">
          <div
            className={cn('h-full rounded-full transition-all', quotaBarColor(pct))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="space-y-4 pt-2 border-t border-border/50">
            {/* Cost section */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Est. Monthly Cost</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {providerCosts[quota.provider] ?? '$0.00'}
              </span>
            </div>

            {/* Projects with controls */}
            {quota.projects.length > 0 ? (
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</span>
                <ul className="mt-2 space-y-2" data-testid="provider-project-list">
                  {quota.projects.map((slug) => {
                    const status = projectStatuses[slug] ?? 'live'
                    return (
                      <li key={slug} className="flex items-center justify-between gap-2">
                        <Link
                          href={`/projects/${slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-foreground underline-offset-4 hover:underline"
                        >
                          {slug}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn('text-xs', statusBadgeColor(status))}
                            data-testid="project-status-badge"
                          >
                            {status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleProjectStatus(slug)
                            }}
                            data-testid="project-toggle-button"
                            title={status === 'live' ? 'Pause project' : 'Resume project'}
                          >
                            {status === 'live' ? (
                              <Pause className="size-3.5 text-amber-600" />
                            ) : (
                              <Play className="size-3.5 text-green-600" />
                            )}
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No projects using this provider.</p>
            )}

            {/* Manage button — links to provider dashboard */}
            <a
              href={providerDashboardUrls[quota.provider] ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-500 transition-colors hover:text-gray-900 hover:border-gray-300"
            >
              Manage
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
