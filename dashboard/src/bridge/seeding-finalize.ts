import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface FinalizeResult {
  ok: boolean
  missingArtifacts?: string[]
}

export function finalizeSeeding(projectDir: string): FinalizeResult {
  const missing: string[] = []

  // Verify task_ledger.json
  if (!existsSync(join(projectDir, 'task_ledger.json'))) {
    missing.push('task_ledger.json')
  }

  // Verify seed_spec/ has at least one file
  const seedSpecDir = join(projectDir, 'seed_spec')
  if (!existsSync(seedSpecDir)) {
    missing.push('seed_spec/')
  } else {
    const files = readdirSync(seedSpecDir).filter(f => !f.startsWith('.'))
    if (files.length === 0) {
      missing.push('seed_spec/')
    }
  }

  if (missing.length > 0) {
    return { ok: false, missingArtifacts: missing }
  }

  // Transition state.json to ready
  const statePath = join(projectDir, 'state.json')
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'))
    state.current_state = 'ready'
    writeFileSync(statePath, JSON.stringify(state, null, 2))
  }

  return { ok: true }
}
