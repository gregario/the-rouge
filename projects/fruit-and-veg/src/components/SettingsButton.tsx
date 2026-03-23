'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import { SettingsPanel } from './SettingsPanel'

export function SettingsButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  )
}
