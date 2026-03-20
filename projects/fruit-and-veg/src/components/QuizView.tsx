'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Question, QuestionOption, CatalogueItem } from '@/lib/types'

interface QuizViewProps {
  questions: Question[]
  item: CatalogueItem
  onComplete: (correctCount: number, totalCount: number) => void
}

const GROW_ICONS: Record<string, string> = {
  tree: '🌳',
  bush: '🌿',
  vine: '🍇',
  ground: '🌱',
  underground: '🥔',
}

export default function QuizView({ questions, item, onComplete }: QuizViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const answeredRef = useRef(false)

  const question = questions[currentIndex]
  const isCorrect = selectedOptionId === question?.correctOptionId

  const advance = useCallback(() => {
    const nextIndex = currentIndex + 1
    if (nextIndex >= questions.length) {
      onComplete(correctCount + (isCorrect ? 1 : 0), questions.length)
    } else {
      setCurrentIndex(nextIndex)
      setSelectedOptionId(null)
      setAnswered(false)
      answeredRef.current = false
    }
  }, [currentIndex, questions.length, onComplete, correctCount, isCorrect])

  useEffect(() => {
    if (!answered) return
    const timer = setTimeout(advance, 1500)
    return () => clearTimeout(timer)
  }, [answered, advance])

  if (!question) return null

  function handleSelect(optionId: string) {
    if (answeredRef.current) return
    answeredRef.current = true
    setSelectedOptionId(optionId)
    setAnswered(true)
    if (optionId === question.correctOptionId) {
      setCorrectCount((c) => c + 1)
    }
  }

  function optionStyle(option: QuestionOption) {
    if (!answered) return ''
    if (option.id === selectedOptionId && isCorrect) return 'bg-success text-white'
    if (option.id === selectedOptionId && !isCorrect) return 'bg-incorrect text-white'
    if (option.id === question.correctOptionId) return 'bg-success text-white'
    return 'opacity-50'
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <p className="text-lg font-semibold text-foreground text-center">
        {question.questionText}
      </p>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            question.type === 'colour-match'
              ? 'repeat(auto-fit, minmax(48px, 1fr))'
              : question.type === 'true-false'
                ? 'repeat(2, 1fr)'
                : '1fr',
        }}
      >
        {question.options.map((option) => {
          if (question.type === 'colour-match') {
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                aria-label={option.text ?? option.colour ?? 'colour option'}
                className={`rounded-full border-4 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary mx-auto ${
                  answered && option.id === selectedOptionId && isCorrect
                    ? 'border-success ring-2 ring-success'
                    : answered && option.id === selectedOptionId && !isCorrect
                      ? 'border-incorrect ring-2 ring-incorrect'
                      : answered && option.id === question.correctOptionId
                        ? 'border-success ring-2 ring-success'
                        : 'border-transparent hover:border-primary/40'
                }${answered ? '' : ' cursor-pointer active:scale-95'}`}
                style={{
                  width: 48,
                  height: 48,
                  minWidth: 48,
                  minHeight: 48,
                  backgroundColor: option.colour ?? '#ccc',
                }}
                disabled={answered}
              />
            )
          }

          if (question.type === 'where-grow') {
            const iconKey = option.icon ?? ''
            const emoji = GROW_ICONS[iconKey] ?? '🌱'
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`flex items-center gap-3 rounded-xl border-2 border-border px-4 py-3 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${optionStyle(option)} ${answered ? '' : 'cursor-pointer hover:bg-muted active:scale-[0.98]'}`}
                style={{ minHeight: 48 }}
                disabled={answered}
              >
                <span className="text-2xl" aria-hidden="true">{emoji}</span>
                <span className="font-medium">{option.text}</span>
              </button>
            )
          }

          if (question.type === 'true-false') {
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`rounded-xl border-2 border-border px-4 py-4 text-center font-bold text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${optionStyle(option)} ${answered ? '' : 'cursor-pointer hover:bg-muted active:scale-[0.98]'}`}
                style={{ minHeight: 48 }}
                disabled={answered}
              >
                {option.text}
              </button>
            )
          }

          // odd-one-out and fallback
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`rounded-xl border-2 border-border px-4 py-3 text-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${optionStyle(option)} ${answered ? '' : 'cursor-pointer hover:bg-muted active:scale-[0.98]'}`}
              style={{ minHeight: 48 }}
              disabled={answered}
            >
              {option.text}
            </button>
          )
        })}
      </div>

      {answered && (
        <p
          className={`text-center text-sm px-2 py-2 rounded-lg ${
            isCorrect ? 'bg-success/10 text-success' : 'bg-incorrect/10 text-foreground'
          }`}
        >
          {isCorrect ? question.explanationCorrect : question.explanationIncorrect}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {currentIndex + 1} / {questions.length}
      </p>
    </div>
  )
}
