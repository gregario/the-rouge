'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronRight, HelpCircle, CircleDot, Activity, Info, Play, FileCheck2 } from 'lucide-react'

// Markdown renderer with tight spacing matched to the chat panel's style
function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-foreground',
        '[&_p]:mb-3 [&_p:last-child]:mb-0',
        '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold',
        '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-bold',
        '[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mb-1',
        '[&_strong]:font-semibold',
        '[&_em]:italic',
        '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:text-xs',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_hr]:my-4 [&_hr]:border-gray-200',
        '[&_a]:text-blue-600 [&_a]:underline',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

const DISCIPLINE_COLORS: Record<string, string> = {
  brainstorming: 'bg-violet-50 text-violet-700 border-violet-300',
  competition: 'bg-blue-50 text-blue-700 border-blue-300',
  taste: 'bg-amber-50 text-amber-700 border-amber-300',
  spec: 'bg-cyan-50 text-cyan-700 border-cyan-300',
  infrastructure: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  design: 'bg-pink-50 text-pink-700 border-pink-300',
  'legal-privacy': 'bg-red-50 text-red-700 border-red-300',
  marketing: 'bg-orange-50 text-orange-700 border-orange-300',
}

interface ChatMessageProps {
  message: ChatMessageType
  /** Called when a `resume_prompt` message's Continue button is clicked.
   *  Plumbed through from ChatPanel so the nudge uses the same
   *  sendMessage path as typing into the input. */
  onResume?: () => void
  /** True while a send is in flight — disables the Continue button on
   *  resume prompts so it doesn't fire twice. */
  resumeDisabled?: boolean
}

