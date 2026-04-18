'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchSeedingMessages, fetchSeedingStatus, sendSeedMessage, type SeedingChatMessage, type SeedingLivenessStatus } from './bridge-client'
import { useBridgeEvents } from './use-bridge-events'

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

  // Initial load
  useEffect(() => {
    refetch()
  }, [refetch])

  // Live updates — any bridge event for this project triggers a refetch
  useBridgeEvents(() => refetch(), slug)

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

  return { messages, status, isSending, sendingStartedAt, pendingUserMessage, pendingUserMessageErrored, isPaused, error, sendMessage, refetch }
}
