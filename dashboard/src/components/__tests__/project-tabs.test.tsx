import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectTabs } from '@/components/project-tabs'

describe('ProjectTabs', () => {
  it('shows default tab content', () => {
    render(
      <ProjectTabs
        defaultTab="spec"
        buildDisabled={false}
        specContent={<div>SPEC CONTENT</div>}
        buildContent={<div>BUILD CONTENT</div>}
      />
    )
    expect(screen.getByText('SPEC CONTENT')).toBeDefined()
  })

  it('switches to build tab', async () => {
    const user = userEvent.setup()
    render(
      <ProjectTabs
        defaultTab="spec"
        buildDisabled={false}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    await user.click(screen.getByRole('tab', { name: /build/i }))
    expect(screen.getByText('BUILD')).toBeDefined()
  })

  it('disables build tab when buildDisabled', () => {
    render(
      <ProjectTabs
        defaultTab="spec"
        buildDisabled={true}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    const buildTab = screen.getByRole('tab', { name: /build/i })
    expect(buildTab.hasAttribute('disabled')).toBe(true)
  })
})