export function ChatMessage({ message, onResume, resumeDisabled }: ChatMessageProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false)

  // Human messages
  if (message.role === 'human') {
    const pending = message.isPending
    const errored = message.pendingErrored
    return (
      <div className="flex flex-col items-end gap-1" data-testid="chat-message" data-role="human">
        <div
          className={cn(
            'max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap',
            errored
              ? 'bg-red-50 text-red-900 border border-red-200'
              : pending
                ? 'bg-primary/10 text-foreground/80'
                : 'bg-primary/15 text-foreground',
          )}
        >
          {message.content}
        </div>
        {pending && !errored && (
          <span className="text-[10px] text-muted-foreground italic">sending…</span>
        )}
        {errored && (
          <span className="text-[10px] text-red-600">send failed — retry by editing the last response</span>
        )}
      </div>
    )
  }

  // Gated-autonomy kinds — render distinctly so decisions don't blend
  // into prose and gates visually demand an answer.
  if (message.kind === 'gate_question') {
    return (
      <GateQuestionMessage message={message} />
    )
  }
  if (message.kind === 'autonomous_decision') {
    return (
      <AutonomousDecisionMessage message={message} />
    )
  }
  if (message.kind === 'heartbeat') {
    return (
      <HeartbeatMessage message={message} />
    )
  }
  if (message.kind === 'system_note') {
    return (
      <SystemNoteMessage message={message} />
    )
  }
  if (message.kind === 'resume_prompt') {
    return (
      <ResumePromptMessage
        message={message}
        onResume={onResume}
        disabled={resumeDisabled}
      />
    )
  }
  if (message.kind === 'wrote_artifact') {
    return (
      <WroteArtifactMessage message={message} />
    )
  }

  // Transition / summary messages (info-style)
  if (message.type === 'transition' || message.type === 'summary') {
    return (
      <div data-testid="chat-message" data-role="rouge" data-type={message.type}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {message.discipline && (
              <Badge
                variant="outline"
                className={cn(
                  'mb-1.5 text-xs',
                  DISCIPLINE_COLORS[message.discipline] ?? 'bg-gray-100 text-gray-500'
                )}
              >
                {message.discipline}
              </Badge>
            )}
            <Markdown content={message.content} className="italic text-muted-foreground" />

            {message.reasoning && (
              <ReasoningBlock
                reasoning={message.reasoning}
                open={reasoningOpen}
                onOpenChange={setReasoningOpen}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Question messages
  return (
    <div data-testid="chat-message" data-role="rouge" data-type="question">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {message.discipline && (
            <Badge
              variant="outline"
              className={cn(
                'mb-1.5 text-xs',
                DISCIPLINE_COLORS[message.discipline] ?? 'bg-gray-100 text-gray-500'
              )}
            >
              {message.discipline}
            </Badge>
          )}
          <Markdown content={message.content} />

          {/* Options */}
          {message.options && message.options.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5" data-testid="chat-options">
              {message.options.map((opt) => (
                <div
                  key={opt.label}
                  className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="mt-px font-mono text-xs font-bold text-muted-foreground">
                    {opt.label}
                  </span>
                  <span className="text-foreground/90">{opt.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Reasoning (progressive disclosure) */}
          {message.reasoning && (
            <ReasoningBlock
              reasoning={message.reasoning}
              open={reasoningOpen}
              onOpenChange={setReasoningOpen}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// A hard or soft gate — Rouge is waiting on the user. Render
// prominently so it's visually distinct from prose/decisions and the
// user knows this is the thing blocking progress.
function GateQuestionMessage({ message }: { message: ChatMessageType }) {
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="gate_question"
      className="rounded-md border-2 border-blue-300 bg-blue-50/60 px-4 py-3"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <HelpCircle className="size-3.5 text-blue-600" />
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Rouge needs your answer
        </span>
        {message.discipline && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto text-xs',
              DISCIPLINE_COLORS[message.discipline] ?? 'bg-gray-100 text-gray-500',
            )}
          >
            {message.discipline}
          </Badge>
        )}
      </div>
      <Markdown content={message.content} />
    </div>
  )
}

// An autonomous decision Rouge just made. Still visible (that's the
// whole point of gated autonomy — visible decisions, not silent work)
// but visually subordinate to gates. The markerId is shown as a subtle
// anchor so future override affordances (PR 2) have somewhere to click.
//
// Content is parsed into labeled sections — "Alternatives considered:",
// "Reason:", "Override:" — so a dense run-on paragraph becomes a
// scannable block. If the decision body doesn't match this structure,
// it falls through to plain markdown.
function AutonomousDecisionMessage({ message }: { message: ChatMessageType }) {
  const sections = parseDecisionSections(message.content)
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="autonomous_decision"
      className="rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2.5"
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CircleDot className="size-3" />
        <span className="font-medium text-foreground/80">Rouge decided</span>
        {message.markerId && (
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {message.markerId}
          </span>
        )}
        {message.discipline && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto text-[10px]',
              DISCIPLINE_COLORS[message.discipline] ?? 'bg-gray-100 text-gray-500',
            )}
          >
            {message.discipline}
          </Badge>
        )}
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed">
        {sections.lead && <Markdown content={sections.lead} className="text-[13px]" />}
        {sections.alternatives && (
          <DecisionSection label="Alternatives considered" body={sections.alternatives} />
        )}
        {sections.reason && (
          <DecisionSection label="Reason" body={sections.reason} />
        )}
        {sections.override && (
          <DecisionSection label="Override" body={sections.override} muted />
        )}
      </div>
    </div>
  )
}

function DecisionSection({
  label,
  body,
  muted,
}: {
  label: string
  body: string
  muted?: boolean
}) {
  return (
    <div className={cn('text-[13px]', muted && 'text-muted-foreground')}>
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Markdown content={body} className="inline text-[13px]" />
    </div>
  )
}

// Split the decision body on `Alternatives considered:` / `Reason:` /
// `Override:` keywords. These match the decision format the orchestrator
// prompt teaches Claude to emit. Matching is tolerant of case and of
// whether the section is on its own line or inline with the preceding
// text.
function parseDecisionSections(content: string): {
  lead: string
  alternatives?: string
  reason?: string
  override?: string
} {
  const labels: Array<keyof ReturnType<typeof parseDecisionSections>> = [
    'alternatives',
    'reason',
    'override',
  ]
  const patterns: Record<string, RegExp> = {
    alternatives: /(^|\n|\.\s+)(Alternatives considered|Alternatives):\s*/i,
    reason: /(^|\n|\.\s+)(Reason|Why):\s*/i,
    override: /(^|\n|\.\s+)(Override):\s*/i,
  }

  // Find the first match for each section keyword.
  type Hit = { key: string; start: number; consumed: number }
  const hits: Hit[] = []
  for (const key of labels) {
    const m = content.match(patterns[key])
    if (m && m.index !== undefined) {
      // Skip the separator (match[1]) but include it back at the
      // lead's tail. `start` is where the KEYWORD starts; `consumed`
      // is where the body begins.
      const sepLen = m[1]?.length ?? 0
      hits.push({
        key,
        start: m.index + sepLen,
        consumed: m.index + m[0].length,
      })
    }
  }

  if (hits.length === 0) {
    return { lead: content.trim() }
  }

  // Sort by position so we slice in order.
  hits.sort((a, b) => a.start - b.start)
  const lead = content.slice(0, hits[0].start).trim()
  const result: ReturnType<typeof parseDecisionSections> = { lead }
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].start : content.length
    const body = content.slice(hit.consumed, bodyEnd).trim()
    if (body) (result as Record<string, string>)[hit.key] = body
  }
  return result
}

// System-level observability: reconciliation notes, marker rejections,
// auto-continuation budget messages. Not model output — the bridge
// explaining something to the user. Muted amber box so it reads as
// "infrastructure speaking" without screaming like an error.
function SystemNoteMessage({ message }: { message: ChatMessageType }) {
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="system_note"
      className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-900"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <Info className="size-3" />
        System note
      </div>
      <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
    </div>
  )
}

