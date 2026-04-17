import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { statePath as resolveStatePath } from './state-path'

export interface FinalizeResult {
  ok: boolean
  missingArtifacts?: string[]
}

/** Minimum byte floor for "looks like real content, not a stub". */
const MIN_FILE_BYTES = 200

function fileLooksReal(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).size >= MIN_FILE_BYTES
  } catch {
    return false
  }
}

export function finalizeSeeding(projectDir: string): FinalizeResult {
  const missing: string[] = []

  // Task ledger — V3 story/milestone tracking the launcher consumes.
  if (!existsSync(join(projectDir, 'task_ledger.json'))) {
    missing.push('task_ledger.json')
  }

  // Seed spec directory — per-feature spec files.
  const seedSpecDir = join(projectDir, 'seed_spec')
  if (!existsSync(seedSpecDir)) {
    missing.push('seed_spec/')
  } else {
    const files = readdirSync(seedSpecDir).filter(f => !f.startsWith('.'))
    if (files.length === 0) {
      missing.push('seed_spec/')
    }
  }

  // vision.json — machine-readable product vision the orchestrator
  // (line 147) and complexity-profile step (line 479) both require.
  // The V2 schema finalization writes infrastructure.services into
  // this file too.
  if (!fileLooksReal(join(projectDir, 'vision.json'))) {
    missing.push('vision.json')
  }

  // product_standard.json — inherited global + domain + project
  // overrides (orchestrator line 148). Drives what the Factory holds
  // the build to during loop evaluation.
  if (!fileLooksReal(join(projectDir, 'product_standard.json'))) {
    missing.push('product_standard.json')
  }

  if (missing.length > 0) {
    return { ok: false, missingArtifacts: missing }
  }

  // All artifacts present — promote state to ready so the build loop
  // can pick it up when the human triggers it.
  const statePath = resolveStatePath(projectDir)
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'))
    state.current_state = 'ready'
    writeFileSync(statePath, JSON.stringify(state, null, 2))
  }

  return { ok: true }
}
