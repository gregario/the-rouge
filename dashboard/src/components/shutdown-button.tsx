'use client'

import { useState } from 'react'
import { Power } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function ShutdownButton() {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      await fetch('/api/system/shutdown', { method: 'POST' })
    } catch {
      // Expected: the server exits ~100ms after responding, so the fetch may
      // or may not complete cleanly depending on timing. Either way, show the
      // "stopped" state.
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="text-xs text-muted-foreground">
        Rouge stopped. Run <code className="rounded bg-muted px-1">rouge start</code> or relaunch to resume.
      </div>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        title="Shut down Rouge"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        <Power className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Shut down Rouge?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops the dashboard server. Any build in progress will pause and resume when you restart.
            You can restart anytime with <code className="rounded bg-muted px-1">rouge start</code>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={pending}>
            {pending ? 'Shutting down…' : 'Shut down'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
