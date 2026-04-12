import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EntityCard } from '@/components/entity-card'
import type { CatalogueEntity } from '@/lib/types'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockEntity: CatalogueEntity = {
  id: 'supabase',
  name: 'Supabase',
  kind: 'Resource',
  type: 'service',
  description: 'Open-source Firebase alternative',
  capabilities: ['database', 'auth', 'storage'],
  status: 'available',
  lifecycle: 'production',
  dependsOn: [],
  usedBy: ['recipe-oracle', 'fleet-dash'],
}

describe('EntityCard', () => {
  it('renders entity name and description', () => {
    render(<EntityCard entity={mockEntity} />)
    expect(screen.getByText('Supabase')).toBeDefined()
    expect(screen.getByText('Open-source Firebase alternative')).toBeDefined()
  })

  it('renders type badge', () => {
    render(<EntityCard entity={mockEntity} />)
    expect(screen.getByText('service')).toBeDefined()
  })

  it('renders capability tags', () => {
    render(<EntityCard entity={mockEntity} />)
    expect(screen.getByText('database')).toBeDefined()
    expect(screen.getByText('auth')).toBeDefined()
    expect(screen.getByText('storage')).toBeDefined()
  })

  it('renders project count', () => {
    render(<EntityCard entity={mockEntity} />)
    expect(screen.getByText(/2 projects/)).toBeDefined()
  })

  it('renders planned badge for planned entities', () => {
    const planned = { ...mockEntity, status: 'planned' as const, usedBy: [] }
    render(<EntityCard entity={planned} />)
    expect(screen.getByText('planned')).toBeDefined()
  })
})
