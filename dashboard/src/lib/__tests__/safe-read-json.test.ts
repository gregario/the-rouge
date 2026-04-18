import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeReadJson, safeReadJsonWithStatus } from '../safe-read-json'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'safe-read-json-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('safeReadJson', () => {
  it('returns fallback silently when the file is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = safeReadJson(join(dir, 'missing.json'), { kind: 'fallback' })
    expect(result).toEqual({ kind: 'fallback' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns parsed JSON when the file is valid', () => {
    const p = join(dir, 'ok.json')
    writeFileSync(p, JSON.stringify({ hello: 'world' }))
    expect(safeReadJson<Record<string, string>>(p, {})).toEqual({ hello: 'world' })
  })

  it('returns fallback AND warns when the file is malformed', () => {
    const p = join(dir, 'broken.json')
    writeFileSync(p, '{not json at all')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = safeReadJson(p, { fallback: true })
    expect(result).toEqual({ fallback: true })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatch(/JSON.parse failed/)
    expect(warn.mock.calls[0][0]).toContain(p)
    warn.mockRestore()
  })

  it('throws when throwOnParseError is true', () => {
    const p = join(dir, 'broken.json')
    writeFileSync(p, 'not json')
    expect(() => safeReadJson(p, {}, { throwOnParseError: true })).toThrow(/malformed JSON/)
  })

  it('includes the context string in warnings', () => {
    const p = join(dir, 'broken.json')
    writeFileSync(p, '{broken')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    safeReadJson(p, {}, { context: 'my-caller' })
    expect(warn.mock.calls[0][0]).toContain('my-caller')
    warn.mockRestore()
  })

  it('treats empty file as fallback silently', () => {
    const p = join(dir, 'empty.json')
    writeFileSync(p, '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeReadJson(p, { fb: true })).toEqual({ fb: true })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('safeReadJsonWithStatus', () => {
  it('returns missing when file does not exist', () => {
    expect(safeReadJsonWithStatus(join(dir, 'x.json'))).toEqual({ status: 'missing', data: null })
  })

  it('returns ok + data when file is valid', () => {
    const p = join(dir, 'ok.json')
    writeFileSync(p, JSON.stringify({ a: 1 }))
    expect(safeReadJsonWithStatus(p)).toEqual({ status: 'ok', data: { a: 1 } })
  })

  it('returns corrupt when JSON.parse throws', () => {
    const p = join(dir, 'bad.json')
    writeFileSync(p, 'not json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = safeReadJsonWithStatus(p)
    expect(r.status).toBe('corrupt')
    expect(r.data).toBeNull()
    warn.mockRestore()
  })

  it('returns corrupt when file is empty', () => {
    const p = join(dir, 'empty.json')
    writeFileSync(p, '')
    expect(safeReadJsonWithStatus(p).status).toBe('corrupt')
  })
})
