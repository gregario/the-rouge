# GC.2 — MCP vs CLI Boundary

**Status:** designed, enforcement landing in Phase 2 of the grand unified reconciliation.
**Date:** 2026-04-25.
**Related code:** `library/integrations/mcp-configs/*.json` (post-Phase-1), prompt-content tests in Phase 2, `src/launcher/catalogue.js` (Phase 1).

## The boundary

When AI needs to interact with an external system (Vercel, Cloudflare, Supabase, GitHub, etc.):

- **Read / inspect / observe operations go through the MCP server** if one is wired in for that phase. Examples: list deployments, read schema, fetch issue details, query a feature flag.

- **Mutate / deploy / push / migrate / delete operations always use the CLI tool**, invoked via the `Bash` tool. Examples: `vercel --prod`, `supabase db push`, `git push`, `gh pr create`, `wrangler deploy`.

MCPs are advisory (they help the AI reason about external state); CLIs are authoritative (they actually change external state).

## Why this matters

MCPs and CLIs are not redundant — they are complementary, and conflating them creates two distinct failure modes:

1. **Mutating via MCP loses the audit trail.** A CLI invocation is a Bash command in the conversation history; the safety hooks see it, the audit log captures it, the user can read it back. An MCP `vercel.deploy` tool call is opaque after the fact unless the MCP itself logs to a known location, which most don't.

2. **Reading via CLI is brittle and slow.** Listing 50 Vercel deployments via `vercel ls --json | jq` parses fine but takes 8+ seconds and pollutes the AI's context with noise. The MCP returns the same data shaped for AI consumption in 200ms.

The boundary aligns the strengths of each surface to the operation type that actually benefits.

## Enforcement

### Prompt-level policy paragraph

The phase prompts that interact with external systems get a standardized paragraph (Phase 2 of the reconciliation):

> **External-system interaction policy.** For inspecting external state (list deployments, check schema, fetch project metadata), prefer the relevant MCP server if it's wired into this phase. For *mutating* external state (deploy, migrate, push, delete, run-migration), always use the CLI tool via the Bash tool. CLIs leave a Bash-tool audit trail that MCPs do not. If you need to mutate via an MCP because the CLI is unavailable, escalate.

This paragraph lands in: `00-foundation-building.md`, `01-building.md`, `07-ship-promote.md`, `08-document-release.md`, plus the seeding disciplines that touch external systems.

### Catalogue field

Each MCP block in the merged catalogue (Phase 1) declares:

```yaml
mcp:
  command: npx -y @vercel/mcp-server
  read_only_recommended: true   # required field
  wire_into_phases: [loop.ship-promote, loop.foundation]
```

`read_only_recommended` is a required, explicit boolean (no implicit). True means the MCP is intended for read paths only; false means the MCP exposes mutating tools and is wired in for phases where mutation is genuinely safer via the MCP than the CLI (rare; documented per-case).

### Test enforcement

`test/prompts/gc2-mcp-vs-cli-boundary.test.js` (Phase 2 deliverable):

1. Greps every prompt that mentions an MCP. Within a 200-character window of the MCP mention, fails if the prompt also contains mutating verbs (`deploy`, `push`, `migrate`, `delete`, `force-push`, `drop`, `truncate`).
2. Asserts every MCP block in the catalogue has `read_only_recommended` set explicitly.
3. Asserts no MCP with `read_only_recommended: true` is wired into a phase whose name contains a mutating verb (e.g. ship-promote).

## Examples

**Right pattern:**
> "Check whether the staging deployment is healthy via the Vercel MCP's `get-deployment-status` tool. If it's healthy, run `vercel --prod` via Bash to promote."

**Wrong pattern (caught by test):**
> "Use the Vercel MCP to deploy to production." — fails the prompt-content test (mutate verb near MCP mention).

**Wrong pattern (caught by catalogue test):**
> An MCP block lacks `read_only_recommended`, so its intent is ambiguous — fails the catalogue schema test.

## Out of scope

- **MCP authoring.** Rouge curates MCPs, doesn't author them. Upstream MCP servers' choices about which tools they expose are not Rouge's concern.
- **CLI quality.** If a CLI is missing a needed read capability and the MCP is the only option, that's an escalation, not a boundary violation. Document the exception in the catalogue entry.
- **Long-tail mutation surfaces.** Some external systems expose mutation only via API/MCP (e.g. some SaaS without a CLI). Those entries get `read_only_recommended: false` with a per-case justification field.
