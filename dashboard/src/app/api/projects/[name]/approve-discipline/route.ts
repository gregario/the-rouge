import { NextResponse } from 'next/server'
import { join } from 'node:path'
import { loadServerConfig } from '@/lib/server-config'
import { guardMutation } from '@/lib/route-guards'
import {
  readSeedingState,
  clearAwaitingApproval,
  markDisciplineComplete,
  isAwaitingApproval,
  updateDisciplineStatusInState,
} from '@/bridge/seeding-state'
import { handleSeedMessage } from '@/bridge/seed-handler'

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

  // Fire a kickoff turn into the next discipline
  const postState = readSeedingState(projectDir)
  const nextDisc = postState.current_discipline
  if (nextDisc && !(postState.disciplines_complete ?? []).includes(nextDisc) && nextDisc !== 'sizing') {
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

  return NextResponse.json({ ok: true, nextDiscipline: nextDisc })
}
