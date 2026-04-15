'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inline help: click the (?) icon to expand a short explanation.
 * Lightweight alternative to a full tooltip library — one-line trigger,
 * revealed content is right there for accessibility and keyboard users.
 *
 * Usage:
 *   <Help>
 *     <p>Stripe needs a secret key (sk_live_… or sk_test_…) for payments.</p>
 *     <p>Skip if you're not taking money.</p>
 *   </Help>
 */
export function Help({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="underline underline-offset-2">{open ? 'Hide' : 'Why?'}</span>
      </button>
      {open && (
        <div className="mt-1 w-full max-w-xl rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
          {children}
        </div>
      )}
    </span>
  )
}
