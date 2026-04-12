import { describe, it, expect } from 'vitest'
import { loadConfig } from '../config'
import type { BridgeConfig } from '../config'

describe('loadConfig', () => {
  it('returns config with required fields', () => {
    const config = loadConfig()
    expect(config.projectsRoot).toBeDefined()
    expect(config.rougeCli).toBeDefined()
    expect(config.bridgePort).toBeTypeOf('number')
  })

  it('has a valid projects root path', () => {
    const config = loadConfig()
    expect(config.projectsRoot).toContain('projects')
  })
})
