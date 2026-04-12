'use client'

import { useState } from 'react'
import { NewProjectDialog } from './new-project-dialog'

export function NewProjectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        + New Project
      </button>
      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
