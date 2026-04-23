'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import type { Escalation } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Send, Play, Terminal, CheckCircle2, Copy, CheckCheck, XCircle, SkipForward } from 'lucide-react'

const tierLabels: Record<number, string> = {
  0: 'Tier 0 — Auto-recoverable',
  1: 'Tier 1 — Needs guidance',
  2: 'Tier 2 — Blocked',
  3: 'Tier 3 — Critical',
}

const tierColors: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600 border-gray-300',
  1: 'bg-amber-50 text-amber-700 border-amber-300',
  2: 'bg-orange-50 text-orange-700 border-orange-300',
  3: 'bg-red-50 text-red-700 border-red-300',
}

interface ChatEntry {
  id: string
  text: string
  timestamp: string
}

// Response types. Matches the server's VALID_RESPONSE_TYPES in
// resolve-escalation/route.ts and the launcher's rouge-loop.js.
type ResponseType =
  | 'guidance'
  | 'manual-fix-applied'
  | 'dismiss-false-positive'
  | 'abort-story'
  | 'hand-off'
  | 'resume-after-handoff'

/**
 * Escalation response panel.
 *
 * Previous implementation was broken twice over: `send()` called
 * `sendCommand(slug, 'feedback')` which goes to the legacy bridge
 * client and never persists to `state.json.escalations[].human_response`,
 * and the "Respond & Resume" button had no onClick handler at all.
 * Both mean that when Rouge raised a real escalation, the user could
 * type a response and click Send and nothing would actually happen.
 *
 * Now: Send posts to `/api/projects/[name]/resolve-escalation` which
 * writes `human_response` onto the escalation in state.json and flips
 * `current_state` back to the paused-from state. After a successful
 * response, the parent page refetches and the escalation card
 * disappears.
 */
