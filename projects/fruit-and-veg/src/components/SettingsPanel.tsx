'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [email, setEmail] = useState('')
  const [guardianChecked, setGuardianChecked] = useState(false)
  const [emailError, setEmailError] = useState('')

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const canSubmit = isValidEmail && guardianChecked

  const handleEmailBlur = () => {
    if (email && !isValidEmail) {
      setEmailError('Please enter a valid email')
    } else {
      setEmailError('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-white h-full shadow-lg p-6 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold">Save Progress</h3>
          <p className="text-sm text-muted-foreground">
            Create an account to save stickers and progress across devices.
          </p>

          <div>
            <label htmlFor="email" className="block text-sm font-semibold mb-1">
              Parent&apos;s email
            </label>
            <input
              id="email"
              type="email"
              placeholder="parent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleEmailBlur}
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                emailError
                  ? 'border-destructive'
                  : isValidEmail && email
                  ? 'border-success'
                  : 'border-border'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            {emailError && (
              <p className="text-xs text-destructive mt-1">{emailError}</p>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={guardianChecked}
              onChange={(e) => setGuardianChecked(e.target.checked)}
              className="mt-1 w-4 h-4 accent-primary"
            />
            <span className="text-sm">I am the parent or guardian</span>
          </label>

          <button
            disabled={!canSubmit}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Create Account
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Accounts are coming soon! Your progress is saved on this device.
          </p>
        </div>
      </div>
    </div>
  )
}