// Artifact completion report — "I wrote this file, here's what's in
// it". Distinct from [DECISION:] because there are no alternatives or
// fork-in-the-road — just produced work. Used heavily by spec for
// per-FA completions.
//
// Content is parsed for the common pattern Claude emits for these:
//   "FA5 Colour Picker on disk — complex tier, 31 ACs across
//    opening/closing (5), modes and sliders (9), hex input (4), ..."
// If the pattern matches, renders as a structured card (title, tier
// chip, total chip, breakdown chips). Falls back to plain prose
// when the pattern doesn't match — not every [WROTE:] is an FA spec.
function WroteArtifactMessage({ message }: { message: ChatMessageType }) {
  const parsed = parseWroteContent(message.content)
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="wrote_artifact"
      className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2.5"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <FileCheck2 className="size-3.5 text-emerald-600" />
        <span className="font-semibold text-emerald-800">
          {parsed.title ?? 'Rouge wrote'}
        </span>
        {message.markerId && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {message.markerId}
          </span>
        )}
        {parsed.tier && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            {parsed.tier}
          </span>
        )}
        {parsed.total && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            {parsed.total}
          </span>
        )}
        {message.discipline && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto text-[10px]',
              DISCIPLINE_COLORS[message.discipline] ?? 'bg-gray-100 text-gray-500',
            )}
          >
            {message.discipline}
          </Badge>
        )}
      </div>
      {parsed.breakdown.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {parsed.breakdown.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-emerald-900 border border-emerald-200"
            >
              <span className="font-medium">{chip.label}</span>
              <span className="tabular-nums text-emerald-700">{chip.count}</span>
            </span>
          ))}
        </div>
      )}
      {parsed.narrative && (
        <Markdown content={parsed.narrative} className="text-[13px]" />
      )}
    </div>
  )
}

