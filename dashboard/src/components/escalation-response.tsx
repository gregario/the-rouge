'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import { isBridgeEnabled, sendCommand } from '@/lib/bridge-client'
import type { Escalation } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Send, Play } from 'lucide-react'

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

export function EscalationResponse({ escalation, slug }: { escalation: Escalation; slug?: string }) {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [sending, setSending] = useState(false)

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      {
        id: `resp-${Date.now()}`,
        text,
        timestamp: new Date().toISOString(),
      },
    ])
    setInputValue('')

    // Send to bridge if enabled
    if (slug && isBridgeEnabled()) {
      setSending(true)
      sendCommand(slug, 'feedback', { text })
        .catch((err) => console.error('[bridge] Feedback send failed:', err))
        .finally(() => setSending(false))
    }
  }, [inputValue, slug])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

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

          <label className="text-xs font-medium text-gray-500 mb-2 block">
            Your Response
          </label>
          <Textarea
            placeholder="Provide guidance or instructions... (Enter to send, Shift+Enter for newline)"
            className="min-h-[4rem] resize-none bg-white"
            rows={3}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="escalation-response-input"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              data-testid="escalation-send-button"
            >
              <Send className="size-3.5" />
              Send
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={messages.length === 0}
              data-testid="escalation-resume-button"
            >
              <Play className="size-3.5" />
              Respond & Resume
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
