'use client'

interface ProgressDotsProps {
  total: number
  completed: number
}

export function ProgressDots({ total, completed }: ProgressDotsProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-3" aria-label={`${completed} of ${total} completed`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full transition-all duration-300 ${
            i < completed
              ? 'bg-primary scale-100'
              : 'bg-border scale-90'
          }`}
          style={i < completed ? { animation: 'sticker-unlock 300ms ease-out' } : undefined}
        />
      ))}
    </div>
  )
}
