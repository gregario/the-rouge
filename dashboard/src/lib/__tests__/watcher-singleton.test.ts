import { describe, it, expect, vi } from 'vitest'

// Each test gets its own mock bag so concurrent tests don't share an
// emitter listener. We can't rely on module-level hoisted mocks here —
// the watcher is a process-level singleton that survives vi.resetModules,
// and cross-test state causes flakiness.
function makeHarness() {
  const listeners = new Map<string, (p: unknown) => void>()
  const instance = {
    on: (evt: string, fn: (p: unknown) => void) => listeners.set(evt, fn),
    start: vi.fn(),
  }
  const ctor = vi.fn(() => instance)
  return { listeners, instance, ctor }
}

const h1 = vi.hoisted(() => ({ ctor: { current: null as unknown } }))

vi.mock('@/bridge/watcher', () => ({
  ProjectWatcher: function (...args: unknown[]) {
    const fn = h1.ctor.current as (...a: unknown[]) => unknown
    if (!fn) throw new Error('test did not install a ProjectWatcher ctor')
    return fn(...args)
  },
}))
vi.mock('../server-config', () => ({
  loadServerConfig: () => ({ projectsRoot: '/tmp/fake' }),
}))

async function freshModule(ctor: (...a: unknown[]) => unknown) {
  h1.ctor.current = ctor
  ;(globalThis as { __rougeWatcher?: unknown }).__rougeWatcher = undefined
  vi.resetModules()
  return import('../watcher-singleton')
}

describe('watcher-singleton', () => {
  it('does not double-boot the watcher under concurrent subscribes', async () => {
    const harness = makeHarness()
    const mod = await freshModule(harness.ctor)
    mod.subscribe(() => {}, () => {})
    mod.subscribe(() => {}, () => {})
    mod.subscribe(() => {}, () => {})
    await new Promise((r) => setTimeout(r, 20))
    expect(harness.instance.start).toHaveBeenCalledTimes(1)
    expect(harness.ctor).toHaveBeenCalledTimes(1)
  })

  it('evicts a client whose send throws', async () => {
    const harness = makeHarness()
    const mod = await freshModule(harness.ctor)
    const alive = vi.fn()
    const broken = vi.fn(() => {
      throw new Error('EPIPE')
    })
    mod.subscribe(alive, () => {})
    mod.subscribe(broken, () => {})
    for (let i = 0; i < 50 && !harness.listeners.has('event'); i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(harness.listeners.has('event')).toBe(true)
    expect(mod.__peekClientCount()).toBe(2)
    const emit = harness.listeners.get('event')!
    emit({ type: 'state-change', slug: 'x' })
    expect(alive).toHaveBeenCalledOnce()
    expect(broken).toHaveBeenCalledOnce()
    expect(mod.__peekClientCount()).toBe(1)
  })

  it('unsubscribe removes the client from the map', async () => {
    const harness = makeHarness()
    const mod = await freshModule(harness.ctor)
    const id = mod.subscribe(() => {}, () => {})
    expect(mod.__peekClientCount()).toBe(1)
    mod.unsubscribe(id)
    expect(mod.__peekClientCount()).toBe(0)
  })
})
