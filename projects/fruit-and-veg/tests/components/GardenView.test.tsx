import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogueItem, UserProgress, DailyChallenge, CategoryBadge } from '@/lib/types'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

function makeMockItem(id: string, subcategory: CatalogueItem['subcategory'] = 'tropical'): CatalogueItem {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    image: `/images/catalogue/${id}.webp`,
    category: 'fruit',
    subcategory,
    colours: ['yellow'],
    growsOn: 'tree',
    origin: 'Worldwide',
    season: 'all-year',
    funFacts: [
      { text: 'I am tasty!', highlightWord: 'tasty', factType: 'surprise' },
      { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
      { text: 'I am yellow!', highlightWord: 'yellow', factType: 'colour' },
    ],
    questions: [],
    surpriseFact: null,
    difficulty: 'easy',
  }
}

const mockCatalogue = [
  makeMockItem('mango', 'tropical'),
  makeMockItem('pineapple', 'tropical'),
]

const mockBadges: CategoryBadge[] = [
  {
    id: 'badge-tropical',
    name: 'Tropical Explorer',
    description: 'You learned ALL the tropical fruits!',
    category: 'tropical',
    requiredItemIds: ['mango', 'pineapple'],
    icon: '',
  },
]

const emptyProgress: UserProgress = {
  completedItems: [],
  completedAt: {},
  categoryBadges: [],
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  dailyStamps: [],
  totalQuizCorrect: 0,
  totalQuizAnswered: 0,
  recentFeaturedIds: [],
}

let mockProgress = emptyProgress

vi.mock('@/lib/app-context', () => ({
  useApp: () => ({
    catalogue: mockCatalogue,
    progress: mockProgress,
    daily: { date: '2026-03-20', featuredItemId: 'mango', reviewItemIds: [], completedCards: [], isComplete: false } as DailyChallenge,
    badges: mockBadges,
    newBadge: null,
    cardReturnTab: 'home',
    setCardReturnTab: vi.fn(),
    isRevisit: (id: string) => mockProgress.completedItems.includes(id),
    onCardComplete: vi.fn(),
    onDailyCardComplete: vi.fn(),
    dismissBadge: vi.fn(),
  }),
}))

import GardenView from '@/components/GardenView'

describe('GardenView', () => {
  beforeEach(() => {
    mockProgress = emptyProgress
  })

  // @criterion: AC-ACH-11
  // @criterion-hash: 44c57deedf94
  describe('AC-ACH-11: badge detail shows constituent items', () => {
    it('earned badge is clickable', () => {
      mockProgress = {
        ...emptyProgress,
        completedItems: ['mango', 'pineapple'],
        completedAt: { mango: '2026-01-01', pineapple: '2026-01-02' },
        categoryBadges: ['badge-tropical'],
      }
      render(<GardenView />)
      // Badge button should be enabled (earned)
      const badgeButton = screen.getByText('Tropical Explorer').closest('button')!
      expect(badgeButton).not.toBeDisabled()
    })

    it('clicking an earned badge opens detail overlay', () => {
      mockProgress = {
        ...emptyProgress,
        completedItems: ['mango', 'pineapple'],
        completedAt: { mango: '2026-01-01', pineapple: '2026-01-02' },
        categoryBadges: ['badge-tropical'],
      }
      render(<GardenView />)
      const badgeButton = screen.getByText('Tropical Explorer').closest('button')!
      fireEvent.click(badgeButton)
      // Overlay should show the badge description
      expect(screen.getByText('You learned ALL the tropical fruits!')).toBeInTheDocument()
    })

    it('badge detail overlay lists items in the category', () => {
      mockProgress = {
        ...emptyProgress,
        completedItems: ['mango', 'pineapple'],
        completedAt: { mango: '2026-01-01', pineapple: '2026-01-02' },
        categoryBadges: ['badge-tropical'],
      }
      render(<GardenView />)
      const badgeButton = screen.getByText('Tropical Explorer').closest('button')!
      fireEvent.click(badgeButton)
      // Should show item names from the category
      expect(screen.getByText('Mango')).toBeInTheDocument()
      expect(screen.getByText('Pineapple')).toBeInTheDocument()
    })

    it('unearned badge is not clickable', () => {
      render(<GardenView />)
      // Badge button for unearned badge should be disabled
      const badgeButtons = screen.getAllByRole('button').filter(b => b.querySelector('.text-2xl') !== null || b.textContent?.includes('?'))
      badgeButtons.forEach(b => {
        expect(b).toBeDisabled()
      })
    })
  })

  describe('Garden zero state', () => {
    it('shows streak of 0 for new user', () => {
      render(<GardenView />)
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('Start a streak today!')).toBeInTheDocument()
    })

    it('shows active streak number for user with streak', () => {
      mockProgress = {
        ...emptyProgress,
        currentStreak: 5,
        longestStreak: 5,
        lastPlayedDate: '2026-03-20',
      }
      render(<GardenView />)
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('5 days in a row!')).toBeInTheDocument()
    })
  })
})
