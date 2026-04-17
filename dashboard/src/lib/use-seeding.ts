'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchSeedingMessages, sendSeedMessage, type SeedingChatMessage } from './bridge-client'
import { useBridgeEvents } from './use-bridge-events'

interface UseSeedingResult {
  messages: SeedingChatMessage[]
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
  const [isSending, setIsSending] = useState(false)
  const [sendingStartedAt, setSendingStartedAt] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!slug) return
    try {
      const fetched = await fetchSeedingMessages(slug)
      setMessages(fetched)
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
    setIsSending(true)
    setSendingStartedAt(Date.now())
    setError(null)
    try {
      const result = await sendSeedMessage(slug, text.trim())
      if (!result.ok) {
        if (result.rateLimited) {
          setIsPaused(true)
          setError('Claude is rate-limited. Retry in a few minutes.')
        } else {
          setError(result.error ?? 'Failed to send message')
        }
      } else {
        setIsPaused(false)
      }
      // Refetch messages regardless of outcome
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSending(false)
      setSendingStartedAt(null)
    }
  }, [slug, isSending, refetch])

  return { messages, isSending, sendingStartedAt, isPaused, error, sendMessage, refetch }
}
