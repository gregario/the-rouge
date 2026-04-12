import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

export interface SpecMarkdownFile {
  name: string
  content: string
}

export interface ProjectSpec {
  vision?: {
    product?: string
    name?: string
    one_liner?: string
    tagline?: string
    problem?: string
    user?: { primary?: string; segments?: string[] }
    emotional_north_star?: string
    differentiators?: string[]
    competitors?: { name: string; url?: string; mechanic?: string; weakness?: string }[]
  }
  milestones?: {
    name: string
    display_name?: string
    feature_areas?: string[]
    depends_on_milestones?: string[]
    stories: {
      id: string
      name: string
      feature_area?: string
      acceptance_criteria?: string[]
      depends_on?: string[]
    }[]
  }[]
  // Legacy format: numbered markdown files in seed_spec/
  legacySpecFiles?: SpecMarkdownFile[]
  hasVision: boolean
  hasMilestones: boolean
  hasLegacySpec: boolean
}

export function readProjectSpec(projectDir: string): ProjectSpec {
  const result: ProjectSpec = {
    hasVision: false,
    hasMilestones: false,
    hasLegacySpec: false,
  }

  const visionPath = join(projectDir, 'vision.json')
  if (existsSync(visionPath)) {
    try {
      result.vision = JSON.parse(readFileSync(visionPath, 'utf-8'))
      result.hasVision = true
    } catch {
      // ignore malformed vision.json
    }
  }

  const seedSpecDir = join(projectDir, 'seed_spec')
  const milestonesPath = join(seedSpecDir, 'milestones.json')
  if (existsSync(milestonesPath)) {
    try {
      const parsed = JSON.parse(readFileSync(milestonesPath, 'utf-8'))
      result.milestones = parsed.milestones ?? []
      result.hasMilestones = true
    } catch {
      // ignore malformed milestones.json
    }
  }

  // Legacy: markdown files per feature (e.g., countdowntimer)
  if (existsSync(seedSpecDir)) {
    try {
      const mdFiles = readdirSync(seedSpecDir)
        .filter(f => f.endsWith('.md'))
        .sort()
      if (mdFiles.length > 0) {
        result.legacySpecFiles = mdFiles.map(name => ({
          name,
          content: readFileSync(join(seedSpecDir, name), 'utf-8'),
        }))
        result.hasLegacySpec = true
      }
    } catch {
      // ignore
    }
  }

  return result
}
