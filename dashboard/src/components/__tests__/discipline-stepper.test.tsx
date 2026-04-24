import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DisciplineStepper } from '../discipline-stepper'
import type { DisciplineProgress } from '@/lib/types'

const disciplines: DisciplineProgress[] = [
  { discipline: 'brainstorming', status: 'complete' },
  { discipline: 'competition', status: 'complete' },
  { discipline: 'taste', status: 'complete' },
  { discipline: 'sizing', status: 'in-progress' },
  { discipline: 'spec', status: 'pending' },
  { discipline: 'infrastructure', status: 'pending' },
  { discipline: 'design', status: 'pending' },
  { discipline: 'legal-privacy', status: 'pending' },
  { discipline: 'marketing', status: 'pending' },
]

describe('DisciplineStepper', () => {
  it('renders all 9 disciplines', () => {
    render(<DisciplineStepper disciplines={disciplines} />)
    const steps = screen.getAllByTestId('discipline-step')
    expect(steps).toHaveLength(9)
  })

  it('shows correct status icons via data attributes', () => {
    render(<DisciplineStepper disciplines={disciplines} currentDiscipline="sizing" />)
    const icons = screen.getAllByTestId('discipline-icon')

    expect(icons[0]).toHaveAttribute('data-status', 'complete')
    expect(icons[1]).toHaveAttribute('data-status', 'complete')
    expect(icons[2]).toHaveAttribute('data-status', 'complete')
    expect(icons[3]).toHaveAttribute('data-status', 'in-progress')
    expect(icons[4]).toHaveAttribute('data-status', 'pending')
    expect(icons[5]).toHaveAttribute('data-status', 'pending')
    expect(icons[6]).toHaveAttribute('data-status', 'pending')
    expect(icons[7]).toHaveAttribute('data-status', 'pending')
    expect(icons[8]).toHaveAttribute('data-status', 'pending')
  })

  it('renders discipline labels', () => {
    render(<DisciplineStepper disciplines={disciplines} />)
    expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    expect(screen.getByText('Competition')).toBeInTheDocument()
    expect(screen.getByText('Taste')).toBeInTheDocument()
    expect(screen.getByText('Sizing')).toBeInTheDocument()
    expect(screen.getByText('Spec')).toBeInTheDocument()
    expect(screen.getByText('Infrastructure')).toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
    expect(screen.getByText('Legal & Privacy')).toBeInTheDocument()
    expect(screen.getByText('Marketing')).toBeInTheDocument()
  })

  it('renders navigation landmark', () => {
    render(<DisciplineStepper disciplines={disciplines} />)
    expect(screen.getByRole('navigation', { name: /seeding disciplines/i })).toBeInTheDocument()
  })
})
