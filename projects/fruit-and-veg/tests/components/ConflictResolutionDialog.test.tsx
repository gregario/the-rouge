import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConflictResolutionDialog } from '@/components/ConflictResolutionDialog'

// ─── AC-ACCT-07: Conflict resolution prompts user ───────────────────────────
// @criterion: AC-ACCT-07
// @criterion-hash: 08ad57bc2e46
// GIVEN a new device has local progress AND server has different progress
// WHEN parent signs in
// THEN a prompt asks "Load saved / Keep device / Merge"

describe('AC-ACCT-07: ConflictResolutionDialog', () => {
  it('renders three conflict resolution options', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    expect(screen.getByText('Load saved')).toBeInTheDocument()
    expect(screen.getByText(/Keep this device/)).toBeInTheDocument()
    expect(screen.getByText(/Merge/)).toBeInTheDocument()
  })

  it('calls onResolve with "load_saved" when Load saved is clicked', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    fireEvent.click(screen.getByText('Load saved'))
    expect(onResolve).toHaveBeenCalledWith('load_saved')
  })

  it('calls onResolve with "keep_device" when Keep device is clicked', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    fireEvent.click(screen.getByText(/Keep this device/))
    expect(onResolve).toHaveBeenCalledWith('keep_device')
  })

  it('calls onResolve with "merge" when Merge is clicked', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    fireEvent.click(screen.getByText(/Merge/))
    expect(onResolve).toHaveBeenCalledWith('merge')
  })

  it('has role=dialog and aria-modal for accessibility', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('REGRESSION: AC-ACCT-07 — all three buttons have >=44px tap targets', () => {
    const onResolve = vi.fn()
    render(<ConflictResolutionDialog onResolve={onResolve} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    buttons.forEach(btn => {
      expect(btn.className).toContain('min-h-[44px]')
    })
  })
})
