import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { StoryList } from '../story-list'
import type { Milestone } from '@/lib/types'

const milestones: Milestone[] = [
  {
    id: 'ms-1',
    title: 'Project scaffold',
    description: 'Initial setup',
    status: 'promoted',
    stories: [
      {
        id: 'st-1a',
        title: 'Scaffold with Tailwind',
        status: 'done',
        acceptanceCriteria: ['next dev runs', 'Tailwind renders'],
      },
    ],
  },
  {
    id: 'ms-2',
    title: 'Core engine',
    description: 'Main feature',
    status: 'in-progress',
    stories: [
      {
        id: 'st-2a',
        title: 'Timer state machine',
        status: 'done',
        acceptanceCriteria: ['Timer counts down', 'Transitions work'],
      },
      {
        id: 'st-2b',
        title: 'Keyboard shortcuts',
        status: 'in-progress',
        acceptanceCriteria: ['Space toggles', 'Escape resets'],
      },
      {
        id: 'st-2c',
        title: 'Progress ring',
        status: 'pending',
        acceptanceCriteria: ['SVG animates', 'Mobile works'],
      },
    ],
  },
]

describe('StoryList', () => {
  it('renders stories from the current (in-progress) milestone', () => {
    render(<StoryList milestones={milestones} />)
    expect(screen.getByText('Core engine')).toBeInTheDocument()
    expect(screen.getByText('Timer state machine')).toBeInTheDocument()
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Progress ring')).toBeInTheDocument()
  })

  it('renders story status badges', () => {
    render(<StoryList milestones={milestones} />)
    const badges = screen.getAllByTestId('story-status')
    expect(badges).toHaveLength(3)
    expect(badges[0]).toHaveTextContent('Done')
    expect(badges[1]).toHaveTextContent('In Progress')
    expect(badges[2]).toHaveTextContent('Pending')
  })

  it('shows story count', () => {
    render(<StoryList milestones={milestones} />)
    expect(screen.getByText('1/3 stories')).toBeInTheDocument()
  })

  it('shows acceptance criteria when expanded', async () => {
    const user = userEvent.setup()
    render(<StoryList milestones={milestones} />)

    // Criteria should not be visible initially (accordion collapsed)
    // Click the first story trigger to expand
    const triggers = screen.getAllByTestId('story-title')
    const firstTrigger = triggers[0].closest('[data-slot="accordion-trigger"]')
    if (firstTrigger) {
      await user.click(firstTrigger)
    }

    // After expand, acceptance criteria should be visible
    const criteria = screen.getAllByTestId('acceptance-criterion')
    expect(criteria.length).toBeGreaterThan(0)
  })

  it('renders nothing when no milestones', () => {
    const { container } = render(<StoryList milestones={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
