'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import { createAccount, signIn, deleteAccount } from '@/lib/accounts'
import type { User } from '@supabase/supabase-js'

type PanelView = 'loading' | 'no_account' | 'sign_in' | 'pending_verification' | 'signed_in'

interface SettingsPanelProps {
  onClose: () => void
  onAuthChange?: (user: User | null) => void
}

export function SettingsPanel({ onClose, onAuthChange }: SettingsPanelProps) {
  const [view, setView] = useState<PanelView>('loading')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [guardianChecked, setGuardianChecked] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [resendVisible, setResendVisible] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const canSubmit = isValidEmail && guardianChecked && !submitting

  const checkAuth = useCallback(async () => {
    const supabase = createSupabaseBrowser()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser)
    if (currentUser) {
      setView(currentUser.email_confirmed_at ? 'signed_in' : 'pending_verification')
    } else {
      setView('no_account')
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleEmailBlur = () => {
    if (email && !isValidEmail) {
      setEmailError('Please enter a valid email')
    } else {
      setEmailError('')
    }
  }

  const handleCreateAccount = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setMessage('')
    const result = await createAccount(email, displayName, guardianChecked)
    setSubmitting(false)
    if ('error' in result) {
      setMessage(result.error)
    } else {
      setView('pending_verification')
      setMessage('')
      setTimeout(() => setResendVisible(true), 30000)
    }
  }

  const handleSignIn = async () => {
    if (!isValidEmail) return
    setSubmitting(true)
    setMessage('')
    const result = await signIn(email)
    setSubmitting(false)
    if ('error' in result) {
      setMessage(result.error)
    } else {
      setMessage(result.message)
    }
  }

  const handleResend = async () => {
    setResendVisible(false)
    setSubmitting(true)
    await signIn(email)
    setSubmitting(false)
    setMessage('Verification email resent!')
    setTimeout(() => setResendVisible(true), 30000)
  }

  const handleDeleteAccount = async () => {
    setSubmitting(true)
    await deleteAccount()
    setSubmitting(false)
    setUser(null)
    setConfirmDelete(false)
    setView('no_account')
    setEmail('')
    setGuardianChecked(false)
    onAuthChange?.(null)
  }

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    setUser(null)
    setView('no_account')
    onAuthChange?.(null)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/30"
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

        {view === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {view === 'no_account' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Save Progress</h3>
            <p className="text-sm text-muted-foreground">
              Create an account to save stickers and progress across devices.
            </p>

            <div>
              <label htmlFor="display-name" className="block text-sm font-semibold mb-1">
                Child&apos;s name
              </label>
              <input
                id="display-name"
                type="text"
                placeholder="e.g. Lily"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

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
              onClick={handleCreateAccount}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity min-h-[44px]"
            >
              {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Create Account'}
            </button>

            {message && (
              <p className="text-xs text-destructive text-center">{message}</p>
            )}

            <div className="border-t pt-4 mt-4">
              <button
                onClick={() => setView('sign_in')}
                className="text-sm text-primary hover:underline"
              >
                Already have an account? Sign in
              </button>
            </div>
          </div>
        )}

        {view === 'sign_in' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Sign In</h3>
            <p className="text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a sign-in link.
            </p>

            <div>
              <label htmlFor="sign-in-email" className="block text-sm font-semibold mb-1">
                Email
              </label>
              <input
                id="sign-in-email"
                type="email"
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                className={`w-full px-3 py-2 border rounded-md text-sm ${
                  emailError ? 'border-destructive' : 'border-border'
                } focus:outline-none focus:ring-2 focus:ring-primary`}
              />
              {emailError && (
                <p className="text-xs text-destructive mt-1">{emailError}</p>
              )}
            </div>

            <button
              disabled={!isValidEmail || submitting}
              onClick={handleSignIn}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity min-h-[44px]"
            >
              {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Send Sign-in Link'}
            </button>

            {message && (
              <p className="text-xs text-muted-foreground text-center">{message}</p>
            )}

            <button
              onClick={() => { setView('no_account'); setMessage('') }}
              className="text-sm text-primary hover:underline"
            >
              Back to create account
            </button>
          </div>
        )}

        {view === 'pending_verification' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CloudOff size={20} className="text-amber-500" />
              <h3 className="text-lg font-bold">Verification Pending</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Check your email! We&apos;ve sent a verification link to <strong>{email || user?.email}</strong>.
              Your progress will start syncing once verified.
            </p>

            {resendVisible && (
              <button
                onClick={handleResend}
                disabled={submitting}
                className="text-sm text-primary hover:underline"
              >
                Resend verification email
              </button>
            )}

            {message && (
              <p className="text-xs text-muted-foreground text-center">{message}</p>
            )}
          </div>
        )}

        {view === 'signed_in' && user && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Cloud size={20} className="text-success" />
              <h3 className="text-lg font-bold">Account Active</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{user.email}</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Progress is being synced across devices.
            </p>

            <div className="border-t pt-4 space-y-3">
              <button
                onClick={handleSignOut}
                className="w-full py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors min-h-[44px]"
              >
                Sign Out
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Delete Account
                </button>
              ) : (
                <div className="bg-destructive/10 p-3 rounded-lg space-y-2">
                  <p className="text-xs text-destructive font-semibold">
                    Are you sure? This will delete your account and all saved progress from our servers.
                    Progress on this device will be kept locally. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={submitting}
                      className="px-3 py-2 bg-destructive text-white rounded text-xs font-bold min-h-[44px]"
                    >
                      {submitting ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 border border-border rounded text-xs min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
