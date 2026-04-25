# MCP Configs

Curated set of Model Context Protocol servers Rouge products can be configured with. Borrowed in shape from [everything-claude-code](https://github.com/affaan-m/everything-claude-code)'s `mcp-configs/mcp-servers.json`. Selection tailored to Rouge's flow and the product shapes it builds.

## Philosophy

**Keep under 10 MCPs enabled per product.** ECC's guidance, adopted here — context window preservation matters. Each profile (see `profiles/` once Phase 5 lands) declares which MCPs it needs; the preamble-injector only wires those.

## Shape

Each MCP is a single JSON manifest:

```
library/integrations/mcp-configs/<name>.json
```

Manifest fields:

```json
{
  "name": "supabase",
  "description": "Supabase schema introspection + auth config",
  "origin": "ECC | Rouge | community",
  "status": "active | draft | retired",
  "command": "npx -y @supabase/mcp-server",
  "args": [],
  "env_required": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "env_optional": ["SUPABASE_PROJECT_REF"],
  "read_only_recommended": true,
  "wire_into_phases": ["loop.building", "loop.foundation"],
  "profiles_recommended": ["saas-webapp", "api-service"],
  "notes": "..."
}
```

`read_only_recommended` (required, boolean) declares whether the
MCP is intended for read paths only (per GC.2 — read via MCP, mutate
via CLI). True for nearly all MCPs in this catalogue; false documented
per-case for the rare write-path MCP.

## Current curated set

| MCP              | Purpose                                    | Recommended for profile(s)        |
|------------------|--------------------------------------------|-----------------------------------|
| `supabase`       | Schema introspection, RLS inspection       | saas-webapp, api-service          |
| `github`         | Repo/PR/issue ops                          | all                               |
| `playwright`     | Browser automation for product-walk        | all web-targeting profiles        |
| `context7`       | Live documentation lookup                  | all (big hallucination reducer)   |
| `firecrawl`      | Web scraping for research                  | seeding phases                    |
| `exa`            | Web search for brainstorm                  | seeding phases                    |
| `vercel`         | Deployment ops                             | web profiles using Vercel         |
| `cloudflare`     | Workers/Pages/R2 ops                       | web profiles using Cloudflare     |

## Validation

`node scripts/ci/validate-mcp-configs.js` (added in Phase 3) checks every manifest has required fields and that `wire_into_phases` values are valid phase names.

## Health check

`node src/launcher/mcp-health-check.js <name>` is an additive helper that verifies a manifest is structurally valid and declared env vars are present. It does NOT attempt to invoke the MCP — that requires real credentials, and we don't want doctor runs to consume them.

Integration with `rouge doctor` is a Phase 3 follow-up. See `docs/design/mcp-integration.md`.
