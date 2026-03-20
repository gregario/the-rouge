import { describe, it, expect, beforeEach } from 'vitest'
import {
  type NavigationState,
  createInitialNavigationState,
  getActiveTab,
  getCardReturnTarget,
  setCardReturnTarget,
} from '@/lib/navigation'

describe('navigation state', () => {
  // @criterion: AC-NAV-01
  // @criterion-hash: a9fbae49a7d4
  it('defaults activeTab to "home"', () => {
    const state = createInitialNavigationState()
    expect(state.activeTab).toBe('home')
  })

  it('defaults cardReturnTarget to "home"', () => {
    const state = createInitialNavigationState()
    expect(state.cardReturnTarget).toBe('home')
  })

  // @criterion: AC-NAV-09
  // @criterion-hash: 77c33fdb368a
  it('derives active tab from "/" pathname', () => {
    expect(getActiveTab('/')).toBe('home')
  })

  it('derives active tab from "/collection" pathname', () => {
    expect(getActiveTab('/collection')).toBe('collection')
  })

  it('derives active tab from "/garden" pathname', () => {
    expect(getActiveTab('/garden')).toBe('garden')
  })

  it('returns null for card view pathname', () => {
    expect(getActiveTab('/card/apple')).toBeNull()
  })

  it('returns null for unknown pathnames', () => {
    expect(getActiveTab('/settings')).toBeNull()
  })

  // @criterion: AC-NAV-10
  // @criterion-hash: 986c341dd9b8
  it('tracks return target when opening card from collection', () => {
    const state = createInitialNavigationState()
    const updated = setCardReturnTarget(state, 'collection')
    expect(updated.cardReturnTarget).toBe('collection')
  })

  it('tracks return target when opening card from home', () => {
    const state = createInitialNavigationState()
    const updated = setCardReturnTarget(state, 'home')
    expect(updated.cardReturnTarget).toBe('home')
  })

  it('getCardReturnTarget returns the correct path for home', () => {
    const state = { ...createInitialNavigationState(), cardReturnTarget: 'home' as const }
    expect(getCardReturnTarget(state)).toBe('/')
  })

  it('getCardReturnTarget returns the correct path for collection', () => {
    const state = { ...createInitialNavigationState(), cardReturnTarget: 'collection' as const }
    expect(getCardReturnTarget(state)).toBe('/collection')
  })

  // Edge case: Deep link to card (no origin context)
  it('defaults return target to home for deep-linked cards', () => {
    const state = createInitialNavigationState()
    expect(getCardReturnTarget(state)).toBe('/')
  })
})
