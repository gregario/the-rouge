import { NextResponse } from 'next/server'
import { join } from 'node:path'
import { loadServerConfig } from '@/lib/server-config'
import { guardMutation } from '@/lib/route-guards'
import {
  readSeedingState,
  markSeedingComplete,
  writeSeedingState,
} from '@/bridge/seeding-state'
import { validateTierCompletion } from '@/bridge/tier-registry'
import { finalizeSeeding } from '@/bridge/seeding-finalize'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const guard = await guardMutation(name)
  if (!guard.ok) return guard.response

  const { projectsRoot } = loadServerConfig()
  const projectDir = join(projectsRoot, name)

  const state = readSeedingState(projectDir)

  // Idempotent: already complete
  if (state.seeding_complete) {
    return NextResponse.json({ ok: true })
  }

  // Tier validation
  const tierCheck = validateTierCompletion(projectDir)
  if (!tierCheck.ok) {
    return NextResponse.json(
      { ok: false, error: tierCheck.reason, missingArtifacts: tierCheck.missing },
      { status: 422 },
    )
  }

  // Finalize
  const result = await finalizeSeeding(projectDir)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'Finalization failed', missingArtifacts: result.missingArtifacts },
      { status: 422 },
    )
  }

  markSeedingComplete(projectDir)

  // Clear the final approval flag
  const ss = readSeedingState(projectDir)
  delete ss.seeding_awaiting_final_approval
  writeSeedingState(projectDir, ss)

  return NextResponse.json({ ok: true })
}
