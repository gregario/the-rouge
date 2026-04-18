// Shared ProjectWatcher + SSE broadcaster.
//
// Route handlers run per-request but Node modules are cached per-process,
// so the first GET /api/events lazily boots the watcher and subsequent
// requests reuse it. `globalThis` guards against duplicate watchers
// surviving Next dev-mode HMR, which otherwise leaks fs.watch handles.
//
// Prior behaviour had two leaks:
//   1. Concurrent first-time calls to ensureWatcher() could create two
//      watchers — each call did a lazy read of `state.watcher`, saw
//      null, and constructed one. The second assignment to
//      `state.watcher` leaked the first watcher's fs handles forever.
//   2. A client whose `send()` threw on every iteration (broken pipe,
//      aborted fetch) stayed in the clients map forever — the "will be
//      cleaned up on its own close handler" comment was wishful: not
//      every client invokes close on abort. Memory + CPU per broadcast
//      grew linearly with every dropped connection.
//
// Fixes:
//   - ensureWatcher() is guarded by an init promise, not a bare flag,
//     so concurrent calls resolve to the same watcher.
//   - Each client carries a `lastActiveAt` that the broadcaster bumps
//     on successful send. A periodic sweep evicts clients older than
//     CLIENT_IDLE_TIMEOUT_MS. Clients whose send throws are evicted
//     immediately.

import { ProjectWatcher } from "@/bridge/watcher";
import type { BridgeEvent } from "@/bridge/types";
import { loadServerConfig } from "./server-config";

type SseClient = {
  id: number;
  send: (payload: string) => void;
  close: () => void;
  lastActiveAt: number;
};

interface Singleton {
  watcher: ProjectWatcher | null;
  watcherInit: Promise<ProjectWatcher> | null;
  clients: Map<number, SseClient>;
  nextId: number;
  reaperStarted: boolean;
}

const g = globalThis as unknown as { __rougeWatcher?: Singleton };
const state: Singleton = (g.__rougeWatcher ??= {
  watcher: null,
  watcherInit: null,
  clients: new Map(),
  nextId: 1,
  reaperStarted: false,
});

// Evict SSE clients whose lastActiveAt is older than this. 15 minutes
// is long enough to survive normal HMR reloads and brief network
// wobbles, short enough to reclaim leaked subscriptions before they
// pile up.
const CLIENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const REAPER_INTERVAL_MS = 60 * 1000;

function startReaper(): void {
  if (state.reaperStarted) return;
  state.reaperStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of state.clients) {
      if (now - client.lastActiveAt > CLIENT_IDLE_TIMEOUT_MS) {
        try { client.close(); } catch { /* ignore */ }
        state.clients.delete(id);
      }
    }
  }, REAPER_INTERVAL_MS);
  // Don't block process exit on the reaper.
  timer.unref?.();
}

async function ensureWatcher(): Promise<ProjectWatcher> {
  if (state.watcher) return state.watcher;
  if (state.watcherInit) return state.watcherInit;
  state.watcherInit = (async () => {
    const cfg = loadServerConfig();
    const w = new ProjectWatcher(cfg.projectsRoot);
    w.on("event", (event: BridgeEvent) => {
      const line = `data: ${JSON.stringify(event)}\n\n`;
      const dead: number[] = [];
      for (const client of state.clients.values()) {
        try {
          client.send(line);
          client.lastActiveAt = Date.now();
        } catch {
          // Broken pipe / aborted fetch — evict now, don't rely on
          // the caller ever invoking close(). One throw is enough —
          // subsequent sends would fail the same way.
          dead.push(client.id);
        }
      }
      for (const id of dead) {
        const c = state.clients.get(id);
        if (c) {
          try { c.close(); } catch { /* ignore */ }
          state.clients.delete(id);
        }
      }
    });
    w.start();
    state.watcher = w;
    return w;
  })();
  try {
    return await state.watcherInit;
  } finally {
    // Clear after resolve so failed inits can retry, not linger forever.
    state.watcherInit = null;
  }
}

export function subscribe(send: (payload: string) => void, close: () => void): number {
  // Kick off watcher init in the background — don't await. The client
  // registers immediately so a hot reconnect doesn't miss the client
  // slot; events won't flow until the init promise resolves, which is
  // near-instant in practice (ProjectWatcher.start() is synchronous-ish
  // by the time it returns from the event-emitter).
  void ensureWatcher().catch((err) => {
    console.error('[watcher-singleton] watcher init failed:', err);
  });
  startReaper();
  const id = state.nextId++;
  state.clients.set(id, { id, send, close, lastActiveAt: Date.now() });
  return id;
}

export function unsubscribe(id: number): void {
  state.clients.delete(id);
  // Leave the watcher running — dashboards reconnect often and re-starting
  // the watcher flushes its stateCache, which would cause spurious
  // project-discovered events on every reconnect.
}

// Exposed for tests.
export function __peekClientCount(): number {
  return state.clients.size;
}
