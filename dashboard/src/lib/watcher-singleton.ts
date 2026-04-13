// Shared ProjectWatcher + SSE broadcaster.
//
// Route handlers run per-request but Node modules are cached per-process,
// so the first GET /api/events lazily boots the watcher and subsequent
// requests reuse it. `globalThis` guards against duplicate watchers
// surviving Next dev-mode HMR, which otherwise leaks fs.watch handles.

import { ProjectWatcher } from "@/bridge/watcher";
import type { BridgeEvent } from "@/bridge/types";
import { loadServerConfig } from "./server-config";

type SseClient = {
  id: number;
  send: (payload: string) => void;
  close: () => void;
};

interface Singleton {
  watcher: ProjectWatcher | null;
  clients: Map<number, SseClient>;
  nextId: number;
}

const g = globalThis as unknown as { __rougeWatcher?: Singleton };
const state: Singleton = (g.__rougeWatcher ??= {
  watcher: null,
  clients: new Map(),
  nextId: 1,
});

function ensureWatcher(): ProjectWatcher {
  if (state.watcher) return state.watcher;
  const cfg = loadServerConfig();
  const w = new ProjectWatcher(cfg.projectsRoot);
  w.on("event", (event: BridgeEvent) => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of state.clients.values()) {
      try {
        client.send(line);
      } catch {
        // broken pipe — client will be cleaned up on its own close handler
      }
    }
  });
  w.start();
  state.watcher = w;
  return w;
}

export function subscribe(send: (payload: string) => void, close: () => void): number {
  ensureWatcher();
  const id = state.nextId++;
  state.clients.set(id, { id, send, close });
  return id;
}

export function unsubscribe(id: number): void {
  state.clients.delete(id);
  // Leave the watcher running — dashboards reconnect often and re-starting
  // the watcher flushes its stateCache, which would cause spurious
  // project-discovered events on every reconnect.
}
