import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CatalogueItem, DailyChallenge, UserProgress, CategoryBadge } from '@/lib/types'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock app-context
const mockIsRevisit = vi.fn(() => false)
const mockOnCardComplete = vi.fn(() => null)
const mockOnDailyCardComplete = vi.fn(() => false)
const mockSetCardReturnTab = vi.fn()

const mockDaily: DailyChallenge = {
  date: '2026-03-20',
  featuredItemId: 'other-item',
  reviewItemIds: [],
  completedCards: [],
  isComplete: false,
}

vi.mock('@/lib/app-context', () => ({
  useApp: () => ({
    catalogue: [],
    progress: {} as UserProgress,
    daily: mockDaily,
    badges: [],
    newBadge: null,
    cardReturnTab: 'home',
    setCardReturnTab: mockSetCardReturnTab,
    isRevisit: mockIsRevisit,
    onCardComplete: mockOnCardComplete,
    onDailyCardComplete: mockOnDailyCardComplete,
    dismissBadge: vi.fn(),
  }),
}))

import { CardView } from '@/components/CardView'

const mockItem: CatalogueItem = {
  id: 'apple',
  name: 'Apple',
  image: '/images/catalogue/apple.webp',
  category: 'fruit',
  subcategory: 'common',
  colours: ['red'],
  growsOn: 'tree',
  origin: 'Europe',
  season: 'autumn',
  funFacts: [
    { text: 'I am crunchy!', highlightWord: 'crunchy', factType: 'surprise' },
    { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
    { text: 'I am red!', highlightWord: 'red', factType: 'colour' },
  ],
  questions: [
    {
      id: 'apple-q1',
      type: 'colour-match',
      questionText: 'What colour am I?',
      options: [
        { id: 'a', text: null, colour: '#FF0000', icon: null },
        { id: 'b', text: null, colour: '#00FF00', icon: null },
      ],
      correctOptionId: 'a',
      explanationCorrect: 'Yes! I am red!',
      explanationIncorrect: 'No, I am red!',
    },
    {
      id: 'apple-q2',
      type: 'where-grow',
      questionText: 'Where do I grow?',
      options: [
        { id: 'a', text: 'Tree', colour: null, icon: 'tree' },
        { id: 'b', text: 'Ground', colour: null, icon: 'ground' },
      ],
      correctOptionId: 'a',
      explanationCorrect: 'Yes!',
      explanationIncorrect: 'No!',
    },
  ],
  surpriseFact: null,
  difficulty: 'easy',
}

describe('CardView', () => {
  beforeEach(() => {
    mockIsRevisit.mockReturnValue(false)
    mockOnCardComplete.mockReturnValue(null)
    vi.clearAllMocks()
  })

  // @criterion: AC-CARD-01
  // @criterion-hash: 0f88250ba94b
  describe('AC-CARD-01: card displays image and name', () => {
    it('renders the item name', () => {
      render(<CardView item={mockItem} />)
      expect(screen.getAllByText('Apple').length).toBeGreaterThan(0)
    })

    it('renders an img element for the item image', () => {
      render(<CardView item={mockItem} />)
      const img = screen.getByRole('img', { name: /Apple/i })
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', '/images/catalogue/apple.webp')
    })

    it('item name is in a heading element (readable text)', () => {
      render(<CardView item={mockItem} />)
      // Multiple headings may contain the item name across card faces/states
      const headings = screen.getAllByRole('heading', { name: 'Apple' })
      expect(headings.length).toBeGreaterThan(0)
    })
  })

  // @criterion: AC-CARD-02
  // @criterion-hash: a8a5a645769a
  describe('AC-CARD-02: card flip reveals back content', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows "Tap to learn about me!" text on front before flip', () => {
      render(<CardView item={mockItem} />)
      expect(screen.getByText('Tap to learn about me!')).toBeInTheDocument()
    })

    it('clicking the card triggers the flip and reveals fun facts', async () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      fireEvent.click(cardFront)
      act(() => { vi.advanceTimersByTime(400) })
      // After flip, Quiz me! button appears (from back side)
      expect(screen.getByText('Quiz me!')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-03
  // @criterion-hash: 1b36f28d2afa
  describe('AC-CARD-03: fun facts display correctly', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows 3 fun facts after flip', () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      fireEvent.click(cardFront)
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.getByText(/crunchy/)).toBeInTheDocument()
      expect(screen.getByText(/trees/)).toBeInTheDocument()
      expect(screen.getByText(/red/)).toBeInTheDocument()
    })

    it('renders highlight word in a span with colour styling', () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      fireEvent.click(cardFront)
      act(() => { vi.advanceTimersByTime(400) })
      // The highlightWord should be in a styled span (text-primary class)
      const highlights = document.querySelectorAll('.text-primary.font-extrabold')
      expect(highlights.length).toBeGreaterThan(0)
    })
  })

  // @criterion: AC-CARD-08
  // @criterion-hash: 203485848eee
  describe('AC-CARD-08: sticker earned on completion', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('calls onCardComplete when quiz finishes', () => {
      render(<CardView item={mockItem} />)

      // Flip card
      fireEvent.click(screen.getByRole('button', { name: /Flip card/i }))
      act(() => { vi.advanceTimersByTime(400) })

      // Click Quiz me!
      fireEvent.click(screen.getByText('Quiz me!'))

      // Answer all questions — exclude only navigation buttons by their aria-labels
      // Note: colour-match buttons have aria-labels (#hex), where-grow buttons do not
      const getAnswerButtons = () =>
        screen.getAllByRole('button').filter(b =>
          b.getAttribute('aria-label') !== 'Go back'
        )

      // Answer Q1
      fireEvent.click(getAnswerButtons()[0])
      act(() => { vi.advanceTimersByTime(1500) })

      // Answer Q2 (if present — quiz shows 2 questions from mockItem)
      const remaining = getAnswerButtons()
      if (remaining.length > 0) {
        fireEvent.click(remaining[0])
        act(() => { vi.advanceTimersByTime(1500) })
      }

      expect(mockOnCardComplete).toHaveBeenCalledWith('apple', expect.any(Number), expect.any(Number))
    })

    it('shows celebration overlay after quiz completion', () => {
      mockOnCardComplete.mockReturnValue(null)
      render(<CardView item={mockItem} />)

      fireEvent.click(screen.getByRole('button', { name: /Flip card/i }))
      act(() => { vi.advanceTimersByTime(400) })

      fireEvent.click(screen.getByText('Quiz me!'))

      const getAnswerButtons = () =>
        screen.getAllByRole('button').filter(b =>
          b.getAttribute('aria-label') !== 'Go back'
        )

      // Answer Q1
      act(() => { fireEvent.click(getAnswerButtons()[0]) })
      act(() => { vi.advanceTimersByTime(1500) })

      // Answer Q2 (if present — quiz shows 2 questions from mockItem)
      const remaining = getAnswerButtons()
      if (remaining.length > 0) {
        act(() => { fireEvent.click(remaining[0]) })
        act(() => { vi.advanceTimersByTime(1500) })
      }

      // Flush pending React updates
      act(() => {})

      // Celebration shows role="dialog" (StickerCelebration) with "New sticker!" text
      const celebration = screen.queryByRole('dialog') ?? screen.queryByText(/New sticker|You remembered/i)
      expect(celebration).toBeInTheDocument()
    })

    it('first completion shows "New sticker!" not "You remembered!" (AC-CARD-08 regression)', () => {
      // Simulate: isRevisit starts false, but onCardComplete mutates progress
      // so subsequent calls to isRevisit return true (the bug scenario)
      mockIsRevisit.mockReturnValue(false)
      mockOnCardComplete.mockImplementation(() => {
        // After onCardComplete, isRevisit would return true on re-render
        mockIsRevisit.mockReturnValue(true)
        return null
      })

      render(<CardView item={mockItem} />)

      // Flip card
      fireEvent.click(screen.getByRole('button', { name: /Flip card/i }))
      act(() => { vi.advanceTimersByTime(400) })

      // Start quiz
      fireEvent.click(screen.getByText('Quiz me!'))

      const getAnswerButtons = () =>
        screen.getAllByRole('button').filter(b =>
          b.getAttribute('aria-label') !== 'Go back'
        )

      // Answer Q1
      act(() => { fireEvent.click(getAnswerButtons()[0]) })
      act(() => { vi.advanceTimersByTime(1500) })

      // Answer Q2
      const remaining = getAnswerButtons()
      if (remaining.length > 0) {
        act(() => { fireEvent.click(remaining[0]) })
        act(() => { vi.advanceTimersByTime(1500) })
      }

      act(() => {})

      // The celebration MUST show "New sticker!" because this was a first completion
      expect(screen.getByText('New sticker!')).toBeInTheDocument()
      expect(screen.queryByText('You remembered!')).not.toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-09
  // @criterion-hash: 9885ec478fec
  describe('AC-CARD-09: completed card shows badge', () => {
    it('shows completed badge indicator when item is a revisit', () => {
      mockIsRevisit.mockReturnValue(true)
      render(<CardView item={mockItem} />)
      // Completed badge is rendered as a check icon in a rounded div
      const checkContainer = document.querySelector('.absolute.top-3.right-3')
      expect(checkContainer).toBeInTheDocument()
    })

    it('does NOT show badge when item is not a revisit', () => {
      mockIsRevisit.mockReturnValue(false)
      render(<CardView item={mockItem} />)
      const checkContainer = document.querySelector('.absolute.top-3.right-3')
      expect(checkContainer).not.toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-13
  // @criterion-hash: 263a131709d5
  describe('AC-CARD-13: tap targets meet minimum size', () => {
    it('back button has min-w-[44px] and min-h-[44px]', () => {
      render(<CardView item={mockItem} />)
      const backButton = screen.getByRole('button', { name: /Go back/i })
      expect(backButton.className).toContain('min-w-[44px]')
      expect(backButton.className).toContain('min-h-[44px]')
    })
  })

  // @criterion: AC-CARD-15
  // @criterion-hash: 3b41ba0013f5
  describe('AC-CARD-15: card works with keyboard navigation', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('card front is tab-focusable', () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      expect(cardFront).toHaveAttribute('tabindex', '0')
    })

    it('Enter key triggers card flip', () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      fireEvent.keyDown(cardFront, { key: 'Enter' })
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.getByText('Quiz me!')).toBeInTheDocument()
    })

    it('Space key triggers card flip', () => {
      render(<CardView item={mockItem} />)
      const cardFront = screen.getByRole('button', { name: /Flip card/i })
      fireEvent.keyDown(cardFront, { key: ' ' })
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.getByText('Quiz me!')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-16
  // @criterion-hash: a4c58fa511a0
  describe('AC-CARD-16: image fallback renders on load failure', () => {
    it('renders a fallback div sibling to the img element', () => {
      render(<CardView item={mockItem} />)
      const img = screen.getByRole('img', { name: /Apple/i })
      const fallback = img.nextElementSibling as HTMLElement
      expect(fallback).toBeInTheDocument()
      // Fallback is initially hidden
      expect(fallback.style.display).toBe('none')
    })

    it('fallback contains the item name text', () => {
      render(<CardView item={mockItem} />)
      const img = screen.getByRole('img', { name: /Apple/i })
      const fallback = img.nextElementSibling as HTMLElement
      expect(fallback.textContent).toContain('Apple')
    })

    it('onerror handler hides img and shows fallback', () => {
      render(<CardView item={mockItem} />)
      const img = screen.getByRole('img', { name: /Apple/i })
      const fallback = img.nextElementSibling as HTMLElement

      // Trigger the error handler
      fireEvent.error(img)

      expect(img.style.display).toBe('none')
      expect(fallback.style.display).toBe('flex')
    })

    it('fallback background colour matches item primary colour', () => {
      render(<CardView item={mockItem} />)
      const img = screen.getByRole('img', { name: /Apple/i })
      const fallback = img.nextElementSibling as HTMLElement
      expect(fallback.style.backgroundColor).toBe('red')
    })
  })
})