// Parse the "<FA name> on disk — <tier>, N <unit> across <breakdown>.
// <narrative>" shape. Tolerant of variations: a missing section returns
// undefined/empty for that field instead of throwing. When nothing
// matches, `title` is undefined and `narrative` holds the full content
// so rendering gracefully degrades to prose.
function parseWroteContent(content: string): {
  title?: string
  tier?: string
  total?: string
  breakdown: Array<{ label: string; count: number }>
  narrative?: string
} {
  const trimmed = content.trim()
  // Primary pattern: "FA<n> <Name> on disk — <tier> tier, <N> ACs
  // across <breakdown>. <rest>"
  const primary = trimmed.match(
    /^(FA\d+\s+[^—]+?)\s+on disk\s+[—-]{1,2}\s+([^,]+?),\s+(\d+\s+ACs?)\s+across\s+([^.]+)\.\s*([\s\S]*)$/i,
  )
  if (primary) {
    const [, title, tier, total, breakdownRaw, rest] = primary
    return {
      title: title.trim(),
      tier: tier.trim(),
      total: total.trim(),
      breakdown: parseBreakdownChips(breakdownRaw),
      narrative: rest.trim() || undefined,
    }
  }
  // Secondary pattern: "<name> complete: <N> ACs, ..."
  const secondary = trimmed.match(
    /^([^:]+?)\s+complete:\s+(\d+\s+ACs?)(?:,\s+([^.]+))?\.\s*([\s\S]*)$/i,
  )
  if (secondary) {
    const [, title, total, breakdownRaw, rest] = secondary
    return {
      title: title.trim(),
      total: total.trim(),
      breakdown: breakdownRaw ? parseBreakdownChips(breakdownRaw) : [],
      narrative: rest.trim() || undefined,
    }
  }
  // Fallback — unstructured, render as prose.
  return { breakdown: [], narrative: trimmed }
}

function parseBreakdownChips(raw: string): Array<{ label: string; count: number }> {
  const chips: Array<{ label: string; count: number }> = []
  // Matches "<label> (<count>)" groups, comma-separated.
  const re = /([^,()]+?)\s*\((\d+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const label = m[1].trim().replace(/^and\s+/i, '')
    const count = parseInt(m[2], 10)
    if (label && !Number.isNaN(count)) chips.push({ label, count })
  }
  return chips
}

// System note variant that includes a one-click Continue button.
// Emitted by the bridge when the auto-continuation chunk budget is
// reached — user shouldn't have to type "continue" to resume.
function ResumePromptMessage({
  message,
  onResume,
  disabled,
}: {
  message: ChatMessageType
  onResume?: () => void
  disabled?: boolean
}) {
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="resume_prompt"
      className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-900"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <Info className="size-3" />
        System note
      </div>
      <div className="mb-2 whitespace-pre-wrap leading-relaxed">{message.content}</div>
      <Button
        size="sm"
        onClick={onResume}
        disabled={disabled || !onResume}
        className="h-7 gap-1.5 text-xs"
        data-testid="resume-continue-button"
      >
        <Play className="size-3" />
        Continue
      </Button>
    </div>
  )
}

// A still-working ping during autonomous stretches. Tiny, muted — the
// presence of a recent heartbeat is the signal, the content is context.
function HeartbeatMessage({ message }: { message: ChatMessageType }) {
  return (
    <div
      data-testid="chat-message"
      data-role="rouge"
      data-kind="heartbeat"
      className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground/80"
    >
      <Activity className="size-3" />
      <span className="italic">{message.content}</span>
    </div>
  )
}

function ReasoningBlock({
  reasoning,
  open,
  onOpenChange,
}: {
  reasoning: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        data-testid="reasoning-trigger"
      >
        <ChevronRight
          className={cn(
            'size-3 transition-transform',
            open && 'rotate-90'
          )}
        />
        Show reasoning
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500"
          data-testid="reasoning-content"
        >
          {reasoning}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
