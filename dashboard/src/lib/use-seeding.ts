'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchSeedingMessages, fetchSeedingStatus, sendSeedMessage, type SeedingChatMessage, type SeedingLivenessStatus } from './bridge-client'

// Phase 2 of the seed-loop architecture plan (see
// docs/plans/2026-04-19-seed-loop-architecture.md). This hook polls
// the server state every POLL_INTERVAL_MS while seeding is active
// instead of relying on SSE events. Event-driven live updates for
// seeding proved too fragile — every watcher/filter gap produced a
// "Rouge replied but the UI is stuck" symptom. Polling is simpler
// and strictly more reliable; the cost is ~1 GET every 2s per open
// seeding page, which is trivial next to the ~30s–10min daemon
// turns it tracks.
const POLL_INTERVAL_MS = 2000

// How recently must a heartbeat have fired for the daemon to be
// considered actively ticking? Above this, treat as stale.
const HEARTBEAT_FRESHNESS_MS = 30_000

export type DaemonLiveness =
  /** Daemon not running, no session state on disk, or seeding complete. */
  | 'idle'
  /** Daemon reports it's actively processing a user message. */
  | 'processing'
  /** Daemon exists but hasn't ticked within HEARTBEAT_FRESHNESS_MS — the
   *  user should see this as a warning (Rouge may have crashed or hung). */
  | 'stalled'
  /** Daemon is alive but between turns — waiting on either the user
   *  (awaiting_gate) or the queue. */
  | 'waiting'

interface UseSeedingResult {
  messages: SeedingChatMessage[]
  /** Optimistic pending human message — added immediately when the user
   *  hits send, cleared when refetch pulls in the authoritative log.
   *  null when no send is in flight. The UI merges this into the
   *  displayed conversation so the send doesn't look like it stalled. */
  pendingUserMessage: string | null
  /** True when the in-flight send errored — the UI should render the
   *  pending message with an error mark rather than as "sending…". */
  pendingUserMessageErrored: boolean
  /** Liveness snapshot (mode, pending_gate, last_heartbeat_at). Null
   *  until the first fetch completes. Drives the traffic-light chip
   *  and awaiting-gate affordances in the UI. */
  status: SeedingLivenessStatus | null
  isSending: boolean
  /** Wall-clock timestamp (ms) when the current send started, or null
   * when no send is in flight. Lets the UI render an elapsed-time signal
   * during the long agent turns. */
  sendingStartedAt: number | null
  isPaused: boolean
  error: string | null
  /** Derived daemon liveness. Drives the "Rouge working / waiting /
   *  stalled / idle" chip the user sees while a turn is in flight. */
  daemonLiveness: DaemonLiveness
  /** Age of the last daemon heartbeat in ms (or null if never). Used
   *  by the UI to render "last tick Xs ago" text. */
  heartbeatAgeMs: number | null
  sendMessage: (text: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useSeeding(slug: string): UseSeedingResult {
  const [messages, setMessages] = useState<SeedingChatMessage[]>([])
  const [status, setStatus] = useState<SeedingLivenessStatus | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendingStartedAt, setSendingStartedAt] = useState<number | null>(null)
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  const [pendingUserMessageErrored, setPendingUserMessageErrored] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!slug) return
    try {
      // Fire both in parallel — one Claude turn can mutate both, and
      // polling them sequentially would make the chip lag the chat.
      const [fetched, st] = await Promise.all([
        fetchSeedingMessages(slug),
        fetchSeedingStatus(slug).catch(() => null),
      ])
      setMessages(fetched)
      if (st) setStatus(st)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [slug])

  // Initial load + polling. Phase 2: no SSE event dependency here —
  // poll every POLL_INTERVAL_MS as long as the session isn't
  // complete. This is the direct answer to the "Rouge replied but
  // the UI is stuck" class of bug: we fetch the authoritative state
  // on a regular cadence instead of relying on event emission
  // landing through the SSE bus.
  //
  // We keep polling even after `status === 'complete'` for one more
  // tick so the UI picks up the final state transition, then stop.
  // Polls pause when the document is hidden so background tabs
  // don't burn requests; resume on visibilitychange.
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') return
      await refetch()
    }

    // Fire immediately, then at interval.
    void tick()
    timer = setInterval(tick, POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      // When the tab becomes visible again, fetch once so the UI
      // catches up without waiting for the next tick boundary.
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [slug, refetch])

  const sendMessage = useCallback(async (text: string) => {
    if (!slug || !text.trim() || isSending) return
    const trimmed = text.trim()
    setIsSending(true)
    setSendingStartedAt(Date.now())
    setError(null)
    // Optimistic: show the message in chat immediately instead of
    // freezing the input with the user's text still sitting in it. The
    // real message lands in the authoritative log on refetch below.
    setPendingUserMessage(trimmed)
    setPendingUserMessageErrored(false)
    try {
      const result = await sendSeedMessage(slug, trimmed)
      if (!result.ok) {
        if (result.rateLimited) {
          setIsPaused(true)
          setError('Claude is rate-limited. Retry in a few minutes.')
        } else {
          setError(result.error ?? 'Failed to send message')
        }
        setPendingUserMessageErrored(true)
      } else {
        setIsPaused(false)
      }
      // Refetch messages regardless of outcome — the bridge persists
      // the human message to disk even when Claude fails, so refetch
      // brings it into the authoritative list and we can drop the
      // optimistic placeholder. On a hard failure we keep the placeholder
      // with an error mark (set above).
      await refetch()
      if (result.ok) {
        setPendingUserMessage(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPendingUserMessageErrored(true)
    } finally {
      setIsSending(false)
      setSendingStartedAt(null)
    }
  }, [slug, isSending, refetch])

  // Derived daemon-liveness + heartbeat-age for the UI chip.
  const now = Date.now()
  const heartbeatAgeMs = useMemo(() => {
    const ts = status?.daemon?.lastTickAt
    if (!ts) return null
    const parsed = Date.parse(ts)
    if (isNaN(parsed)) return null
    return Math.max(0, now - parsed)
  }, [status?.daemon?.lastTickAt, now])

  const daemonLiveness: DaemonLiveness = useMemo(() => {
    if (!status) return 'idle'
    if (status.status === 'complete') return 'idle'
    const d = status.daemon
    if (!d) return 'idle'
    if (!d.alive) return 'idle'
    if (heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_FRESHNESS_MS) {
      return 'stalled'
    }
    if (d.activity === 'processing') return 'processing'
    return 'waiting'
  }, [status, heartbeatAgeMs])

  return {
    messages,
    status,
    isSending,
    sendingStartedAt,
    pendingUserMessage,
    pendingUserMessageErrored,
    isPaused,
    error,
    daemonLiveness,
    heartbeatAgeMs,
    sendMessage,
    refetch,
  }
}
