import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readBuildLog, phaseLogPath } from '../build-log-reader'

describe('readBuildLog', () => {
  let projectDir: string
  let logDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'rouge-buildlog-proj-'))
    logDir = mkdtempSync(join(tmpdir(), 'rouge-buildlog-logs-'))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(logDir, { recursive: true, force: true })
  })

  it('returns build.log when no phase log path given', () => {
    writeFileSync(join(projectDir, 'build.log'), 'boot line 1\nboot line 2\n')
    const res = readBuildLog(projectDir, 50)
    expect(res.source).toBe('build')
    expect(res.totalLines).toBe(2)
    expect(res.lines).toEqual(['boot line 1', 'boot line 2'])
  })

  it('prefers phase log when it exists and is non-empty', () => {
    writeFileSync(join(projectDir, 'build.log'), 'starting banner\n')
    const phasePath = join(logDir, 'testimonial-foundation.log')
    writeFileSync(phasePath, 'phase output A\nphase output B\nphase output C\n')
    const res = readBuildLog(projectDir, 50, phasePath)
    expect(res.source).toBe('phase')
    expect(res.totalLines).toBe(3)
    expect(res.lines).toEqual(['phase output A', 'phase output B', 'phase output C'])
    expect(res.sourcePath).toBe(phasePath)
  })

  it('falls back to build.log when phase log is empty', () => {
    writeFileSync(join(projectDir, 'build.log'), 'banner only\n')
    const phasePath = join(logDir, 'testimonial-foundation.log')
    writeFileSync(phasePath, '')
    const res = readBuildLog(projectDir, 50, phasePath)
    expect(res.source).toBe('build')
    expect(res.totalLines).toBe(1)
    expect(res.lines).toEqual(['banner only'])
  })

  it('falls back to build.log when phase log does not exist', () => {
    writeFileSync(join(projectDir, 'build.log'), 'banner only\n')
    const phasePath = join(logDir, 'does-not-exist.log')
    const res = readBuildLog(projectDir, 50, phasePath)
    expect(res.source).toBe('build')
    expect(res.totalLines).toBe(1)
  })

  it('honours the tailLines cap', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n')
    writeFileSync(join(projectDir, 'build.log'), lines + '\n')
    const res = readBuildLog(projectDir, 10)
    expect(res.totalLines).toBe(80)
    expect(res.lines.length).toBe(10)
    expect(res.lines[0]).toBe('line 71')
    expect(res.truncated).toBe(true)
  })

  it('returns empty result with null mtime when nothing exists', () => {
    mkdirSync(join(projectDir, 'subdir'), { recursive: true })
    const res = readBuildLog(projectDir, 50)
    expect(res.totalLines).toBe(0)
    expect(res.lines).toEqual([])
    expect(res.mtime).toBeNull()
    expect(res.source).toBe('build')
  })
})

describe('phaseLogPath', () => {
  it('joins logDir + slug-currentState.log', () => {
    expect(phaseLogPath('/tmp/logs', 'testimonial', 'foundation'))
      .toBe('/tmp/logs/testimonial-foundation.log')
  })
})
