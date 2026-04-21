'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import type { ChatMessage as ChatMessageType, SeedingDiscipline } from '@/lib/types'
import { ChatMessage } from '@/components/chat-message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Play, Send, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBridgeEnabled } from '@/lib/bridge-client'
import { useSeeding } from '@/lib/use-seeding'
import { SeedingProgressIndicator } from '@/components/seeding-progress-indicator'

// Rough per-discipline expected durations for an agent turn, derived
// from observed runs. Used to give the elapsed-time display a baseline
// so "2 minutes" means "on track for spec" rather than "alarming".
// Tune as we collect more data.
const TYPICAL_DURATION_SEC: Record<string, { low: number; high: number }> = {
  brainstorming: { low: 60, high: 180 },
  competition: { low: 90, high: 240 },
  taste: { low: 60, high: 150 },
  spec: { low: 180, high: 480 },
  infrastructure: { low: 60, high: 180 },
  design: { low: 240, high: 600 },
  'legal-privacy': { low: 60, high: 180 },
  marketing: { low: 120, high: 300 },
}

interface ChatPanelProps {
  messages: ChatMessageType[]
  isPaused?: boolean
  disabled?: boolean
  slug?: string
  completedDisciplines?: string[]
  currentDiscipline?: string
  selectedDiscipline?: string
}

// Canonical discipline sequence — messages without metadata default to this order
const DISCIPLINE_SEQUENCE = [
  'brainstorming', 'competition', 'taste', 'spec',
  'infrastructure', 'design', 'legal-privacy', 'marketing',
] as const

const DISCIPLINE_LABELS: Record<string, string> = {
  brainstorming: 'Brainstorming',
  competition: 'Competition',
  taste: 'Taste',
  spec: 'Spec',
  infrastructure: 'Infrastructure',
  design: 'Design',
  'legal-privacy': 'Legal & Privacy',
  marketing: 'Marketing',
}

type MessageWithDiscipline = ChatMessageType & { _discipline?: string }

interface DisciplineGroup {
  discipline: string
  messages: MessageWithDiscipline[]
  status: 'complete' | 'current' | 'pending'
}

