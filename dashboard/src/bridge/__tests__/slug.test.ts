import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { slugify, isPlaceholderSlug, uniqueSlug } from '../slug'

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Customer Stories')).toBe('customer-stories')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Hello World!  ')).toBe('hello-world')
  })

  it('caps length at 64 chars', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBe(64)
  })

  it('produces empty string for non-alphanumeric input', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('isPlaceholderSlug', () => {
  it('recognises the bare placeholder', () => {
    expect(isPlaceholderSlug('untitled')).toBe(true)
  })

  it('recognises timestamped placeholders', () => {
    expect(isPlaceholderSlug('untitled-mo0c46fx')).toBe(true)
  })

  it('rejects real slugs', () => {
    expect(isPlaceholderSlug('testimonials')).toBe(false)
    expect(isPlaceholderSlug('customer-stories')).toBe(false)
  })

  it('does not false-positive on slugs that merely contain "untitled"', () => {
    expect(isPlaceholderSlug('not-untitled')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  let projectsRoot: string

  beforeEach(() => {
    projectsRoot = mkdtempSync(join(tmpdir(), 'rouge-slug-test-'))
  })

  afterEach(() => {
    rmSync(projectsRoot, { recursive: true, force: true })
  })

  it('returns the desired slug when nothing collides', () => {
    expect(uniqueSlug('testimonials', projectsRoot)).toBe('testimonials')
  })

  it('appends -2 on first collision', () => {
    mkdirSync(join(projectsRoot, 'testimonials'))
    expect(uniqueSlug('testimonials', projectsRoot)).toBe('testimonials-2')
  })

  it('skips further collisions', () => {
    mkdirSync(join(projectsRoot, 'testimonials'))
    mkdirSync(join(projectsRoot, 'testimonials-2'))
    expect(uniqueSlug('testimonials', projectsRoot)).toBe('testimonials-3')
  })

  it('treats reservedSelf as free (lets the project keep its own slug)', () => {
    mkdirSync(join(projectsRoot, 'testimonials'))
    expect(uniqueSlug('testimonials', projectsRoot, 'testimonials')).toBe('testimonials')
  })
})
