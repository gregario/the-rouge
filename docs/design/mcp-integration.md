# MCP Integration (design)

**Status:** manifests + validators + health-check helper landed; doctor wiring deferred
**Borrowed from:** everything-claude-code's `mcp-configs/mcp-servers.json` + `mcp-health-check.js` hook
**Date:** 2026-04-23

## What landed

- `mcp-configs/*.json` — 8 curated MCP manifests (supabase, github, playwright, context7, firecrawl, exa, vercel, cloudflare-workers)
- `scripts/ci/validate-mcp-configs.js` — schema validation against required fields, allowed phases, allowed profiles
- `src/launcher/mcp-health-check.js` — stateless helper: `checkOne(name)` and `checkAll()` return structural validity + env-var presence without invoking MCPs
- `tests/mcp-health-check.test.js` — 10 unit tests

## What's NOT yet wired

### Doctor integration

`src/launcher/doctor.js` should, at some point, call `mcp-health-check.checkAll()` and surface results. The shape would be:

```
Doctor output:
  ...existing checks...
  MCPs configured:
    [ready]    supabase
    [missing]  firecrawl — missing env: FIRECRAWL_API_KEY
    [draft]    playwright
```

Deferred because `doctor.js` is in `src/launcher/*` which is blocklisted in `rouge.config.json` for self-improvement. Human review before wiring is the right guard.

### Preamble injection

Profile-aware MCP wiring (Phase 5) will read the active profile's declared MCPs and include only those in the claude-code environment. Until profiles land, MCPs are all-on or all-off at the user's discretion.

### Claude Code settings.json merge

Actual MCP registration with Claude Code requires an entry in `~/.claude/settings.json` under `mcpServers`. Rouge's profile-loader (Phase 5) will generate this merge. For now, users configure manually.

## Rollout steps (future)

1. **Merge this PR** (manifests + validator + helper, no wiring)
2. **Human review** the 8 manifests — correct versions, correct arg shapes, correct env names
3. **Follow-up PR** wires `checkAll()` into `doctor.js` after secrets check
4. **Phase 5 follow-up** wires profile-driven MCP selection into preamble-injector
5. **Phase 5 stretch** auto-generates `~/.claude/settings.json` mcpServers entries from active profile + rouge.config.json

## Why manifests, not a single mcp-servers.json

ECC uses a single 6KB JSON. Rouge's split to per-MCP files lets:
- Validators report per-MCP errors cleanly
- `git blame` trace updates to individual MCPs
- Future contributions add a single file, not diff a large one
- Profile system cleanly references MCPs by filename

## References

- ECC: `mcp-configs/mcp-servers.json` (6,779 bytes), `scripts/hooks/mcp-health-check.js`
- User memory: Vercel hobby tier preview deploy limitation — surfaces in `mcp-configs/vercel.json` notes
- Supabase pairing: per CLAUDE.md, "Supabase Auth is new — expect escalations" — pairs with context7 for live docs during integration
