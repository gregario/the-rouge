'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

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
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false)

  // Human messages
  if (message.role === 'human') {
    return (
      <div className="flex justify-end" data-testid="chat-message" data-role="human">
        <div className="max-w-[80%] rounded-lg bg-primary/15 px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
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
