import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectCard } from '../project-card'
import type { ProjectSummary } from '@/lib/types'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}))

// Mock the data module to avoid importing the full seed data in tests
vi.mock('@/data/projects', () => ({
  projectDetails: {},
}))

const baseProject: ProjectSummary = {
  id: 'proj-test',
  name: 'Test Project',
  slug: 'test-project',
  description: 'A test project for unit tests',
  state: 'story-building',
  providers: ['vercel'],
  health: 80,
  progress: 50,
  confidence: 0.75,
  cost: {
    totalSpend: 10,
    budgetCap: 50,
    breakdown: { llmTokens: 8, deploys: 1, other: 1 },
    lastUpdated: '2026-04-01T12:00:00Z',
  },
  milestonesTotal: 4,
  milestonesCompleted: 2,
  currentMilestone: 'Core engine',
  createdAt: '2026-03-20T08:00:00Z',
  updatedAt: '2026-04-01T12:00:00Z',
}

describe('ProjectCard', () => {
  it('renders project name and state', () => {
    render(<ProjectCard project={baseProject} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('Story Building')).toBeInTheDocument()
  })

  it('shows milestone progress for building projects', () => {
    render(<ProjectCard project={baseProject} />)
    expect(screen.getByTestId('milestone-progress')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })

  it('shows discipline progress for seeding projects', () => {
    const seedingProject: ProjectSummary = {
      ...baseProject,
      state: 'seeding',
      milestonesTotal: 0,
      milestonesCompleted: 0,
      seedingProgress: {
        disciplines: [
          { discipline: 'brainstorming', status: 'complete' },
          { discipline: 'competition', status: 'complete' },
          { discipline: 'taste', status: 'in-progress' },
          { discipline: 'spec', status: 'pending' },
          { discipline: 'infrastructure', status: 'pending' },
          { discipline: 'design', status: 'pending' },
          { discipline: 'legal-privacy', status: 'pending' },
          { discipline: 'marketing', status: 'pending' },
        ],
        currentDiscipline: 'taste',
        completedCount: 2,
        totalCount: 8,
      },
    }
    render(<ProjectCard project={seedingProject} />)
    expect(screen.getByTestId('discipline-progress')).toBeInTheDocument()
    expect(screen.getByText('2 / 8')).toBeInTheDocument()
  })

  it('shows shipped date for complete projects', () => {
    const completeProject: ProjectSummary = {
      ...baseProject,
      state: 'complete',
      milestonesCompleted: 4,
    }
    render(<ProjectCard project={completeProject} />)
    expect(screen.getByTestId('shipped-date')).toBeInTheDocument()
    expect(screen.getByTestId('shipped-date').textContent).toContain('Shipped')
  })

  it('renders progress percentage', () => {
    render(<ProjectCard project={baseProject} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('navigates to the project detail page on click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<ProjectCard project={baseProject} />)
    const link = screen.getByRole('link')
    await user.click(link)
    expect(mockPush).toHaveBeenCalledWith('/projects/test-project')
  })
})
