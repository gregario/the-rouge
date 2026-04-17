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

  it('flips to build when defaultTab transitions from spec to build', async () => {
    // Simulates the post-Start flow: user was on spec while build was
    // disabled; the build-status poll picks up the running subprocess,
    // parent recomputes defaultTab from 'spec' to 'build', and the tab
    // should follow automatically.
    const { rerender } = render(
      <ProjectTabs
        defaultTab="spec"
        buildDisabled={true}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    expect(screen.getByText('SPEC')).toBeDefined()

    rerender(
      <ProjectTabs
        defaultTab="build"
        buildDisabled={false}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    expect(screen.getByText('BUILD')).toBeDefined()
  })

  it('preserves a user\'s explicit click to Spec after build has started', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ProjectTabs
        defaultTab="build"
        buildDisabled={false}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    // User clicks Spec.
    await user.click(screen.getByRole('tab', { name: /^spec$/i }))
    expect(screen.getByText('SPEC')).toBeDefined()

    // Parent rerenders (e.g. poll tick). defaultTab is still 'build';
    // user's choice should stick.
    rerender(
      <ProjectTabs
        defaultTab="build"
        buildDisabled={false}
        specContent={<div>SPEC</div>}
        buildContent={<div>BUILD</div>}
      />
    )
    expect(screen.getByText('SPEC')).toBeDefined()
  })
})
