import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stub the bridge client so we can drive the command result paths.
const mockSendCommand = vi.fn()
const mockFetchBuildStatus = vi.fn()
vi.mock('@/lib/bridge-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bridge-client')>()
  return {
    ...actual,
    isBridgeEnabled: () => true,
    sendCommand: (slug: string, command: string, body?: object) =>
      mockSendCommand(slug, command, body),
    fetchBuildStatus: (slug: string) => mockFetchBuildStatus(slug),
  }
})

import { ActionBar } from '../action-bar'

beforeEach(() => {
  mockSendCommand.mockReset()
  mockFetchBuildStatus.mockReset()
  mockFetchBuildStatus.mockResolvedValue({ running: false, startedAt: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ActionBar — command result surfacing', () => {
  it('shows an inline notice when stop succeeds on an already-stopped build', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockResolvedValueOnce({ ok: true, alreadyStopped: true })

    render(<ActionBar state="foundation" slug="alpha" />)

    // Click the Stop Build button in the action bar. After click, a
    // confirmation dialog appears with a second "Stop Build" button —
    // click the dialog one (last in the list).
    const stopButtons = () => screen.getAllByRole('button', { name: /^stop build$/i })
    await user.click(stopButtons()[0])
    await waitFor(() => expect(stopButtons().length).toBeGreaterThan(1))
    await user.click(stopButtons().at(-1)!)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-notice')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-notice')).toHaveTextContent(/already stopped/i)
    expect(screen.queryByTestId('action-bar-error')).not.toBeInTheDocument()
  })

  it('shows a stronger notice when zombie state was rolled back', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      alreadyStopped: true,
      stateRolledBack: true,
    })

    render(<ActionBar state="foundation" slug="alpha" />)

    const stopButton = await screen.findByRole('button', { name: /stop build/i })
    await user.click(stopButton)
    const confirmButton = screen.getAllByRole('button', { name: /^stop build$/i }).at(-1)!
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-notice')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-notice')).toHaveTextContent(/back to Ready/i)
  })

  it('surfaces command errors inline instead of throwing to console.error', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockRejectedValueOnce(new Error('something went wrong'))

    // Spy on console.error to confirm we don't call it (which would
    // trigger Next.js's dev overlay).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ActionBar state="foundation" slug="alpha" />)

    const stopButton = await screen.findByRole('button', { name: /stop build/i })
    await user.click(stopButton)
    const confirmButton = screen.getAllByRole('button', { name: /^stop build$/i }).at(-1)!
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/stop failed/i)
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/something went wrong/i)
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('shows a hint when state claims building but buildRunning poll is false', async () => {
    render(<ActionBar state="foundation" slug="alpha" />)
    // Poll returns running:false (default in beforeEach).
    await waitFor(() => {
      expect(
        screen.getByText(/state says building but no process detected/i),
      ).toBeInTheDocument()
    })
  })
})
