import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CurrentFocusCard } from '../current-focus-card'

describe('CurrentFocusCard', () => {
  it('renders a thin nudge to the escalation banner above the tabs', () => {
    // Previously rendered a full amber box duplicating the drawer,
    // then briefly returned null (which made the hero disappear and
    // broke the page narrative). Settled on a single-line nudge that
    // points to the drawer without restating its contents.
    render(<CurrentFocusCard state="escalation" escalationSummary="Deploy target was never set" />)
    expect(screen.getByTestId('current-focus-escalation-nudge')).toBeInTheDocument()
    expect(screen.getByText(/respond in the banner above/i)).toBeInTheDocument()
  })

  it('shows the same nudge for waiting-for-human', () => {
    render(<CurrentFocusCard state="waiting-for-human" />)
    expect(screen.getByTestId('current-focus-escalation-nudge')).toBeInTheDocument()
  })

  it('shows the shipped band when state is complete', () => {
    render(<CurrentFocusCard state="complete" />)
    expect(screen.getByTestId('current-focus-complete')).toBeInTheDocument()
    expect(screen.getByText(/shipped/i)).toBeInTheDocument()
  })

  it('shows an idle band for ready with user-speak label', () => {
    render(<CurrentFocusCard state="ready" />)
    expect(screen.getByTestId('current-focus-idle')).toBeInTheDocument()
    expect(screen.getByText(/ready to build/i)).toBeInTheDocument()
  })

  it('shows the building band with phase label and story name during story-building', () => {
    render(
      <CurrentFocusCard
        state="story-building"
        buildRunning={true}
        currentStoryName="Admin authentication"
        buildStartedAt={new Date(Date.now() - 90_000).toISOString()}
      />,
    )
    expect(screen.getByTestId('current-focus-building')).toBeInTheDocument()
    expect(screen.getByText(/building this story/i)).toBeInTheDocument()
    expect(screen.getByText(/Admin authentication/)).toBeInTheDocument()
    // 90 seconds elapsed → "1m 30s"
    expect(screen.getByText(/1m 30s/)).toBeInTheDocument()
  })

  it('does not show a story name for foundation phase (there is no story yet)', () => {
    render(
      <CurrentFocusCard
        state="foundation"
        buildRunning={true}
        currentStoryName="Should-not-show"
      />,
    )
    expect(screen.queryByText('Should-not-show')).not.toBeInTheDocument()
    expect(screen.getByText(/setting up the project/i)).toBeInTheDocument()
  })

  it('surfaces the latest tool call when provided', () => {
    render(
      <CurrentFocusCard
        state="foundation"
        buildRunning={true}
        latestToolSummary="Edit src/schema.ts"
        latestToolAt={new Date().toISOString()}
      />,
    )
    expect(screen.getByText(/Edit src\/schema\.ts/)).toBeInTheDocument()
  })
})
