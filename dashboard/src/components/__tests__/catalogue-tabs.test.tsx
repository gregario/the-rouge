import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogueTabs } from '@/components/catalogue-tabs'
import { catalogue } from '@/data/catalogue'

describe('CatalogueTabs', () => {
  it('renders three tabs with correct labels', () => {
    render(<CatalogueTabs entities={catalogue} />)
    expect(screen.getByRole('tab', { name: /components/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /resources/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /apis/i })).toBeDefined()
  })

  it('shows Components tab by default with 13 entities', () => {
    render(<CatalogueTabs entities={catalogue} />)
    const cards = screen.getAllByTestId('entity-card')
    expect(cards).toHaveLength(13)
  })

  it('switches to Resources tab showing 12 entities', async () => {
    const user = userEvent.setup()
    render(<CatalogueTabs entities={catalogue} />)
    await user.click(screen.getByRole('tab', { name: /resources/i }))
    const cards = screen.getAllByTestId('entity-card')
    expect(cards).toHaveLength(12)
  })

  it('switches to APIs tab showing 10 entities', async () => {
    const user = userEvent.setup()
    render(<CatalogueTabs entities={catalogue} />)
    await user.click(screen.getByRole('tab', { name: /apis/i }))
    const cards = screen.getAllByTestId('entity-card')
    expect(cards).toHaveLength(10)
  })

  it('renders type filter chips', () => {
    render(<CatalogueTabs entities={catalogue} />)
    const chips = screen.getAllByTestId('type-chip')
    const chipLabels = chips.map((c) => c.textContent)
    expect(chipLabels).toContain('framework')
    expect(chipLabels).toContain('library')
    expect(chipLabels).toContain('tool')
  })

  it('filters by type when chip is clicked', async () => {
    const user = userEvent.setup()
    render(<CatalogueTabs entities={catalogue} />)
    const chips = screen.getAllByTestId('type-chip')
    const frameworkChip = chips.find((c) => c.textContent === 'framework')!
    await user.click(frameworkChip)
    const cards = screen.getAllByTestId('entity-card')
    // nextjs, react, hono, astro = 4 frameworks
    expect(cards).toHaveLength(4)
  })
})
