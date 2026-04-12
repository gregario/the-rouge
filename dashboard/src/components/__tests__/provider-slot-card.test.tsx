import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProviderSlotCard } from '@/components/provider-slot-card'

describe('ProviderSlotCard', () => {
  const sampleProjects = [
    {
      slug: 'proj1',
      name: 'Project One',
      status: 'active' as const,
      deployUrl: 'https://proj1.vercel.app',
    },
    { slug: 'proj2', name: 'Project Two', status: 'paused' as const },
  ]

  it('renders provider name and slot count', () => {
    render(
      <ProviderSlotCard
        provider="vercel"
        displayName="Vercel"
        projects={sampleProjects}
        limit={10}
      />
    )
    expect(screen.getByText('Vercel')).toBeDefined()
    expect(screen.getByText(/2 \/ 10 slots/)).toBeDefined()
  })

  it('shows projects without needing to expand', () => {
    render(
      <ProviderSlotCard provider="vercel" displayName="Vercel" projects={sampleProjects} />
    )
    expect(screen.getByText('Project One')).toBeDefined()
    expect(screen.getByText('Project Two')).toBeDefined()
  })

  it('shows pause and activate buttons matching project status', () => {
    render(
      <ProviderSlotCard provider="vercel" displayName="Vercel" projects={sampleProjects} />
    )
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined()
  })

  it('shows empty state when no projects deployed', () => {
    render(
      <ProviderSlotCard provider="vercel" displayName="Vercel" projects={[]} limit={10} />
    )
    expect(screen.getByText(/No projects deployed here/i)).toBeDefined()
  })
})