export function ChatPanel({
  messages: propMessages,
  isPaused = false,
  disabled = false,
  slug,
  completedDisciplines,
  currentDiscipline,
  selectedDiscipline,
}: ChatPanelProps) {
  const bridgeActive = isBridgeEnabled() && !!slug
  const seeding = useSeeding(bridgeActive ? slug : '')
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Build display messages with discipline tags
  const displayMessages: MessageWithDiscipline[] = useMemo(() => {
    if (bridgeActive) {
      const base: MessageWithDiscipline[] = seeding.messages.map((m) => ({
        id: m.id,
        role: m.role,
        type: m.role === 'human' ? ('answer' as const) : ('question' as const),
        content: m.content,
        timestamp: m.timestamp,
        kind: m.kind,
        markerId: m.metadata?.markerId,
        _discipline: m.metadata?.discipline,
      }))
      // Optimistic pending human message: append at the end so the
      // user sees their send land in chat immediately instead of
      // watching the input grey out with their text still in it.
      if (seeding.pendingUserMessage) {
        base.push({
          id: 'pending-user',
          role: 'human',
          type: 'answer',
          content: seeding.pendingUserMessage,
          timestamp: new Date().toISOString(),
          _discipline: currentDiscipline,
          isPending: true,
          pendingErrored: seeding.pendingUserMessageErrored,
        })
      }
      return base
    }
    // Mock path: use message.discipline if present
    return (propMessages as MessageWithDiscipline[]).map((m) => ({
      ...m,
      _discipline: m.discipline,
    }))
  }, [
    bridgeActive,
    seeding.messages,
    seeding.pendingUserMessage,
    seeding.pendingUserMessageErrored,
    currentDiscipline,
    propMessages,
  ])

  // Group messages by discipline
  const groups: DisciplineGroup[] = useMemo(() => {
    const complete = new Set(completedDisciplines ?? [])
    const messagesByDiscipline = new Map<string, MessageWithDiscipline[]>()
    for (const msg of displayMessages) {
      const d = msg._discipline ?? 'brainstorming'
      if (!messagesByDiscipline.has(d)) messagesByDiscipline.set(d, [])
      messagesByDiscipline.get(d)!.push(msg)
    }

    // Only include disciplines that have messages
    const result: DisciplineGroup[] = []
    for (const d of DISCIPLINE_SEQUENCE) {
      const msgs = messagesByDiscipline.get(d)
      if (!msgs || msgs.length === 0) continue
      const status = complete.has(d) ? 'complete' : d === currentDiscipline ? 'current' : 'pending'
      result.push({ discipline: d, messages: msgs, status })
    }
    return result
  }, [displayMessages, completedDisciplines, currentDiscipline])

  // Auto-expand logic:
  // - If currentDiscipline is provided: expand that one
  // - If no currentDiscipline but groups exist: expand all (mock path / static data)
  useEffect(() => {
    const initial = new Set<string>()
    if (currentDiscipline) {
      initial.add(currentDiscipline)
      // Also expand the last group if it's different (most recent activity)
      if (groups.length > 0) initial.add(groups[groups.length - 1].discipline)
    } else {
      // No active discipline tracked — expand everything
      for (const g of groups) initial.add(g.discipline)
    }
    setExpanded((prev) => {
      // Merge: keep prior manual toggles but ensure current is expanded
      const merged = new Set(prev)
      for (const d of initial) merged.add(d)
      return merged
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiscipline, groups.length])

  // Auto-collapse disciplines when they flip to 'complete'. Keeps the
  // chat focused on the current discipline instead of accumulating an
  // ever-growing column of completed work. User's explicitly selected
  // discipline stays expanded so they can still read through it.
  const prevCompletedRef = useRef<Set<string>>(new Set(completedDisciplines ?? []))
  useEffect(() => {
    const now = new Set(completedDisciplines ?? [])
    const newlyComplete: string[] = []
    for (const d of now) {
      if (!prevCompletedRef.current.has(d)) newlyComplete.push(d)
    }
    if (newlyComplete.length > 0) {
      setExpanded((current) => {
        const next = new Set(current)
        for (const d of newlyComplete) {
          if (d !== selectedDiscipline) next.delete(d)
        }
        return next
      })
    }
    prevCompletedRef.current = now
  }, [completedDisciplines, selectedDiscipline])

  // When user clicks a discipline in the stepper (selectedDiscipline changes),
  // expand that group and scroll to it.
  useEffect(() => {
    if (!selectedDiscipline) return
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(selectedDiscipline)
      return next
    })
    // Scroll to the section — give the DOM a tick to apply the expand
    setTimeout(() => {
      const el = document.getElementById(`discipline-${selectedDiscipline}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [selectedDiscipline])

  function toggleExpanded(discipline: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(discipline)) next.delete(discipline)
      else next.add(discipline)
      return next
    })
  }

  const inputDisabled = disabled || (bridgeActive && seeding.isSending)
  // The last-message id drives resume_prompt button staleness: only the
  // tail message's button is actionable. Anything older has been
  // superseded (user answered, Claude responded, next chunk ran, etc.)
  // and should render inert so clicking it can't fire a rogue "continue"
  // into a now-irrelevant context.
  const lastMessageId =
    displayMessages.length > 0 ? displayMessages[displayMessages.length - 1].id : null
  // First-turn placeholder: the user isn't replying to anything yet —
  // they're telling Rouge what to build. Different placeholder frames
  // this as an opening, not a reply to silence.
  //
  // Sending-state placeholder is intentionally blank — the bar above
  // (ElapsedTimeIndicator) already says "Rouge is thinking"; duplicating
  // it here just to fill the input was noise.
  const isFirstTurn = displayMessages.length === 0
  const placeholder =
    bridgeActive && seeding.isSending
      ? ''
      : isFirstTurn
        ? 'Describe what you want to build…'
        : 'Reply to Rouge…'

  async function handleSend() {
    const text = inputValue.trim()
    if (!text) return
    // Clear the input BEFORE the await so the user doesn't watch their
    // text sit greyed-out for 30s — the optimistic pending message in
    // seeding.messages takes over the visual feedback.
    setInputValue('')
    textareaRef.current?.focus()
    if (bridgeActive) {
      await seeding.sendMessage(text)
    }
  }

  // Callback for the Continue button on resume_prompt messages. Routes
  // through the same sendMessage path as typed input so the chain
  // resumes with a fresh auto-continuation budget.
  async function handleResume() {
    if (!bridgeActive || seeding.isSending) return
    await seeding.sendMessage('continue')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="flex h-full flex-col rounded-lg border border-gray-200 bg-white"
      data-testid="chat-panel"
    >
      {/* Top chip removed — the liveness bar above the input box
          (ElapsedTimeIndicator) carries all the "Rouge is thinking"
          signal. Two places saying the same thing was redundant. */}

      {/* Message list — grouped by discipline */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="flex flex-col gap-2 p-4">
          {displayMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. The seeding conversation will appear here.
            </p>
          ) : groups.length === 0 ? (
            // Untagged messages — render flat
            displayMessages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                // Resume button is only live on the last message — a
                // resume_prompt buried in history is stale (the user
                // either resumed it manually or Rouge has since moved
                // on). Non-last resume_prompts render with a disabled
                // button.
                onResume={msg.id === lastMessageId ? handleResume : undefined}
                resumeDisabled={bridgeActive && seeding.isSending}
              />
            ))
          ) : (
            groups.map((group) => (
              // Transition banners between completed sections were
              // removed — the "Complete" pill in the section header
              // plus the left-sidebar stepper already convey handoff.
              // Stacking both produced ladders of green between every
              // completed discipline. See feedback from 2026-04-17 PR
              // #164 dogfood.
              <DisciplineSection
                key={group.discipline}
                group={group}
                expanded={expanded.has(group.discipline)}
                onToggle={() => toggleExpanded(group.discipline)}
                onResume={handleResume}
                resumeDisabled={bridgeActive && seeding.isSending}
                lastMessageId={lastMessageId}
              />
            ))
          )}
          {/*
            Activity indicator — shows for the WHOLE time Rouge is
            working, not just during the HTTP send. Before Phase 2:
            isSending flipped back to false ~50ms after the POST
            returned 202, so this bar vanished while the daemon was
            still running and the user had no signal anything was
            alive. Now we show it while either:
              - The client is mid-send (local optimistic state), OR
              - The daemon reports activity === 'processing'.
            If we have a local start timestamp we use it; otherwise
            the component degrades to "Rouge is thinking" without a
            timer (daemon restart loses the clock).
          */}
          {bridgeActive &&
            (seeding.isSending || seeding.daemonLiveness === 'processing') && (
              <ElapsedTimeIndicator
                startedAt={seeding.sendingStartedAt}
                discipline={currentDiscipline}
              />
            )}
          {bridgeActive && seeding.daemonLiveness === 'stalled' && (
            <div
              className="mx-4 my-2 rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-xs text-yellow-900"
              data-testid="daemon-stalled-warning"
            >
              ⚠ Rouge hasn't ticked in{' '}
              {seeding.heartbeatAgeMs !== null
                ? `${Math.round(seeding.heartbeatAgeMs / 1000)}s`
                : 'a while'}
              . The seeding daemon may have stalled or crashed. Send another
              message to respawn.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      {!disabled && (
        <div className="border-t border-gray-200 p-3">
          {bridgeActive && (
            <SeedingProgressIndicator
              messages={seeding.messages}
              currentDiscipline={currentDiscipline}
              isActive={seeding.isSending}
            />
          )}
          {bridgeActive && seeding.error && (
            <div className="mx-3 mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              {seeding.error}
            </div>
          )}
          {isPaused && (
            <Button
              className="mb-3 w-full gap-1.5 bg-purple-600 text-white hover:bg-purple-700"
              data-testid="resume-button"
            >
              <Play className="size-3.5" />
              Resume Seeding
            </Button>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={placeholder}
              className="min-h-[4rem] resize-none"
              rows={3}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputDisabled}
              data-testid="chat-input"
            />
            <Button
              size="sm"
              className="mt-auto shrink-0 gap-1.5"
              onClick={handleSend}
              disabled={inputDisabled || !inputValue.trim()}
              data-testid="send-button"
            >
              <Send className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      )}

      {disabled && (
        <div className="border-t border-gray-200 p-3">
          <p className="text-center text-xs text-muted-foreground">
            Viewing completed discipline — select the current discipline to interact.
          </p>
        </div>
      )}
    </div>
  )
}


function ElapsedTimeIndicator({
  startedAt,
  discipline,
}: {
  /** null when the turn was picked up by the daemon across a page
   *  reload or dashboard restart — we don't have a local start
   *  timestamp in that case, so the indicator degrades to "Rouge is
   *  thinking" without a timer. */
  startedAt: number | null
  discipline?: string
}) {
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = startedAt === null ? null : Math.max(0, Math.floor((now - startedAt) / 1000))
  const typical = discipline ? TYPICAL_DURATION_SEC[discipline] : undefined
  const overTypical = typical && elapsedSec !== null ? elapsedSec > typical.high : false

  return (
    <div
      data-testid="elapsed-time-indicator"
      className={cn(
        'mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
        overTypical
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-blue-200 bg-blue-50 text-blue-900',
      )}
    >
      <Loader2 className="size-3.5 animate-spin" />
      <span className="font-medium tabular-nums">
        {elapsedSec !== null
          ? `Rouge is thinking · ${formatDuration(elapsedSec)}`
          : 'Rouge is thinking'}
      </span>
      {typical && elapsedSec !== null && (
        <span className="text-muted-foreground">
          · typical for {discipline}: {formatDuration(typical.low)}–{formatDuration(typical.high)}
        </span>
      )}
      {overTypical && (
        <span className="ml-auto font-medium">longer than usual — still working</span>
      )}
    </div>
  )
}

function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (sec === 0) return `${min}m`
  return `${min}m ${sec}s`
}

function DisciplineSection({
  group,
  expanded,
  onToggle,
  onResume,
  resumeDisabled,
  lastMessageId,
}: {
  group: DisciplineGroup
  expanded: boolean
  onToggle: () => void
  onResume?: () => void
  resumeDisabled?: boolean
  lastMessageId?: string | null
}) {
  const label = DISCIPLINE_LABELS[group.discipline] ?? group.discipline

  // Status rendering as a pill next to the discipline name — replaces
  // the icon-only status indicator. The pill is self-explanatory and
  // removes the need for separate transition banners between sections.
  const statusPill =
    group.status === 'complete' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        <Check className="size-3" />
        Complete
      </span>
    ) : group.status === 'current' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
        <span className="size-1.5 rounded-full bg-blue-500" />
        Active
      </span>
    ) : null

  return (
    <div id={`discipline-${group.discipline}`} className="scroll-mt-2">
      <button
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100',
          group.status === 'current' && 'border-blue-200 bg-blue-50 hover:bg-blue-100',
          group.status === 'complete' && 'border-green-200'
        )}
        data-testid={`discipline-section-${group.discipline}`}
      >
        {expanded ? (
          <ChevronDown className="size-4 text-gray-500" />
        ) : (
          <ChevronRight className="size-4 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {statusPill}
        <span className="ml-auto text-xs text-gray-500">
          {group.messages.length} {group.messages.length === 1 ? 'message' : 'messages'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-4 border-l-2 border-gray-200 pl-4">
          {group.messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onResume={msg.id === lastMessageId ? onResume : undefined}
              resumeDisabled={resumeDisabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}
