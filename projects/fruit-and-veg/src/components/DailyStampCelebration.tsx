'use client'

import { useEffect } from 'react'
import { Flame } from 'lucide-react'

interface DailyStampCelebrationProps {
  streak: number
  onDismiss: () => void
}

export function DailyStampCelebration({ streak, onDismiss }: DailyStampCelebrationProps) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  // Escape key dismisses
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Daily Challenge Complete!"
    >
      <div
        className="bg-background rounded-3xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Stamp icon with drop animation */}
        <div className="stamp-drop">
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-4xl shadow-md">
            📮
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-foreground text-center">
          Daily Challenge Complete!
        </h2>

        {/* Streak update */}
        {streak > 0 && (
          <div className="flex items-center gap-2 text-lg font-bold">
            <Flame size={24} className="text-orange-500" />
            <span>{streak} day{streak > 1 ? 's' : ''} in a row!</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground text-center">
          Come back tomorrow for a new fruit!
        </p>

        <button
          onClick={onDismiss}
          className="mt-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all min-h-[44px]"
        >
          Done
        </button>
      </div>
    </div>
  )
}