export function EscalationResponse({
  escalation,
  slug,
  onResolved,
}: {
  escalation: Escalation
  slug?: string
  /** Called after the server confirms resolution, so the parent can
   *  refetch project state and clear the escalation from view. */
  onResolved?: () => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [sending, setSending] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [handingOff, setHandingOff] = useState(false)
  const [showHandOff, setShowHandOff] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Action-label state for post-submit feedback. Previously the user
  // clicked Send, the message bubble appeared, and nothing else changed
  // — no sign that the server took it, that the loop resumed, or that
  // anything was in flight. Now each button surfaces its own action
  // phase (sending → delivered) and the parent's refetch clears the
  // card. See 2026-04-23 UAT notes.
  const [lastAction, setLastAction] = useState<null | 'guidance' | 'dismiss' | 'manual-fix' | 'abort' | 'handoff'>(null)

  // Escalation may have been handed off in a prior session. Backend
  // sets `handoff_started_at` on the escalation when `hand-off`
  // resolves; when present, flip the UI to "I've resolved it" mode.
  const isHandedOff = Boolean((escalation as { handoff_started_at?: string }).handoff_started_at)

  const submitResponse = useCallback(
    async (text: string, resumeAfter: boolean, responseType: ResponseType = 'guidance'): Promise<boolean> => {
      if (!slug) return false
      setError(null)
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/resolve-escalation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            escalation_id: escalation.id,
            response_type: responseType,
            text,
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          // A 404 "No pending escalation found" means the escalation
          // has already been resolved server-side — commonly the loop
          // processed a prior resolution and the dashboard's cached
          // state lagged behind. Treat as "stale view, refresh" rather
          // than an error the user needs to act on. The parent's
          // onResolved refetch clears the stale card.
          if (res.status === 404 && /no pending escalation/i.test(body.error ?? '')) {
            onResolved?.()
            return true
          }
          setError(body.error ?? `HTTP ${res.status}`)
          return false
        }
        if (resumeAfter) {
          onResolved?.()
        }
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    [slug, escalation.id, onResolved],
  )

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      { id: `resp-${Date.now()}`, text, timestamp: new Date().toISOString() },
    ])
    setInputValue('')

    if (!slug) return
    // Send posts guidance AND asks the server to resume — same as
    // "Respond & Resume". Previously Send persisted the guidance and
    // auto-started the loop server-side but didn't tell the UI, so
    // the card stayed on screen and the user could only tell their
    // message had gone through by refreshing. Unify them: there's no
    // meaningful server-side distinction between Send and Resume, so
    // the UI shouldn't pretend there is.
    setSending(true)
    setLastAction('guidance')
    void submitResponse(text, true, 'guidance').finally(() => setSending(false))
  }, [inputValue, slug, submitResponse])

  const handleResume = useCallback(() => {
    // Resume combines whatever's in the input (or the last message if
    // input is empty) with a resolution signal. If the user has typed
    // nothing and sent nothing, the resume still posts so the
    // escalation is closed with an empty guidance response — useful
    // for "I applied a manual fix, keep going".
    const typed = inputValue.trim()
    const fallback = messages.length > 0 ? messages[messages.length - 1].text : ''
    const text = typed || fallback
    if (typed) {
      setMessages((prev) => [
        ...prev,
        { id: `resp-${Date.now()}`, text: typed, timestamp: new Date().toISOString() },
      ])
      setInputValue('')
    }
    setResuming(true)
    void submitResponse(text, true, 'guidance').finally(() => setResuming(false))
  }, [inputValue, messages, submitResponse])

  const handleHandOff = useCallback(() => {
    // User is going to work the problem in a direct Claude Code
    // session. Park the project via `hand-off` response type; the
    // launcher keeps the escalation pending until the user returns
    // and clicks "I've resolved it". Dashboard stays open; parent
    // doesn't refetch away.
    if (!slug) return
    setHandingOff(true)
    void submitResponse('', false, 'hand-off').finally(() => setHandingOff(false))
    setShowHandOff(true)
  }, [slug, submitResponse])

  const handleResolved = useCallback(() => {
    // User finished their hand-off session. Launcher will capture
    // git commits since handoff_started_at and inject them as
    // human_resolution into the next phase's preamble.
    const note = inputValue.trim()
    setResuming(true)
    void submitResponse(note, true, 'resume-after-handoff').finally(() => setResuming(false))
  }, [inputValue, submitResponse])

  // Explicit response-type handlers. Before this, the textarea was the
  // only input path and every submission was forced to response_type:
  // 'guidance' — typing the literal string "dismiss-false-positive"
  // looked like it ought to work but was in fact sent as guidance text.
  // Each of these short-circuits to the correct response_type and
  // resumes the loop.
  const handleDismiss = useCallback(() => {
    setResuming(true)
    setLastAction('dismiss')
    void submitResponse(inputValue.trim(), true, 'dismiss-false-positive').finally(() => setResuming(false))
  }, [inputValue, submitResponse])

  const handleManualFix = useCallback(() => {
    setResuming(true)
    setLastAction('manual-fix')
    void submitResponse(inputValue.trim(), true, 'manual-fix-applied').finally(() => setResuming(false))
  }, [inputValue, submitResponse])

  const handleAbort = useCallback(() => {
    setResuming(true)
    setLastAction('abort')
    void submitResponse(inputValue.trim(), true, 'abort-story').finally(() => setResuming(false))
  }, [inputValue, submitResponse])

  const handoffCommand = slug ? `rouge resume-escalation ${slug}` : ''
  const handleCopy = useCallback(() => {
    if (!handoffCommand) return
    navigator.clipboard?.writeText(handoffCommand).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* clipboard unavailable */ })
  }, [handoffCommand])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const inFlight = sending || resuming
  const canResume = messages.length > 0 || inputValue.trim().length > 0

  return (
    <Card className="border-2 border-amber-300 bg-amber-50/50 shadow-sm" data-testid="escalation-response-card">
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900">Escalation</h3>
              <Badge
                variant="outline"
                className={tierColors[escalation.tier] ?? tierColors[1]}
              >
                {tierLabels[escalation.tier] ?? `Tier ${escalation.tier}`}
              </Badge>
            </div>
            <p className="text-sm text-gray-600">{escalation.reason}</p>
          </div>
        </div>

        <div className="border-t border-amber-200 pt-4">
          {/* Chat-like message history */}
          {messages.length > 0 && (
            <div className="mb-4 flex flex-col gap-2" data-testid="escalation-chat-history">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="ml-auto max-w-[80%] rounded-lg bg-blue-50 border border-blue-200 px-3 py-2"
                  data-testid="escalation-chat-message"
                >
                  <p className="text-sm text-gray-900">{msg.text}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div
              className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800"
              data-testid="escalation-error"
            >
              {error}
            </div>
          )}

          {/* Hand-off in progress — show "I've resolved it" flow
              instead of the regular guidance form. User ran
              `rouge resume-escalation <slug>` (or is about to) and
              will finish the work in their terminal. When done,
              they come back here and click the button. Launcher
              captures git commits and resumes. */}
          {(isHandedOff || showHandOff) ? (
            <div className="space-y-3" data-testid="escalation-handoff-active">
              <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
                <p className="font-medium mb-1 flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Handed off — resolve in your terminal
                </p>
                <p className="text-blue-900/80 mb-2">
                  Run this in your terminal to open a Claude Code session primed with the escalation context:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-blue-100 px-2 py-1 font-mono text-[11px] text-blue-900">
                    {handoffCommand}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={handleCopy}
                    data-testid="escalation-copy-handoff"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 text-blue-900/70">
                  Work through the problem with Claude in that session. When you&rsquo;re done, make a commit so the resolution lands on the branch, then come back here and click <strong>I&rsquo;ve resolved it</strong>.
                </p>
              </div>

              <label className="text-xs font-medium text-gray-500 block">
                Note for Rouge when it resumes (optional)
              </label>
              <Textarea
                placeholder="What did you change? Any context Rouge should know as it continues?"
                className="min-h-[3rem] resize-none bg-white"
                rows={2}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={inFlight}
                data-testid="escalation-handoff-note"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleResolved}
                  disabled={inFlight}
                  data-testid="escalation-resolved-button"
                >
                  <CheckCircle2 className="size-3.5" />
                  {resuming ? 'Resuming…' : "I've resolved it"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="text-xs font-medium text-gray-500 mb-2 block">
                Your message (plain text — Rouge reads this as guidance for the next attempt)
              </label>
              <Textarea
                placeholder="Describe what you want Rouge to try next, or leave blank and pick a resolution below. (Enter to send, Shift+Enter for newline)"
                className="min-h-[4rem] resize-none bg-white"
                rows={3}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={inFlight}
                data-testid="escalation-response-input"
              />

              {/* Quick-resolution row. These are the explicit response_type
                  values the launcher understands. Each optionally includes
                  whatever note you typed above. Prior UI only exposed
                  'guidance' via the textarea — typing the literal string
                  "dismiss-false-positive" sent it as guidance text and did
                  nothing useful. */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleDismiss}
                  disabled={inFlight || !slug}
                  title="Mark this escalation as a false alarm and keep going"
                  data-testid="escalation-dismiss-button"
                >
                  <CheckCheck className="size-3.5" />
                  {lastAction === 'dismiss' && resuming ? 'Dismissing…' : 'Dismiss as false positive'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleManualFix}
                  disabled={inFlight || !slug}
                  title="You fixed the underlying issue outside Rouge; resume where it left off"
                  data-testid="escalation-manual-fix-button"
                >
                  <CheckCircle2 className="size-3.5" />
                  {lastAction === 'manual-fix' && resuming ? 'Marking resolved…' : 'I fixed it manually'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                  onClick={handleAbort}
                  disabled={inFlight || !slug}
                  title="Give up on this story and move to the next one"
                  data-testid="escalation-abort-button"
                >
                  <SkipForward className="size-3.5" />
                  {lastAction === 'abort' && resuming ? 'Aborting…' : 'Abort this story'}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-amber-200 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleHandOff}
                  disabled={inFlight || !slug}
                  title="Park the project and work through the problem in a direct Claude Code session"
                  data-testid="escalation-handoff-button"
                >
                  <Terminal className="size-3.5" />
                  {handingOff ? 'Handing off…' : 'Hand off to Claude Code'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || inFlight}
                  data-testid="escalation-send-button"
                >
                  <Send className="size-3.5" />
                  {sending ? 'Sending…' : 'Send'}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleResume}
                  disabled={!canResume || inFlight}
                  data-testid="escalation-resume-button"
                >
                  <Play className="size-3.5" />
                  {resuming ? 'Resuming…' : 'Respond & Resume'}
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
