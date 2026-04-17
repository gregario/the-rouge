'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import type { ChatMessage as ChatMessageType, SeedingDiscipline } from '@/lib/types'
import { ChatMessage } from '@/components/chat-message'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ArrowRight, Play, Send, ChevronDown, ChevronRight, Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBridgeEnabled } from '@/lib/bridge-client'
import { useSeeding } from '@/lib/use-seeding'

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
      return seeding.messages.map((m) => ({
        id: m.id,
        role: m.role,
        type: m.role === 'human' ? ('answer' as const) : ('question' as const),
        content: m.content,
        timestamp: m.timestamp,
        kind: m.kind,
        markerId: m.metadata?.markerId,
        _discipline: m.metadata?.discipline,
      }))
    }
    // Mock path: use message.discipline if present
    return (propMessages as MessageWithDiscipline[]).map((m) => ({
      ...m,
      _discipline: m.discipline,
    }))
  }, [bridgeActive, seeding.messages, propMessages])

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
  const placeholder = bridgeActive && seeding.isSending ? 'Rouge is thinking…' : 'Reply to Rouge…'

  async function handleSend() {
    const text = inputValue.trim()
    if (!text) return
    if (bridgeActive) {
      await seeding.sendMessage(text)
    }
    setInputValue('')
    textareaRef.current?.focus()
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
      {/* Traffic-light: shows how fresh Rouge's last marker is. Green
          under 45s, amber 45-120s, red 120-180s, stall above that.
          Only shown when we have a heartbeat to track against (i.e.
          after the first [DECISION:] or [HEARTBEAT:] lands). */}
      {bridgeActive && seeding.status?.last_heartbeat_at && (
        <LivenessChip
          lastHeartbeatAt={seeding.status.last_heartbeat_at}
          mode={seeding.status.mode}
        />
      )}

      {/* Message list — grouped by discipline */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="flex flex-col gap-2 p-4">
          {displayMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. The seeding conversation will appear here.
            </p>
          ) : groups.length === 0 ? (
            // Untagged messages — render flat
            displayMessages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
          ) : (
            groups.map((group, idx) => {
              // After a completed discipline, insert a transition banner
              // pointing at the next one in the stream. Gives the
              // "something changed" signal the stepper alone lacks.
              const next = groups[idx + 1]
              const showBanner = group.status === 'complete' && next
              return (
                <div key={group.discipline} className="flex flex-col gap-2">
                  <DisciplineSection
                    group={group}
                    expanded={expanded.has(group.discipline)}
                    onToggle={() => toggleExpanded(group.discipline)}
                  />
                  {showBanner && (
                    <TransitionBanner
                      from={DISCIPLINE_LABELS[group.discipline] ?? group.discipline}
                      to={DISCIPLINE_LABELS[next.discipline] ?? next.discipline}
                    />
                  )}
                </div>
              )
            })
          )}
          {bridgeActive && seeding.isSending && seeding.sendingStartedAt !== null && (
            <ElapsedTimeIndicator
              startedAt={seeding.sendingStartedAt}
              discipline={currentDiscipline}
            />
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      {!disabled && (
        <div className="border-t border-gray-200 p-3">
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

// Traffic-light chip for Rouge's autonomous liveness. Thresholds are
// provisional — we'll calibrate after the first real seedings produce
// typical work-pause durations. Drives off last_heartbeat_at set by
// the bridge on every [DECISION:] / [HEARTBEAT:] marker.
function LivenessChip({
  lastHeartbeatAt,
  mode,
}: {
  lastHeartbeatAt: string
  mode: 'awaiting_gate' | 'running_autonomous'
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Mode=awaiting_gate means Rouge isn't working — it's blocked on the
  // human. Show a distinct "waiting on you" state instead of a fading
  // liveness indicator; the chip would otherwise mislead as "stalled".
  if (mode === 'awaiting_gate') {
    return (
      <div
        data-testid="liveness-chip"
        data-tone="awaiting"
        className="flex items-center gap-2 border-b border-gray-200 bg-blue-50/60 px-4 py-1.5 text-xs text-blue-800"
      >
        <span className="inline-block size-2 rounded-full bg-blue-500" />
        <span className="font-medium">Rouge is waiting on your answer</span>
      </div>
    )
  }

  const ageSec = Math.max(0, Math.floor((now - new Date(lastHeartbeatAt).getTime()) / 1000))
  const { tone, label, dotClass, wrapperClass } = describeLiveness(ageSec)
  return (
    <div
      data-testid="liveness-chip"
      data-tone={tone}
      className={cn(
        'flex items-center gap-2 border-b px-4 py-1.5 text-xs',
        wrapperClass,
      )}
    >
      <span className={cn('inline-block size-2 rounded-full', dotClass)} />
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        last marker {formatDuration(ageSec)} ago
      </span>
    </div>
  )
}

function describeLiveness(ageSec: number): {
  tone: 'green' | 'amber' | 'red' | 'stall'
  label: string
  dotClass: string
  wrapperClass: string
} {
  if (ageSec < 45) {
    return {
      tone: 'green',
      label: 'Working',
      dotClass: 'bg-green-500 animate-pulse',
      wrapperClass: 'border-green-200 bg-green-50/60 text-green-900',
    }
  }
  if (ageSec < 120) {
    return {
      tone: 'amber',
      label: 'Still working',
      dotClass: 'bg-amber-500',
      wrapperClass: 'border-amber-200 bg-amber-50/60 text-amber-900',
    }
  }
  if (ageSec < 180) {
    return {
      tone: 'red',
      label: 'Taking longer than usual',
      dotClass: 'bg-red-500',
      wrapperClass: 'border-red-200 bg-red-50/60 text-red-900',
    }
  }
  return {
    tone: 'stall',
    label: 'Stalled — may need a nudge',
    dotClass: 'bg-gray-600',
    wrapperClass: 'border-gray-300 bg-gray-100 text-gray-800',
  }
}

function TransitionBanner({ from, to }: { from: string; to: string }) {
  return (
    <div
      data-testid="discipline-transition-banner"
      className="flex items-center gap-2 rounded-md border border-dashed border-green-300 bg-green-50/60 px-3 py-1.5 text-xs text-green-900"
    >
      <Check className="size-3.5 text-green-600" />
      <span className="font-medium">{from} complete</span>
      <ArrowRight className="size-3 text-green-600" />
      <span className="text-green-800">now in {to}</span>
    </div>
  )
}

function ElapsedTimeIndicator({
  startedAt,
  discipline,
}: {
  startedAt: number
  discipline?: string
}) {
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000))
  const typical = discipline ? TYPICAL_DURATION_SEC[discipline] : undefined
  const overTypical = typical ? elapsedSec > typical.high : false

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
      <span className="font-medium tabular-nums">Rouge is thinking · {formatDuration(elapsedSec)}</span>
      {typical && (
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
}: {
  group: DisciplineGroup
  expanded: boolean
  onToggle: () => void
}) {
  const statusIcon =
    group.status === 'complete' ? (
      <Check className="size-3.5 text-green-600" />
    ) : group.status === 'current' ? (
      <Circle className="size-3.5 fill-blue-500 text-blue-500" />
    ) : (
      <Circle className="size-3.5 text-gray-400" />
    )

  const label = DISCIPLINE_LABELS[group.discipline] ?? group.discipline

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
        {statusIcon}
        <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">
          {group.messages.length} {group.messages.length === 1 ? 'message' : 'messages'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-4 border-l-2 border-gray-200 pl-4">
          {group.messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  )
}
