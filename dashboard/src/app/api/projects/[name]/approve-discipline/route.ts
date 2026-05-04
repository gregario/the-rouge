import { NextResponse } from 'next/server'
import { join } from 'node:path'
import { loadServerConfig } from '@/lib/server-config'
import { guardMutation } from '@/lib/route-guards'
import {
  readSeedingState,
  writeSeedingState,
  clearAwaitingApproval,
  markDisciplineComplete,
  isAwaitingApproval,
} from '@/bridge/seeding-state'
import { appendChatMessage } from '@/bridge/chat-reader'
import { handleSeedMessage } from '@/bridge/seed-handler'
import { runAutoClassifier } from '@/bridge/auto-classifier'
import { listApplicableDisciplines } from '@/bridge/tier-registry'
import { DISCIPLINE_SEQUENCE } from '@/bridge/types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const guard = await guardMutation(name)
  if (!guard.ok) return guard.response

  const { projectsRoot } = loadServerConfig()
  const projectDir = join(projectsRoot, name)

  const body = (await request.json().catch(() => ({}))) as {
    discipline?: string
  }
  if (!body.discipline || typeof body.discipline !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: discipline' },
      { status: 400 },
    )
  }

  const state = readSeedingState(projectDir)

  // Idempotent: already complete
  if ((state.disciplines_complete ?? []).includes(body.discipline)) {
    return NextResponse.json({ ok: true, nextDiscipline: state.current_discipline })
  }

  if (!isAwaitingApproval(state)) {
    return NextResponse.json(
      { error: 'No discipline is awaiting approval' },
      { status: 400 },
    )
  }

  if (state.discipline_awaiting_approval !== body.discipline) {
    return NextResponse.json(
      {
        error: `Discipline ${body.discipline} is not awaiting approval (${state.discipline_awaiting_approval} is)`,
      },
      { status: 409 },
    )
  }

  // Clear the approval gate, then complete the discipline
  clearAwaitingApproval(projectDir)
  await markDisciplineComplete(projectDir, body.discipline)

  // Handle taste kill: don't kick off the next discipline
  if (body.discipline === 'taste' && state.taste_kill) {
    return NextResponse.json({ ok: true, killed: true })
  }

  // After brainstorming: run auto-classifier + tier-based auto-skipping.
  // This normally runs inside runSeedingTurn, but the approval endpoint
  // needs to do it before the kickoff so the next discipline is correct.
  let midState = readSeedingState(projectDir)
  if (body.discipline === 'brainstorming' && !midState.applicable_disciplines) {
    const classResult = runAutoClassifier(projectDir)
    if (classResult.ok) {
      await markDisciplineComplete(projectDir, 'sizing')
      const applicable = listApplicableDisciplines(classResult.projectSize)
      const ss = readSeedingState(projectDir)
      ss.applicable_disciplines = applicable
      ss.project_size = classResult.projectSize
      writeSeedingState(projectDir, ss)

      for (const disc of DISCIPLINE_SEQUENCE) {
        if (disc === 'brainstorming' || disc === 'sizing') continue
        if (!applicable.includes(disc)) {
          await markDisciplineComplete(projectDir, disc)
        }
      }

      const genId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      appendChatMessage(projectDir, {
        id: genId(),
        role: 'rouge',
        content: `Project classified as **${classResult.projectSize}** tier. ${applicable.length} discipline(s) applicable: ${applicable.join(', ')}.`,
        timestamp: new Date().toISOString(),
        kind: 'system_note',
        metadata: { discipline: 'sizing' },
      })
    }
    midState = readSeedingState(projectDir)
  }

  // Fire a kickoff turn into the next applicable discipline
  const nextDisc = midState.current_discipline
  if (nextDisc && !(midState.disciplines_complete ?? []).includes(nextDisc) && nextDisc !== 'sizing') {
    try {
      await handleSeedMessage(projectDir, [
        `[SYSTEM] Discipline ${body.discipline} approved by user. State has advanced.`,
        `You are now entering ${nextDisc.toUpperCase()}. The sub-prompt for that discipline is attached to this turn; follow its rules exactly.`,
        `Begin the new discipline by asking its first question to the human.`,
      ].join(' '))
    } catch (err) {
      console.error(`[approve-discipline] kickoff for ${nextDisc} failed:`, err)
    }
  }

  const postState = readSeedingState(projectDir)
  return NextResponse.json({ ok: true, nextDiscipline: postState.current_discipline })
}
