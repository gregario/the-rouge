'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import type { CatalogueItem, Question } from '@/lib/types'
import QuizView from './QuizView'
import StickerCelebration from './StickerCelebration'

type CardPhase = 'front' | 'back' | 'quiz' | 'celebration'

const categoryBgColors: Record<string, string> = {
  fruit: 'bg-cat-fruit',
  vegetable: 'bg-cat-vegetable',
  berry: 'bg-cat-berry',
}

export function CardView({ item }: { item: CatalogueItem }) {
  const router = useRouter()
  const { isRevisit, onCardComplete, onDailyCardComplete, daily, cardReturnTab } = useApp()
  const [phase, setPhase] = useState<CardPhase>('front')
  const [isFlipping, setIsFlipping] = useState(false)
  const revisit = isRevisit(item.id)
  const quizResultRef = useRef({ correct: 0, total: 0 })
  const [earnedBadge, setEarnedBadge] = useState<ReturnType<typeof onCardComplete>>(null)

  const handleFlip = useCallback(() => {
    if (isFlipping || phase !== 'front') return
    setIsFlipping(true)
    setTimeout(() => {
      setPhase('back')
      setIsFlipping(false)
    }, 400)
  }, [isFlipping, phase])

  const handleQuizMe = useCallback(() => {
    setPhase('quiz')
  }, [])

  const handleQuizComplete = useCallback(
    (correctCount: number, totalCount: number) => {
      quizResultRef.current = { correct: correctCount, total: totalCount }
      const badge = onCardComplete(item.id, correctCount, totalCount)
      setEarnedBadge(badge)

      // Check if this is a daily challenge card
      const isDailyCard =
        daily.featuredItemId === item.id ||
        daily.reviewItemIds.includes(item.id)
      if (isDailyCard) {
        onDailyCardComplete(item.id)
      }

      setPhase('celebration')
    },
    [item.id, onCardComplete, onDailyCardComplete, daily]
  )

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const bgColor = categoryBgColors[item.category] || 'bg-muted'

  // Select 2-3 questions for the quiz
  const quizQuestions = item.questions.slice(0, 3)

  const returnPath = cardReturnTab === 'collection' ? '/collection' : '/'

  if (phase === 'celebration') {
    return (
      <StickerCelebration
        item={item}
        isRevisit={revisit}
        badge={earnedBadge}
        onSeeCollection={() => router.push('/collection')}
        onNextCard={() => router.push(returnPath)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <button
        onClick={handleBack}
        className="absolute top-4 left-4 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground z-10"
        aria-label="Go back"
      >
        <ArrowLeft size={24} />
      </button>

      {phase === 'quiz' ? (
        <QuizView
          questions={quizQuestions}
          item={item}
          onComplete={handleQuizComplete}
        />
      ) : (
        <div
          className="card-flip-container w-full max-w-[360px] mx-auto px-4"
          style={{ height: '70vh', maxHeight: '500px' }}
        >
          <div
            className={`card-flip-inner w-full h-full ${
              phase === 'back' ? 'flipped' : ''
            } ${isFlipping ? 'pointer-events-none' : ''}`}
            onClick={phase === 'front' ? handleFlip : undefined}
            onKeyDown={
              phase === 'front'
                ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip() } }
                : undefined
            }
            tabIndex={phase === 'front' ? 0 : -1}
            role={phase === 'front' ? 'button' : undefined}
            aria-label={phase === 'front' ? `Flip card to learn about ${item.name}` : undefined}
          >
            {/* FRONT */}
            <div
              className={`card-flip-front ${bgColor} rounded-xl shadow-md flex flex-col items-center justify-center p-5 cursor-pointer active:scale-[0.98] transition-transform`}
            >
              {revisit && (
                <div className="absolute top-3 right-3 bg-accent rounded-full p-1.5">
                  <Check size={16} className="text-accent-foreground" />
                </div>
              )}
              <div className="w-48 h-48 rounded-full bg-white/50 flex items-center justify-center mb-4 overflow-hidden">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-40 h-40 object-contain"
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <div
                  className="w-40 h-40 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{
                    display: 'none',
                    backgroundColor: item.colours[0] || '#ccc',
                  }}
                >
                  {item.name}
                </div>
              </div>
              <h2 className="text-2xl font-extrabold text-foreground">{item.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">Tap to learn about me!</p>
            </div>

            {/* BACK */}
            <div
              className={`card-flip-back ${bgColor} rounded-xl shadow-md flex flex-col p-5 overflow-y-auto`}
            >
              <h2 className="text-xl font-bold text-center mb-4">{item.name}</h2>
              <div className="flex-1 space-y-3">
                {item.funFacts.map((fact, i) => (
                  <div
                    key={i}
                    className="bg-white/80 rounded-lg p-3 text-sm font-semibold leading-relaxed"
                  >
                    {renderHighlightedFact(fact.text, fact.highlightWord)}
                  </div>
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleQuizMe() }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    handleQuizMe()
                  }
                }}
                className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-lg pulse-gentle hover:scale-105 hover:animate-none active:scale-95 transition-transform min-h-[48px]"
              >
                Quiz me!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderHighlightedFact(text: string, highlightWord: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(highlightWord.toLowerCase())
  if (idx === -1) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + highlightWord.length)
  const after = text.slice(idx + highlightWord.length)
  return (
    <>
      {before}
      <span className="text-primary font-extrabold">{match}</span>
      {after}
    </>
  )
}
