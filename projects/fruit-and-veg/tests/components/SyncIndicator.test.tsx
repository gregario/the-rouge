import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('lucide-react', () => ({
  Cloud: (props: any) => <svg data-testid="cloud-icon" {...props} />,
  CloudOff: (props: any) => <svg data-testid="cloudoff-icon" {...props} />,
  Loader2: (props: any) => <svg data-testid="loader-icon" {...props} />,
}))

import { SyncIndicator } from '@/components/SyncIndicator'

// ─── AC-ACCT-09: Offline mode with sync icon ───────────────────────────────
// @criterion: AC-ACCT-09
// @criterion-hash: 2f1cd070746e
// GIVEN a verified account and no network connection
// WHEN kid completes cards
// THEN progress saves locally, no error shown to child, sync indicator shows offline

describe('AC-ACCT-09: sync status indicator', () => {
  it('shows cloud icon when synced', () => {
    render(<SyncIndicator status="synced" />)
    expect(screen.getByTestId('cloud-icon')).toBeInTheDocument()
    expect(screen.getByLabelText('Progress synced')).toBeInTheDocument()
  })

  it('shows cloud-off icon when offline', () => {
    render(<SyncIndicator status="offline" />)
    expect(screen.getByTestId('cloudoff-icon')).toBeInTheDocument()
    expect(screen.getByLabelText('Offline — progress saved locally')).toBeInTheDocument()
  })

  it('shows loader icon when syncing', () => {
    render(<SyncIndicator status="syncing" />)
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument()
  })

  it('renders nothing when idle (no account)', () => {
    const { container } = render(<SyncIndicator status="idle" />)
    expect(container.firstChild).toBeNull()
  })
})
