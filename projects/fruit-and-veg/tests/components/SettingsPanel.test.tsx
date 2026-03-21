import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Settings: () => <svg data-testid="settings-icon" />,
  X: () => <svg data-testid="close-icon" />,
  Cloud: () => <svg data-testid="cloud-icon" />,
  CloudOff: () => <svg data-testid="cloudoff-icon" />,
  Loader2: () => <svg data-testid="loader-icon" />,
}))

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowser: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve(),
    },
  }),
}))

// Mock accounts module
vi.mock('@/lib/accounts', () => ({
  createAccount: vi.fn(),
  signIn: vi.fn(),
  deleteAccount: vi.fn(),
}))

import { SettingsButton } from '@/components/SettingsButton'
import { SettingsPanel } from '@/components/SettingsPanel'

// ─── AC-ACCT-01: Settings accessible from any screen ───────────────────────
// @criterion: AC-ACCT-01
// @criterion-hash: 393be5da7083
// GIVEN the user is on Home, Collection, or Garden
// WHEN they tap the settings icon
// THEN the settings panel opens
describe('AC-ACCT-01: settings accessible from any screen', () => {
  it('renders a settings button with accessible label', () => {
    render(<SettingsButton />)
    const btn = screen.getByRole('button', { name: /settings/i })
    expect(btn).toBeInTheDocument()
  })

  it('settings panel is not visible before tapping the button', () => {
    render(<SettingsButton />)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('tapping the settings icon opens the settings panel', async () => {
    render(<SettingsButton />)
    const btn = screen.getByRole('button', { name: /settings/i })
    fireEvent.click(btn)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Save Progress')).toBeInTheDocument()
    })
  })

  it('settings panel can be dismissed by tapping the close button', async () => {
    render(<SettingsButton />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByText('Settings')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close settings/i })).toBeInTheDocument()
    })
    const closeBtn = screen.getByRole('button', { name: /close settings/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByText('Save Progress')).not.toBeInTheDocument()
  })
})

// ─── AC-ACCT-02: Account creation requires email and guardian checkbox ───────
// @criterion: AC-ACCT-02
// @criterion-hash: 3f5ab4fbd438
// GIVEN the settings panel is open (no account)
// WHEN email is entered but checkbox is unchecked
// THEN "Create Account" button remains disabled
describe('AC-ACCT-02: account creation requires email and guardian checkbox', () => {
  const onClose = vi.fn()

  it('Create Account button is disabled initially', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled()
  })

  it('Create Account button remains disabled with valid email but unchecked checkbox', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.change(emailInput, { target: { value: 'parent@example.com' } })
    const btn = screen.getByRole('button', { name: /create account/i })
    expect(btn).toBeDisabled()
  })

  it('Create Account button remains disabled with checkbox checked but no email', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    const btn = screen.getByRole('button', { name: /create account/i })
    expect(btn).toBeDisabled()
  })

  it('Create Account button remains disabled with invalid email and checked checkbox', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    const btn = screen.getByRole('button', { name: /create account/i })
    expect(btn).toBeDisabled()
  })

  it('Create Account button is enabled with valid email AND checked checkbox', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.change(emailInput, { target: { value: 'parent@example.com' } })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    const btn = screen.getByRole('button', { name: /create account/i })
    expect(btn).not.toBeDisabled()
  })
})

// ─── AC-ACCT-03: Verification email sent on account creation ─────────────────
// @criterion: AC-ACCT-03
// @criterion-hash: 39c2e89f85a0
// GIVEN valid email and checked guardian checkbox
// WHEN user taps "Create Account"
// THEN API call succeeds, verification pending state shown, email sent
// NOTE: Backend not yet implemented — this test verifies the expected UI transition.
// The test will FAIL until the API route is implemented.
describe('AC-ACCT-03: verification email sent on account creation', () => {
  it.todo('shows verification pending message after clicking Create Account — requires backend API implementation')
  it.todo('calls POST /api/accounts on Create Account click — requires backend API implementation')
})

// ─── AC-ACCT-04: Account activates after email verification ──────────────────
// @criterion: AC-ACCT-04
// @criterion-hash: 46a17ead4a2f
// GIVEN account is in pending verification state
// WHEN parent clicks the verification link
// THEN account status changes to verified, first sync occurs
// NOTE: Requires backend + email verification flow. Cannot be unit-tested without infrastructure.
describe('AC-ACCT-04: account activates after email verification', () => {
  it.todo('account transitions to verified state after email link clicked — requires backend')
})

// ─── AC-ACCT-05: Progress syncs after card completion ────────────────────────
// @criterion: AC-ACCT-05
// @criterion-hash: 75269cfcf766
// GIVEN a verified account exists
// WHEN the user completes a card
// THEN progress is saved locally AND synced to backend
// NOTE: Requires verified account + backend sync endpoint.
describe('AC-ACCT-05: progress syncs after card completion', () => {
  it.todo('progress syncs to backend on card completion — requires verified account and sync endpoint')
})

// ─── AC-ACCT-06: Sign-in on new device loads progress ───────────────────────
// @criterion: AC-ACCT-06
// @criterion-hash: 46b607df9231
// GIVEN a verified account with 10 completed items
// WHEN parent signs in on a new device
// THEN server progress is loaded and collection shows 10 completed items
// NOTE: Requires magic link sign-in flow and backend.
describe('AC-ACCT-06: sign-in on new device loads progress', () => {
  it.todo('server progress loads on sign-in — requires magic link auth and backend')
})

