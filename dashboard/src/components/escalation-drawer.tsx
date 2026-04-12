'use client'

import { useState, useCallback, useRef } from 'react'
import type { Escalation, ProjectState } from '@/lib/types'
import { isBridgeEnabled, sendCommand } from '@/lib/bridge-client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { StateBadge } from '@/components/state-badge'
import { AlertTriangle, Loader2, Play, SkipForward } from 'lucide-react'

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

interface EscalationDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  escalation: Escalation
  projectState: ProjectState
  slug?: string
  affectedStory?: string
}

export function EscalationDrawer({
  open,
  onOpenChange,
  escalation,
  projectState,
  slug,
  affectedStory,
}: EscalationDrawerProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const execCommand = useCallback(async (command: string) => {
    if (!slug || !isBridgeEnabled()) return
    setLoading(command)
    try {
      const text = textareaRef.current?.value?.trim()
      if (text && command === 'resume') {
        await sendCommand(slug, 'feedback', { text })
      }
      await sendCommand(slug, command)
      onOpenChange(false)
    } catch (err) {
      console.error(`[bridge] Escalation command "${command}" failed:`, err)
    } finally {
      setLoading(null)
    }
  }, [slug, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg" data-testid="escalation-drawer">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <SheetTitle>Escalation</SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={tierColors[escalation.tier] ?? tierColors[1]}
              data-testid="tier-badge"
            >
              {tierLabels[escalation.tier] ?? `Tier ${escalation.tier}`}
            </Badge>
          </div>
          <SheetDescription>{escalation.reason}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {/* Affected context */}
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current State
              </h4>
              <div className="mt-1">
                <StateBadge state={projectState} />
              </div>
            </div>

            {affectedStory && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Affected Story
                </h4>
                <p className="mt-1 text-sm text-foreground" data-testid="affected-story">
                  {affectedStory}
                </p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested Context
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {escalation.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Created {new Date(escalation.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Response area */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Response
            </h4>
            <Textarea
              ref={textareaRef}
              placeholder="Provide guidance or instructions for resolving this escalation..."
              className="min-h-[8rem] resize-none"
              rows={5}
              data-testid="escalation-response"
            />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => execCommand('skip')}
            disabled={loading !== null}
            data-testid="skip-phase-button"
          >
            {loading === 'skip' ? <Loader2 className="size-3.5 animate-spin" /> : <SkipForward className="size-3.5" />}
            Skip Phase
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => execCommand('resume')}
            disabled={loading !== null}
            data-testid="resume-button"
          >
            {loading === 'resume' ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Resume
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
