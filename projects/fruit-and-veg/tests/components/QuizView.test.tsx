import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Question, CatalogueItem } from '@/lib/types'
import QuizView from '@/components/QuizView'

// ---------- Mock data ----------

const mockItem: CatalogueItem = {
  id: 'test-item',
  name: 'Test Item',
  image: '/images/catalogue/test.webp',
  category: 'fruit',
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

const colourMatchQuestion: Question = {
  id: 'q1',
  type: 'colour-match',
  questionText: 'What colour am I?',
  options: [
    { id: 'a', text: null, colour: '#FF0000', icon: null },
    { id: 'b', text: null, colour: '#00FF00', icon: null },
    { id: 'c', text: null, colour: '#0000FF', icon: null },
  ],
  correctOptionId: 'a',
  explanationCorrect: 'Yes!',
  explanationIncorrect: 'No!',
}

const whereGrowQuestion: Question = {
  id: 'q2',
  type: 'where-grow',
  questionText: 'Where do I grow?',
  options: [
    { id: 'a', text: 'Tree', colour: null, icon: 'tree' },
    { id: 'b', text: 'Ground', colour: null, icon: 'ground' },
    { id: 'c', text: 'Underground', colour: null, icon: 'underground' },
  ],
  correctOptionId: 'a',
  explanationCorrect: 'Yes!',
  explanationIncorrect: 'No!',
}

const trueFalseQuestion: Question = {
  id: 'q3',
  type: 'true-false',
  questionText: 'Am I a fruit?',
  options: [
    { id: 'a', text: 'True', colour: null, icon: null },
    { id: 'b', text: 'False', colour: null, icon: null },
  ],
  correctOptionId: 'a',
  explanationCorrect: 'Correct!',
  explanationIncorrect: 'Wrong!',
}

// ---------- Tests ----------

describe('QuizView', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    onComplete.mockClear()
  })

  // @criterion: AC-CARD-04
  // @criterion-hash: b838ec543d9d
  describe('AC-CARD-04: answer options', () => {
    it('renders 3 options for a colour-match question', () => {
      render(
        <QuizView questions={[colourMatchQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(3)
    })

    it('renders 2 options for a true-false question', () => {
      render(
        <QuizView questions={[trueFalseQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(2)
    })

    it('displays the question text', () => {
      render(
        <QuizView questions={[colourMatchQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      expect(screen.getByText('What colour am I?')).toBeInTheDocument()
    })

    it('displays progress indicator (1 / N)', () => {
      render(
        <QuizView
          questions={[colourMatchQuestion, whereGrowQuestion]}
          item={mockItem}
          onComplete={onComplete}
        />,
      )
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-05
  // @criterion-hash: 7953882086fa
  describe('AC-CARD-05: correct answer feedback', () => {
    it('applies bg-success class to the selected correct option', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const correctButton = screen.getByText('Tree').closest('button')!
      fireEvent.click(correctButton)

      expect(correctButton.className).toContain('bg-success')
    })

    it('shows the correct explanation text', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      fireEvent.click(screen.getByText('Tree').closest('button')!)

      expect(screen.getByText('Yes!')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-06
  // @criterion-hash: b5cafa3593e2
  describe('AC-CARD-06: incorrect answer feedback', () => {
    it('applies bg-incorrect class to the selected wrong option', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const wrongButton = screen.getByText('Ground').closest('button')!
      fireEvent.click(wrongButton)

      expect(wrongButton.className).toContain('bg-incorrect')
    })

    it('highlights the correct answer with bg-success when wrong option selected', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      fireEvent.click(screen.getByText('Ground').closest('button')!)

      const correctButton = screen.getByText('Tree').closest('button')!
      expect(correctButton.className).toContain('bg-success')
    })

    it('does NOT use red styling — no bg-red or bg-destructive classes', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const wrongButton = screen.getByText('Ground').closest('button')!
      fireEvent.click(wrongButton)

      expect(wrongButton.className).not.toContain('bg-red')
      expect(wrongButton.className).not.toContain('bg-destructive')
    })

    it('dims unselected wrong options with opacity-50', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      fireEvent.click(screen.getByText('Ground').closest('button')!)

      // Underground is neither selected nor correct — should be dimmed
      const otherButton = screen.getByText('Underground').closest('button')!
      expect(otherButton.className).toContain('opacity-50')
    })

    it('shows the incorrect explanation text', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      fireEvent.click(screen.getByText('Ground').closest('button')!)

      expect(screen.getByText('No!')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-07
  // @criterion-hash: 747f9b4c874a
  describe('AC-CARD-07: auto-advance', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('advances to the next question after 1500ms', () => {
      render(
        <QuizView
          questions={[whereGrowQuestion, trueFalseQuestion]}
          item={mockItem}
          onComplete={onComplete}
        />,
      )

      // Answer the first question
      fireEvent.click(screen.getByText('Tree').closest('button')!)
      expect(screen.getByText('Where do I grow?')).toBeInTheDocument()

      // Advance time by 1500ms
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Should now show the second question
      expect(screen.getByText('Am I a fruit?')).toBeInTheDocument()
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    })

    it('calls onComplete after the last question auto-advances', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      fireEvent.click(screen.getByText('Tree').closest('button')!)

      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(1, 1)
    })

    it('does not advance before 1500ms', () => {
      render(
        <QuizView
          questions={[whereGrowQuestion, trueFalseQuestion]}
          item={mockItem}
          onComplete={onComplete}
        />,
      )

      fireEvent.click(screen.getByText('Tree').closest('button')!)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      // Still on first question
      expect(screen.getByText('Where do I grow?')).toBeInTheDocument()
    })
  })

  // @criterion: AC-CARD-11
  // @criterion-hash: 7078a6602f2a
  describe('AC-CARD-11: colour circles', () => {
    it('renders buttons with inline background colour matching hex values', () => {
      render(
        <QuizView questions={[colourMatchQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const buttons = screen.getAllByRole('button')

      expect(buttons[0].style.backgroundColor).toBe('rgb(255, 0, 0)')
      expect(buttons[1].style.backgroundColor).toBe('rgb(0, 255, 0)')
      expect(buttons[2].style.backgroundColor).toBe('rgb(0, 0, 255)')
    })

    it('renders buttons as 48x48 circles (rounded-full class)', () => {
      render(
        <QuizView questions={[colourMatchQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.className).toContain('rounded-full')
        expect(button.style.width).toBe('48px')
        expect(button.style.height).toBe('48px')
      })
    })

    it('does not render visible text inside colour-match buttons', () => {
      render(
        <QuizView questions={[colourMatchQuestion]} item={mockItem} onComplete={onComplete} />,
      )
      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.textContent).toBe('')
      })
    })
  })

  // @criterion: AC-CARD-12
  // @criterion-hash: f423dab3587e
  describe('AC-CARD-12: grow icons', () => {
    it('renders emoji icons next to option text', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      // Check icon emojis are present
      expect(screen.getByText('🌳')).toBeInTheDocument()
      expect(screen.getByText('🌱')).toBeInTheDocument()
      expect(screen.getByText('🥔')).toBeInTheDocument()
    })

    it('renders option text labels', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      expect(screen.getByText('Tree')).toBeInTheDocument()
      expect(screen.getByText('Ground')).toBeInTheDocument()
      expect(screen.getByText('Underground')).toBeInTheDocument()
    })

    it('renders icons with aria-hidden for accessibility', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      const treeIcon = screen.getByText('🌳')
      expect(treeIcon.getAttribute('aria-hidden')).toBe('true')
    })
  })

  // @criterion: AC-CARD-14
  // @criterion-hash: a77034ad06ae
  describe('AC-CARD-14: double-tap protection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('ignores second click on the same button via answeredRef guard', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      const wrongButton = screen.getByText('Ground').closest('button')!

      // Click twice rapidly
      fireEvent.click(wrongButton)
      fireEvent.click(wrongButton)

      // Advance to completion
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // onComplete should be called exactly once with 0 correct (wrong answer)
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(0, 1)
    })

    it('ignores click on a different button after first selection', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      const wrongButton = screen.getByText('Ground').closest('button')!
      const correctButton = screen.getByText('Tree').closest('button')!

      // Click wrong first, then try to click correct
      fireEvent.click(wrongButton)
      fireEvent.click(correctButton)

      // Advance to completion
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Should still register 0 correct — second click was ignored
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(0, 1)
    })

    it('buttons are disabled after answering', () => {
      render(
        <QuizView questions={[whereGrowQuestion]} item={mockItem} onComplete={onComplete} />,
      )

      fireEvent.click(screen.getByText('Ground').closest('button')!)

      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button).toBeDisabled()
      })
    })
  })

  // Quiz completion with multi-question sequences
  describe('Quiz completion: onComplete with correct counts', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('reports mixed results (1 correct, 1 wrong) across 2 questions', () => {
      const questions = [whereGrowQuestion, trueFalseQuestion]
      render(
        <QuizView questions={questions} item={mockItem} onComplete={onComplete} />,
      )

      // Answer first question correctly
      fireEvent.click(screen.getByText('Tree').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Answer second question incorrectly
      fireEvent.click(screen.getByText('False').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(onComplete).toHaveBeenCalledOnce()
      expect(onComplete).toHaveBeenCalledWith(1, 2)
    })

    it('reports all correct when every answer is right', () => {
      const questions = [whereGrowQuestion, trueFalseQuestion]
      render(
        <QuizView questions={questions} item={mockItem} onComplete={onComplete} />,
      )

      // Answer first question correctly
      fireEvent.click(screen.getByText('Tree').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Answer second question correctly
      fireEvent.click(screen.getByText('True').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(onComplete).toHaveBeenCalledOnce()
      expect(onComplete).toHaveBeenCalledWith(2, 2)
    })

    it('reports zero correct when every answer is wrong', () => {
      const questions = [whereGrowQuestion, trueFalseQuestion]
      render(
        <QuizView questions={questions} item={mockItem} onComplete={onComplete} />,
      )

      // Answer first question incorrectly
      fireEvent.click(screen.getByText('Ground').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Answer second question incorrectly
      fireEvent.click(screen.getByText('False').closest('button')!)
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(onComplete).toHaveBeenCalledOnce()
      expect(onComplete).toHaveBeenCalledWith(0, 2)
    })
  })
})