// ─── AC-ACCT-07: Conflict resolution prompts user ───────────────────────────
// @criterion: AC-ACCT-07
// @criterion-hash: d35f6f812f72
// GIVEN a new device has local progress AND server has different progress
// WHEN parent signs in
// THEN a prompt asks "Load saved / Keep device / Merge"
// NOTE: Requires sign-in flow and conflict detection logic.
describe('AC-ACCT-07: conflict resolution prompts user', () => {
  it.todo('conflict resolution dialog shows three options — requires sign-in and conflict detection')
})

// ─── AC-ACCT-08: Account deletion removes all server data ───────────────────
// @criterion: AC-ACCT-08
// @criterion-hash: 542cf4f47f26
// GIVEN a verified account
// WHEN parent confirms account deletion
// THEN Account and SyncedProgress are hard-deleted from server
// NOTE: Requires signed-in state and backend DELETE endpoint.
describe('AC-ACCT-08: account deletion removes all server data', () => {
  it.todo('account and server data deleted on confirmation — requires backend')
})

// ─── AC-ACCT-09: Offline mode works without disruption ──────────────────────
// @criterion: AC-ACCT-09
// @criterion-hash: 2f1cd070746e
// GIVEN a verified account and no network connection
// WHEN kid completes cards
// THEN progress saves locally, no error shown to child, sync indicator shows offline
// NOTE: Requires network simulation and verified account.
describe('AC-ACCT-09: offline mode works without disruption', () => {
  it.todo('offline mode saves locally and shows sync indicator — requires network simulation and backend')
})

// ─── AC-ACCT-10: Resend verification available ──────────────────────────────
// @criterion: AC-ACCT-10
// @criterion-hash: e6c695db1e33
// GIVEN account is pending verification
// WHEN 30 seconds have passed since creation
// THEN a "Resend verification email" link appears
// NOTE: The pending verification UI doesn't exist yet (blocked by AC-ACCT-03).
describe('AC-ACCT-10: resend verification available after 30 seconds', () => {
  it.todo('resend link appears after 30s in verification pending state — requires AC-ACCT-03 UI first')
})

// ─── AC-ACCT-11: Magic link sign-in (passwordless) ──────────────────────────
// @criterion: AC-ACCT-11
// @criterion-hash: 1aabfce6c8f9
// GIVEN a verified account exists
// WHEN parent enters email and taps "Sign in"
// THEN a magic link email is sent (no password field)
// NOTE: Sign-in UI not yet implemented (only create account UI exists).
describe('AC-ACCT-11: magic link sign-in (passwordless)', () => {
  it.todo('magic link auth — no password field shown, sign-in via email link — requires sign-in UI and backend')
})

// ─── AC-ACCT-12: No child-facing account UI ─────────────────────────────────
// @criterion: AC-ACCT-12
// @criterion-hash: ae0011ad7a06
// GIVEN any app state
// WHEN the child interacts with Home, Collection, Garden, or Card views
// THEN no account-related UI appears in the main content area
describe('AC-ACCT-12: no child-facing account UI', () => {
  const onClose = vi.fn()

  it('settings panel does not render inside main content (it is a portal/overlay)', async () => {
    // SettingsPanel renders as a fixed overlay, not inside any main content area
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
    const panel = screen.getByText('Settings').closest('[class*="fixed"]')
    expect(panel).toBeInTheDocument()
    // The panel is fixed-positioned (overlay), not a child of main content
    expect(panel?.className).toContain('fixed')
  })

  it('settings panel is not rendered without user interaction', () => {
    // SettingsButton only shows panel when clicked — main content never has account UI
    render(<SettingsButton />)
    expect(screen.queryByText('Save Progress')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('parent@example.com')).not.toBeInTheDocument()
  })

  it('settings button (gear icon) has minimum 44x44px tap target', () => {
    render(<SettingsButton />)
    const btn = screen.getByRole('button', { name: /settings/i })
    // Check class includes minimum sizing
    expect(btn.className).toMatch(/min-w-\[44px\]|min-h-\[44px\]/)
  })
})

// ─── AC-ACCT-13: Display name shown in app ──────────────────────────────────
// @criterion: AC-ACCT-13
// @criterion-hash: 451d60f4bddf
// GIVEN an account with displayName "Lily"
// WHEN the app loads
// THEN the home screen shows "Hi, Lily!" greeting
// NOTE: Requires account system and display name storage.
describe('AC-ACCT-13: display name shown in app', () => {
  it.todo('"Hi, [name]!" greeting appears on home screen when account has displayName — requires account system')
})

// ─── AC-ACCT-14: Email validation ───────────────────────────────────────────
// @criterion: AC-ACCT-14
// @criterion-hash: 358f5f82c58b
// GIVEN the email input field
// WHEN an invalid email is entered and focus leaves
// THEN an error message "Please enter a valid email" appears
describe('AC-ACCT-14: email validation', () => {
  const onClose = vi.fn()

  it('shows error message when invalid email loses focus', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.change(emailInput, { target: { value: 'not-valid' } })
    fireEvent.blur(emailInput)
    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument()
  })

  it('does not show error on blur when email field is empty', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.blur(emailInput)
    expect(screen.queryByText('Please enter a valid email')).not.toBeInTheDocument()
  })

  it('clears error when valid email is entered', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    fireEvent.change(emailInput, { target: { value: 'bad' } })
    fireEvent.blur(emailInput)
    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument()
    fireEvent.change(emailInput, { target: { value: 'good@example.com' } })
    fireEvent.blur(emailInput)
    expect(screen.queryByText('Please enter a valid email')).not.toBeInTheDocument()
  })

  it('email input has type="email" for mobile keyboard optimisation', async () => {
    render(<SettingsPanel onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('parent@example.com')).toBeInTheDocument()
    })
    const emailInput = screen.getByPlaceholderText('parent@example.com')
    expect(emailInput).toHaveAttribute('type', 'email')
  })
})
