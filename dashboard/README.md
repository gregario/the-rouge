# Rouge Dashboard

The Rouge control plane — a Next.js 16 app that reads live project state
from `$ROUGE_PROJECTS_DIR` and drives the loop.

You don't run this directly. The [Rouge launcher](../README.md) starts it:

```bash
rouge dashboard              # foreground, auto-opens browser
rouge dashboard start        # background, persistent
rouge dashboard --no-open    # skip auto-open
```

## Development

From this folder:

```bash
npm install
npm run dev        # next dev on :3001
npm test           # vitest
```

## Architecture

- `src/app/` — App Router pages + API route handlers at `/api/*`.
- `src/bridge/` — filesystem readers (scanner, spec, activity, etc.) used by the route handlers. No HTTP layer of its own — Rouge used to run these behind a separate bridge server on port 3002; that was retired in the route-handler unification.
- `src/lib/watcher-singleton.ts` — shared `ProjectWatcher` + SSE broadcaster behind `/api/events`.
- `src/lib/server-config.ts` — resolves projects root + CLI path from env or defaults.

## Build

```bash
npm run build                             # next build (standalone)
node ../scripts/stage-standalone.js       # stage dashboard/dist/
```

The staged `dist/` is the artifact the launcher runs and what ships in the
npm tarball. See the root `package.json` `prepack` hook.
