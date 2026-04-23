# Profiles

Product-shape profiles that declare which seeding phases, loop phases, rules, agents, MCPs, and skills a given product needs. Borrowed in shape from [everything-claude-code](https://github.com/affaan-m/everything-claude-code)'s install-profiles manifest pattern; adapted to Rouge's autonomous-build semantics.

## Why profiles

- **Context window discipline.** Loading every rule/agent/skill/MCP for every product wastes tokens. A CLI-tool profile doesn't need `web/` accessibility rules. A `saas-webapp` doesn't need `mcp-server-patterns`.
- **Quality floor per shape.** A SaaS web app needs Lighthouse ≥ 90. A CLI tool doesn't have a Lighthouse score. Quality bars are shape-dependent.
- **Scoped safety hooks.** A `mcp-server` profile can skip browser-related safety checks. An `internal-dashboard` profile can relax the security-reviewer lens for non-public products.

## Current profiles

| Profile | Purpose | Typical stack |
|---|---|---|
| `saas-webapp` | Multi-page web SaaS with auth, payments, dashboard | Next.js + Supabase + Vercel |
| `api-service` | Headless HTTP API, no browser UI | Hono / FastAPI / Go net/http |
| `mcp-server` | Model Context Protocol server, stdio or HTTP | TypeScript + MCP SDK |
| `cli-tool` | Command-line utility, distributed via npm/brew/cargo | TypeScript / Rust / Go |
| `internal-dashboard` | Internal tooling UI, auth via SSO, not public-facing | Next.js + Supabase |

## Shape

```
profiles/<name>.json
```

Field reference:

```json
{
  "name": "saas-webapp",
  "description": "Multi-page web SaaS with auth, payments, dashboard",
  "stack_hints": {
    "primary_language": "typescript",
    "targets_browser": true,
    "uses_db": true
  },
  "seeding_phases": ["brainstorm", "competition", "taste", "spec", "design", "legal", "infrastructure"],
  "loop_phases": ["foundation-building", "building", "evaluation-orchestrator", "analyzing", "change-spec-generation", "vision-check", "ship-promote", "document-release", "cycle-retrospective"],
  "rules_to_load": ["common", "typescript", "web"],
  "agents_to_enable": ["typescript-reviewer", "security-reviewer", "silent-failure-hunter"],
  "mcps_to_enable": ["supabase", "github", "playwright", "context7", "firecrawl", "exa", "vercel"],
  "skills_to_load": ["iterative-retrieval", "tdd-workflow", "language-specific-review"],
  "quality_bar": {
    "lighthouse_performance_min": 90,
    "lighthouse_accessibility_min": 90,
    "coverage_min": 80
  }
}
```

## Usage (once wired in Phase 5 follow-up)

```bash
# Select profile at seed time:
rouge seed my-app --profile saas-webapp

# Or set in rouge.config.json:
# { "default_profile": "saas-webapp" }
```

If no profile is selected, the loader returns an `all` fallback that loads everything — preserving current behavior.

## Validation

`node scripts/ci/validate-profiles.js` verifies required fields, profile names, and that referenced rules/agents/MCPs actually exist in the catalog.

## Fallback semantics

A profile that references a non-existent rule/agent/MCP logs a warning at load time but does not fail. The loader is graceful: it loads what exists, skips what doesn't, and records the skip in the cycle_context.
