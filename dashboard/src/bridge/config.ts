import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface BridgeConfig {
  projectsRoot: string
  rougeCli: string
  bridgePort: number
}

export function loadConfig(): BridgeConfig {
  const configPath = resolve(process.cwd(), 'rouge-dashboard.config.json')
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
  return {
    projectsRoot: raw.projects_root,
    rougeCli: raw.rouge_cli,
    bridgePort: raw.bridge_port || 3002,
  }
}
