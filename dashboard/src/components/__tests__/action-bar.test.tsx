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

describe('ActionBar — mid-phase zombie (state says building, no live PID)', () => {
  // When a mid-phase project has no live rouge-loop (process died, was
  // stopped, or crashed), the bar offers Resume Build + Reset to Ready.
  // The old "Stop Build" that did nothing for foundation-eval / analyzing
  // / vision-check is gone — see build-runner rollback allowlist gap.

  it('renders Resume + Reset when state is mid-phase and no process is alive', async () => {
    render(<ActionBar state="foundation-eval" slug="alpha" buildRunning={false} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^resume build$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^reset to ready$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /^stop build$/i })).not.toBeInTheDocument()
  })

  it('Resume dispatches start with no confirmation dialog', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockResolvedValueOnce({ ok: true, pid: 123 })

    render(<ActionBar state="foundation-eval" slug="alpha" buildRunning={false} />)
    await user.click(await screen.findByRole('button', { name: /^resume build$/i }))

    await waitFor(() => expect(mockSendCommand).toHaveBeenCalledWith('alpha', 'start', undefined))
    // No confirm dialog was shown — Start's dialog copy would be wrong
    // for a resume. The 'resume' alias in execCommand skips confirm.
    expect(screen.queryByRole('heading', { name: /start building/i })).not.toBeInTheDocument()
  })

  it('Reset shows a confirmation dialog and posts to /reset on confirm', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockResolvedValueOnce({ ok: true, priorState: 'foundation-eval' })

    render(<ActionBar state="foundation-eval" slug="alpha" buildRunning={false} />)
    await user.click(await screen.findByRole('button', { name: /^reset to ready$/i }))

    // Dialog renders a second "Reset to Ready" button — click it.
    const buttons = screen.getAllByRole('button', { name: /^reset to ready$/i })
    expect(buttons.length).toBeGreaterThan(1)
    await user.click(buttons.at(-1)!)

    await waitFor(() => expect(mockSendCommand).toHaveBeenCalledWith('alpha', 'reset', undefined))
  })

  it('surfaces a hint explaining the Resume/Reset choice', async () => {
    render(<ActionBar state="foundation-eval" slug="alpha" buildRunning={false} />)
    await waitFor(() => {
      expect(
        screen.getByText(/build stopped at foundation-eval/i),
      ).toBeInTheDocument()
    })
  })

  it('surfaces reset command errors inline', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockRejectedValueOnce(new Error('state locked'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ActionBar state="foundation-eval" slug="alpha" buildRunning={false} />)
    await user.click(await screen.findByRole('button', { name: /^reset to ready$/i }))
    const buttons = screen.getAllByRole('button', { name: /^reset to ready$/i })
    await user.click(buttons.at(-1)!)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/reset failed/i)
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/state locked/i)
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('ActionBar — Stop Build (live process)', () => {
  // When buildRunning is true, Stop is the only action shown. The
  // prop is now a parent-owned snapshot (previously an internal 5 s
  // poll) — tests pass it explicitly.

  it('shows an inline notice when stop succeeds on an already-stopped build', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockResolvedValueOnce({ ok: true, alreadyStopped: true })

    render(<ActionBar state="foundation" slug="alpha" buildRunning={true} buildStartedAt={new Date().toISOString()} />)

    const topStop = await screen.findByRole('button', { name: /^stop build$/i })
    await user.click(topStop)
    const dialogStop = screen.getAllByRole('button', { name: /^stop build$/i }).at(-1)!
    await user.click(dialogStop)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-notice')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-notice')).toHaveTextContent(/already stopped/i)
    expect(screen.queryByTestId('action-bar-error')).not.toBeInTheDocument()
  })

  it('surfaces command errors inline instead of throwing to console.error', async () => {
    const user = userEvent.setup()
    mockSendCommand.mockRejectedValueOnce(new Error('something went wrong'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ActionBar state="foundation" slug="alpha" buildRunning={true} buildStartedAt={new Date().toISOString()} />)

    const topStop = await screen.findByRole('button', { name: /^stop build$/i })
    await user.click(topStop)
    const dialogStop = screen.getAllByRole('button', { name: /^stop build$/i }).at(-1)!
    await user.click(dialogStop)

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/stop failed/i)
    expect(screen.getByTestId('action-bar-error')).toHaveTextContent(/something went wrong/i)
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
