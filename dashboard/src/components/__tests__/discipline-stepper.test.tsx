import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DisciplineStepper } from '../discipline-stepper'
import type { DisciplineProgress, SeedingDiscipline } from '@/lib/types'

const disciplines: DisciplineProgress[] = [
  { discipline: 'brainstorming', status: 'complete' },
  { discipline: 'sizing', status: 'complete' },
  { discipline: 'taste', status: 'complete' },
  { discipline: 'competition', status: 'in-progress' },
  { discipline: 'spec', status: 'pending' },
  { discipline: 'infrastructure', status: 'pending' },
  { discipline: 'design', status: 'pending' },
  { discipline: 'legal-privacy', status: 'pending' },
  { discipline: 'marketing', status: 'pending' },
]

const ALL_DISCIPLINES: SeedingDiscipline[] = [
  'brainstorming', 'sizing', 'taste', 'competition', 'spec',
  'infrastructure', 'design', 'legal-privacy', 'marketing',
]

describe('DisciplineStepper', () => {
  it('renders all 9 disciplines when all are applicable', () => {
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={ALL_DISCIPLINES}
      />,
    )
    const steps = screen.getAllByTestId('discipline-step')
    expect(steps).toHaveLength(9)
  })

  it('shows correct status icons via data attributes', () => {
    render(
      <DisciplineStepper
        disciplines={disciplines}
        currentDiscipline="competition"
        applicableDisciplines={ALL_DISCIPLINES}
      />,
    )
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
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={ALL_DISCIPLINES}
      />,
    )
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
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={ALL_DISCIPLINES}
      />,
    )
    expect(screen.getByRole('navigation', { name: /seeding disciplines/i })).toBeInTheDocument()
  })

  it('shows only brainstorming pre-classification (no applicableDisciplines)', () => {
    render(
      <DisciplineStepper
        disciplines={[{ discipline: 'brainstorming', status: 'in-progress' }]}
        currentDiscipline="brainstorming"
      />,
    )
    const steps = screen.getAllByTestId('discipline-step')
    expect(steps).toHaveLength(1)
    expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    expect(screen.queryByText('Sizing')).not.toBeInTheDocument()
    expect(screen.queryByText('Spec')).not.toBeInTheDocument()
  })

  it('shows only applicable disciplines for XS tier (4 steps)', () => {
    const xsDisciplines: SeedingDiscipline[] = [
      'brainstorming', 'sizing', 'taste', 'spec',
    ]
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={xsDisciplines}
        projectSize="XS"
      />,
    )
    const steps = screen.getAllByTestId('discipline-step')
    expect(steps).toHaveLength(4)
    expect(screen.getByText('Brainstorming')).toBeInTheDocument()
    expect(screen.getByText('Sizing')).toBeInTheDocument()
    expect(screen.getByText('Taste')).toBeInTheDocument()
    expect(screen.getByText('Spec')).toBeInTheDocument()
    expect(screen.queryByText('Competition')).not.toBeInTheDocument()
    expect(screen.queryByText('Infrastructure')).not.toBeInTheDocument()
  })

  it('shows skipped count summary for XS tier', () => {
    const xsDisciplines: SeedingDiscipline[] = [
      'brainstorming', 'sizing', 'taste', 'spec',
    ]
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={xsDisciplines}
        projectSize="XS"
      />,
    )
    expect(screen.getByTestId('disciplines-skipped-summary')).toHaveTextContent(
      '5 disciplines skipped (XS project)',
    )
  })

  it('shows no skipped summary when all disciplines are applicable', () => {
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={ALL_DISCIPLINES}
        projectSize="M"
      />,
    )
    expect(screen.queryByTestId('disciplines-skipped-summary')).not.toBeInTheDocument()
  })

  it('shows S-tier disciplines (7 steps)', () => {
    const sDisciplines: SeedingDiscipline[] = [
      'brainstorming', 'sizing', 'taste', 'spec',
      'infrastructure', 'design', 'legal-privacy',
    ]
    render(
      <DisciplineStepper
        disciplines={disciplines}
        applicableDisciplines={sDisciplines}
        projectSize="S"
      />,
    )
    const steps = screen.getAllByTestId('discipline-step')
    expect(steps).toHaveLength(7)
    expect(screen.getByTestId('disciplines-skipped-summary')).toHaveTextContent(
      '2 disciplines skipped (S project)',
    )
  })
})
