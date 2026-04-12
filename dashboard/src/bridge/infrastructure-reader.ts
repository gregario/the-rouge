import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Shape of infrastructure_manifest.json, all fields optional because
// older projects don't have this file at all, and newer projects may
// only populate a subset.

export interface InfrastructureManifest {
  framework?: {
    name?: string
    version?: string
    router?: string
    reason?: string
  }
  database?: {
    type?: string
    provider?: string
    client?: string
    reason?: string
  }
  auth?: {
    strategy?: string
    provider?: string
    notes?: string
  }
  deploy?: {
    target?: string
    mode?: string
    reason?: string
    staging_strategy?: string
  }
  storage?: {
    provider?: string
    buckets?: string[]
    reason?: string
  }
  notifications?: {
    strategy?: string
    pwa?: boolean
    email?: boolean
    reason?: string
  }
  data_sources?: unknown[]
  incompatibilities_resolved?: { issue: string; resolution: string }[]
  risk_flags?: { flag: string; description: string; mitigation?: string }[]
  integration_availability?: {
    in_catalogue?: string[]
    not_in_catalogue?: string[]
  }
  depends_on_projects?: string[]
}

export function readInfrastructureManifest(
  projectDir: string,
): InfrastructureManifest | null {
  const path = join(projectDir, 'infrastructure_manifest.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as InfrastructureManifest
  } catch {
    return null
  }
}
