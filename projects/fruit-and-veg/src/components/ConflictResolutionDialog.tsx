'use client'

export type ConflictChoice = 'load_saved' | 'keep_device' | 'merge'

interface ConflictResolutionDialogProps {
  onResolve: (choice: ConflictChoice) => void
}

export function ConflictResolutionDialog({ onResolve }: ConflictResolutionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-label="Progress conflict"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-xl mx-4 p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-bold text-center">Progress Found on Server</h2>
        <p className="text-sm text-muted-foreground text-center">
          This device has progress that differs from your saved progress. How would you like to proceed?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onResolve('load_saved')}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm hover:opacity-90 transition-opacity min-h-[44px]"
          >
            Load saved
          </button>
          <button
            onClick={() => onResolve('keep_device')}
            className="w-full py-3 border border-border rounded-lg font-bold text-sm hover:bg-muted transition-colors min-h-[44px]"
          >
            Keep this device&apos;s
          </button>
          <button
            onClick={() => onResolve('merge')}
            className="w-full py-3 border border-border rounded-lg font-bold text-sm hover:bg-muted transition-colors min-h-[44px]"
          >
            Merge (keep highest)
          </button>
        </div>
      </div>
    </div>
  )
}
