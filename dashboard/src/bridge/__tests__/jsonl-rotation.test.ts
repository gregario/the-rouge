import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotateJsonlIfNeeded } from '../jsonl-rotation'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function writeJsonl(path: string, count: number, payloadBytes: number): void {
  const payload = 'x'.repeat(payloadBytes)
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    lines.push(JSON.stringify({ i, payload }))
  }
  writeFileSync(path, lines.join('\n') + '\n')
}

describe('rotateJsonlIfNeeded', () => {
  it('leaves a small file untouched (below probe threshold)', () => {
    dir = mkdtempSync(join(tmpdir(), 'rotate-'))
    const path = join(dir, 'log.jsonl')
    writeJsonl(path, 50, 100) // ~5 KB — way below 256 KB probe threshold
    const before = statSync(path).size
    rotateJsonlIfNeeded(path, 10)
    expect(statSync(path).size).toBe(before)
  })

  it('trims to last N entries when over cap and over probe size', () => {
    dir = mkdtempSync(join(tmpdir(), 'rotate-'))
    const path = join(dir, 'log.jsonl')
    // 600 entries × 600 bytes ≈ 360 KB — past the 256 KB probe threshold.
    writeJsonl(path, 600, 600)
    rotateJsonlIfNeeded(path, 100)
    const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(100)
    // Kept the LAST 100, not the first.
    const first = JSON.parse(lines[0])
    const last = JSON.parse(lines[lines.length - 1])
    expect(first.i).toBe(500)
    expect(last.i).toBe(599)
  })

  it('does nothing for a missing file', () => {
    dir = mkdtempSync(join(tmpdir(), 'rotate-'))
    const path = join(dir, 'nope.jsonl')
    expect(() => rotateJsonlIfNeeded(path, 100)).not.toThrow()
  })

  it('preserves trailing newline so subsequent appends form valid JSONL', () => {
    dir = mkdtempSync(join(tmpdir(), 'rotate-'))
    const path = join(dir, 'log.jsonl')
    writeJsonl(path, 600, 600)
    rotateJsonlIfNeeded(path, 100)
    const raw = readFileSync(path, 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
  })
})
