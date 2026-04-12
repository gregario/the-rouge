import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MilestoneTimeline } from '../milestone-timeline'
import type { Milestone } from '@/lib/types'

const milestones: Milestone[] = [
  {
    id: 'ms-1',
    title: 'Project scaffold',
    description: 'Initial setup',
    status: 'promoted',
    stories: [],
  },
  {
    id: 'ms-2',
    title: 'Core engine',
    description: 'Main feature',
    status: 'in-progress',
    stories: [],
  },
  {
    id: 'ms-3',
    title: 'Analytics',
    description: 'Dashboard',
    status: 'pending',
    stories: [],
  },
  {
    id: 'ms-4',
    title: 'Polish',
    description: 'Final touches',
    status: 'pending',
    stories: [],
  },
]

describe('MilestoneTimeline', () => {
  it('renders correct number of milestones', () => {
    render(<MilestoneTimeline milestones={milestones} />)
    const steps = screen.getAllByTestId('milestone-step')
    expect(steps).toHaveLength(4)
  })

  it('renders milestone titles', () => {
    render(<MilestoneTimeline milestones={milestones} />)
    expect(screen.getByText('Project scaffold')).toBeInTheDocument()
    expect(screen.getByText('Core engine')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Polish')).toBeInTheDocument()
  })

  it('shows correct status icons via data attributes', () => {
    render(<MilestoneTimeline milestones={milestones} />)
    const icons = screen.getAllByTestId('milestone-icon')

    expect(icons[0]).toHaveAttribute('data-status', 'promoted')
    expect(icons[1]).toHaveAttribute('data-status', 'in-progress')
    expect(icons[2]).toHaveAttribute('data-status', 'pending')
    expect(icons[3]).toHaveAttribute('data-status', 'pending')
  })

  it('renders nothing when milestones is empty', () => {
    const { container } = render(<MilestoneTimeline milestones={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('handles a failed milestone', () => {
    const withFailed: Milestone[] = [
      { ...milestones[0] },
      { id: 'ms-f', title: 'Deploy', description: 'Deploy', status: 'failed', stories: [] },
    ]
    render(<MilestoneTimeline milestones={withFailed} />)
    const icons = screen.getAllByTestId('milestone-icon')
    expect(icons[1]).toHaveAttribute('data-status', 'failed')
  })

  it('calls onSelect when a non-pending milestone is clicked', async () => {
    const onSelect = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<MilestoneTimeline milestones={milestones} selectedId="ms-2" onSelect={onSelect} />)
    const buttons = screen.getAllByTestId('milestone-button')
    // Click the promoted milestone (index 0)
    await user.click(buttons[0])
    expect(onSelect).toHaveBeenCalledWith('ms-1')
  })

  it('does not call onSelect for pending milestones', async () => {
    const onSelect = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<MilestoneTimeline milestones={milestones} selectedId="ms-2" onSelect={onSelect} />)
    const buttons = screen.getAllByTestId('milestone-button')
    // Click a pending milestone (index 2)
    await user.click(buttons[2])
    expect(onSelect).not.toHaveBeenCalled()
  })
})
