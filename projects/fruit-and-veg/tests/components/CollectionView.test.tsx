import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogueItem, UserProgress, DailyChallenge, CategoryBadge } from '@/lib/types'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}))

// Mock app-context
const mockSetCardReturnTab = vi.fn()

function makeMockItem(id: string, category: CatalogueItem['category'] = 'fruit'): CatalogueItem {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    image: `/images/catalogue/${id}.webp`,
    category,
    subcategory: 'common',
    colours: ['red'],
    growsOn: 'tree',
    origin: 'Worldwide',
    season: 'all-year',
    funFacts: [
      { text: 'I am tasty!', highlightWord: 'tasty', factType: 'surprise' },
      { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
      { text: 'I am red!', highlightWord: 'red', factType: 'colour' },
    ],
    questions: [],
    surpriseFact: null,
    difficulty: 'easy',
  }
}

const mockCatalogue: CatalogueItem[] = [
  makeMockItem('apple', 'fruit'),
  makeMockItem('banana', 'fruit'),
  makeMockItem('carrot', 'vegetable'),
  makeMockItem('strawberry', 'berry'),
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

const mockBadges: CategoryBadge[] = [
  { id: 'badge-fruit', name: 'Fruit Explorer', description: 'Learned all fruits!', category: 'fruit', requiredItemIds: ['apple', 'banana'], icon: '' },
]

let mockProgress = emptyProgress

vi.mock('@/lib/app-context', () => ({
  useApp: () => ({
    catalogue: mockCatalogue,
    progress: mockProgress,
    daily: { date: '2026-03-20', featuredItemId: 'apple', reviewItemIds: [], completedCards: [], isComplete: false } as DailyChallenge,
    badges: mockBadges,
    newBadge: null,
    cardReturnTab: 'home',
    setCardReturnTab: mockSetCardReturnTab,
    isRevisit: (id: string) => mockProgress.completedItems.includes(id),
    onCardComplete: vi.fn(),
    onDailyCardComplete: vi.fn(),
    dismissBadge: vi.fn(),
  }),
}))

import CollectionView from '@/components/CollectionView'

describe('CollectionView', () => {
  beforeEach(() => {
    mockProgress = emptyProgress
    vi.clearAllMocks()
  })

  // @criterion: AC-ACH-01
  // @criterion-hash: c40392dd512b
  describe('AC-ACH-01: collection grid shows all catalogue items', () => {
    it('renders the same number of items as the catalogue', () => {
      render(<CollectionView />)
      // Each item renders with its name visible
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getByText('Banana')).toBeInTheDocument()
      expect(screen.getByText('Carrot')).toBeInTheDocument()
      expect(screen.getByText('Strawberry')).toBeInTheDocument()
    })

    it('renders exactly as many grid items as catalogue items', () => {
      render(<CollectionView />)
      const links = screen.getAllByRole('link')
      // Each catalogue item is a link
      expect(links.length).toBe(mockCatalogue.length)
    })
  })

  // @criterion: AC-ACH-02
  // @criterion-hash: 02492b06dd8b
  describe('AC-ACH-02: completed items show colour, uncompleted show grey', () => {
    it('uncompleted items show ? placeholder', () => {
      render(<CollectionView />)
      const questionMarks = screen.getAllByText('?')
      // All 4 items are uncompleted
      expect(questionMarks.length).toBe(4)
    })

    it('completed items do not show ? placeholder', () => {
      mockProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-01-01' },
      }
      render(<CollectionView />)
      const questionMarks = screen.getAllByText('?')
      // Only 3 uncompleted items show ?
      expect(questionMarks.length).toBe(3)
    })
  })

  // @criterion: AC-ACH-03
  // @criterion-hash: 0e719344745e
  describe('AC-ACH-03: category filtering works', () => {
    it('renders All, Fruits, Vegetables, Berries tabs', () => {
      render(<CollectionView />)
      expect(screen.getByText('All')).toBeInTheDocument()
      expect(screen.getByText('Fruits')).toBeInTheDocument()
      expect(screen.getByText('Vegetables')).toBeInTheDocument()
      expect(screen.getByText('Berries')).toBeInTheDocument()
    })

    it('clicking Fruits tab filters to only fruit items', () => {
      render(<CollectionView />)
      fireEvent.click(screen.getByText('Fruits'))
      // Only Apple and Banana should be visible
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getByText('Banana')).toBeInTheDocument()
      expect(screen.queryByText('Carrot')).not.toBeInTheDocument()
      expect(screen.queryByText('Strawberry')).not.toBeInTheDocument()
    })

    it('clicking Vegetables tab shows only vegetable items', () => {
      render(<CollectionView />)
      fireEvent.click(screen.getByText('Vegetables'))
      expect(screen.getByText('Carrot')).toBeInTheDocument()
      expect(screen.queryByText('Apple')).not.toBeInTheDocument()
    })

    it('clicking All tab restores full catalogue', () => {
      render(<CollectionView />)
      fireEvent.click(screen.getByText('Fruits'))
      fireEvent.click(screen.getByText('All'))
      expect(screen.getByText('Apple')).toBeInTheDocument()
      expect(screen.getByText('Carrot')).toBeInTheDocument()
    })

    it('counter updates to filtered count when tab is selected', () => {
      render(<CollectionView />)
      // Full catalogue: "0 / 4 collected"
      expect(screen.getByText('0 / 4 collected')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Fruits'))
      expect(screen.getByText('0 / 2 collected')).toBeInTheDocument()
    })
  })

  // @criterion: AC-ACH-09
  // @criterion-hash: 5d941d933937
  describe('AC-ACH-09: zero state shows encouraging prompts', () => {
    it('shows "Tap any fruit to start learning!" when nothing is completed', () => {
      render(<CollectionView />)
      expect(screen.getByText('Tap any fruit to start learning!')).toBeInTheDocument()
    })

    it('does not show the empty prompt when items are completed', () => {
      mockProgress = {
        ...emptyProgress,
        completedItems: ['apple'],
        completedAt: { apple: '2026-01-01' },
      }
      render(<CollectionView />)
      expect(screen.queryByText('Tap any fruit to start learning!')).not.toBeInTheDocument()
    })
  })

  // @criterion: AC-ACH-10
  // @criterion-hash: 0ca959504089
  describe('AC-ACH-10: sticker book tapping opens cards', () => {
    it('each item is a link pointing to /card/:id', () => {
      render(<CollectionView />)
      const appleLink = screen.getByText('Apple').closest('a')
      expect(appleLink).toHaveAttribute('href', '/card/apple')
    })

    it('tapping a collection item calls setCardReturnTab("collection")', () => {
      render(<CollectionView />)
      const appleLink = screen.getByText('Apple').closest('a')!
      fireEvent.click(appleLink)
      expect(mockSetCardReturnTab).toHaveBeenCalledWith('collection')
    })
  })
})
