import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { narrowEnum, narrowEnumWithDefault } from '../validate-enum'

type Color = 'red' | 'green' | 'blue'
const COLORS: readonly Color[] = ['red', 'green', 'blue'] as const

describe('narrowEnum', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('returns the value when it matches', () => {
    expect(narrowEnum('red', COLORS, 'color')).toBe('red')
  })

  it('returns undefined on unknown value', () => {
    expect(narrowEnum('chartreuse', COLORS, 'color')).toBeUndefined()
  })

  it('warns once per unknown value per tag', () => {
    narrowEnum('orange', COLORS, 'color')
    narrowEnum('orange', COLORS, 'color')
    expect(warn).toHaveBeenCalledTimes(1)
    // Different unknown value warns again
    narrowEnum('fuchsia', COLORS, 'color')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('treats null and undefined as missing, not as unknown', () => {
    expect(narrowEnum(null, COLORS, 'color')).toBeUndefined()
    expect(narrowEnum(undefined, COLORS, 'color')).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('narrowEnumWithDefault', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('returns the value when valid', () => {
    expect(narrowEnumWithDefault('blue', COLORS, 'red', 'color')).toBe('blue')
  })

  it('returns the fallback on unknown value and still warns', () => {
    expect(narrowEnumWithDefault('purple', COLORS, 'red', 'color')).toBe('red')
    expect(warn).toHaveBeenCalled()
  })
})
