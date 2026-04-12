import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ProviderCard } from '../provider-card'
import type { ProviderQuota } from '@/lib/types'

const quota: ProviderQuota = {
  provider: 'cloudflare',
  displayName: 'Cloudflare Pages & Workers',
  used: 2,
  limit: 2,
  projects: ['recipe-oracle', 'color-quiz'],
}

describe('ProviderCard', () => {
  it('renders provider name', () => {
    render(<ProviderCard quota={quota} />)
    expect(screen.getByText('Cloudflare Pages & Workers')).toBeInTheDocument()
  })

  it('shows slot count', () => {
    render(<ProviderCard quota={quota} />)
    expect(screen.getByTestId('quota-count')).toHaveTextContent('2 / 2 slots')
  })

  it('shows quota percentage prominently', () => {
    render(<ProviderCard quota={quota} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('shows project list when expanded', async () => {
    const user = userEvent.setup()
    render(<ProviderCard quota={quota} />)
    // Click to expand
    await user.click(screen.getByTestId('provider-card'))
    expect(screen.getByTestId('provider-project-list')).toBeInTheDocument()
    expect(screen.getByText('recipe-oracle')).toBeInTheDocument()
    expect(screen.getByText('color-quiz')).toBeInTheDocument()
  })

  it('shows empty message when no projects and expanded', async () => {
    const user = userEvent.setup()
    const empty: ProviderQuota = {
      ...quota,
      used: 0,
      projects: [],
    }
    render(<ProviderCard quota={empty} />)
    await user.click(screen.getByTestId('provider-card'))
    expect(screen.getByText('No projects using this provider.')).toBeInTheDocument()
  })

  it('renders project links when expanded', async () => {
    const user = userEvent.setup()
    render(<ProviderCard quota={quota} />)
    await user.click(screen.getByTestId('provider-card'))
    const link = screen.getByText('recipe-oracle').closest('a')
    expect(link).toHaveAttribute('href', '/projects/recipe-oracle')
  })

  it('shows status badges for projects when expanded', async () => {
    const user = userEvent.setup()
    render(<ProviderCard quota={quota} />)
    await user.click(screen.getByTestId('provider-card'))
    const badges = screen.getAllByTestId('project-status-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveTextContent('live')
  })

  it('toggles project status between live and paused', async () => {
    const user = userEvent.setup()
    render(<ProviderCard quota={quota} />)
    await user.click(screen.getByTestId('provider-card'))
    const toggleButtons = screen.getAllByTestId('project-toggle-button')
    await user.click(toggleButtons[0])
    const badges = screen.getAllByTestId('project-status-badge')
    expect(badges[0]).toHaveTextContent('paused')
  })
})
