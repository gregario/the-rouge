# The Rouge Library

The Library is Rouge's accumulated design intelligence and integration knowledge. Not documentation — machine-readable context that feeds into every phase. Phase prompts read these files directly. Tests assert their shape.

## Directory structure

```
library/
├── global/           # Universal quality standards — heuristics that apply to all products
├── domain/
│   ├── web/          # Web-specific heuristics
│   ├── game/         # Game-specific heuristics
│   └── artifact/     # Artifact-specific heuristics (books, images, etc.)
├── personal/         # Personal taste fingerprint entries (per-user)
├── templates/        # PO check templates (parameterised quality checks)
├── rubrics/          # Multi-dimensional evaluation rubrics (P1.14 product-quality, etc.)
├── rules/            # Discipline-specific rules consumed by reviewer agents
├── agents/           # Reviewer agent personas (.md prompts)
├── skills/           # Skill descriptors composed into phase preambles
├── vendors/          # Per-vendor manifests (deny patterns, vendor-specific tooling)
├── integrations/
│   ├── tier-1/       # Stacks (language + framework + runtime)
│   ├── tier-2/       # Services (Stripe, Supabase, Sentry, Neon, Clerk, …)
│   ├── tier-3/       # Code patterns within services (Stripe checkout, Supabase RLS, …)
│   ├── mcp-configs/  # MCP server manifests (folded into parent tier-2 entries)
│   └── drafts/       # Draft tier-2/3 entries awaiting review
├── gold-sets/        # Calibration data for the evaluation kappa gate
└── README.md         # This file
```

The integration catalogue (`integrations/`) is the central piece. New tier-2 entries auto-surface to `rouge setup` without code edits. See [`docs/design/integration-catalogue.md`](../docs/design/integration-catalogue.md) for the catalogue model and [`docs/contributing/adding-a-vendor.md`](../docs/contributing/adding-a-vendor.md) for adding new entries.

Most of the sub-directories have their own README — start there when you want to add to that surface specifically:

- [`integrations/mcp-configs/README.md`](integrations/mcp-configs/README.md)
- [`agents/README.md`](agents/README.md)
- [`rules/README.md`](rules/README.md)
- [`skills/README.md`](skills/README.md)
- [`vendors/README.md`](vendors/README.md)
- [`gold-sets/product-eval/README.md`](gold-sets/product-eval/README.md)

## Reading heuristics (for phase prompts)

To get all applicable heuristics for a web product:

```bash
# Global (always applies)
cat library/global/*.json | jq -s '.'

# Domain-specific
cat library/domain/web/*.json | jq -s '.'

# Personal taste (if any)
cat library/personal/*.json | jq -s '.' 2>/dev/null || echo '[]'
```

Filter active only:
```bash
cat library/global/*.json | jq -s '[.[] | select(.status == "active")]'
```

## Writing heuristics

### Add a new heuristic
1. Create a JSON file following the schema in `schemas/library-entry-v1.json`.
2. Use a unique, kebab-case `id` (e.g. `nav-persistent`).
3. Place in the correct tier directory (`global/`, `domain/<domain>/`, `personal/`).
4. Set `version: 1`, `status: "active"`.
5. Git commit — git is the version history.

### Update a heuristic
1. Edit the JSON file directly.
2. Increment `version`.
3. Git commit with a message explaining the change.

### Deprecate a heuristic
1. Set `status: "deprecated"` and `deprecated_reason: "<why>"`.
2. Do NOT delete the file — it remains for historical reference.
3. Git commit.

## Conflict detection

Before adding a new heuristic, check for conflicts:

```bash
# Check if ID already exists
grep -rl '"id": "my-new-id"' library/
```

The validation script (`src/launcher/validate-library.sh`) and the schema test in `test/library/` both check for duplicate IDs across tiers, invalid JSON, and missing required fields.

## Judge / pipeline boundary

Most files in this directory are **measurement instruments**. Per the GC.1 boundary, Rouge's self-improvement pipeline cannot edit these files — they're human-authored only. See [`docs/design/self-improve-boundary.md`](../docs/design/self-improve-boundary.md) and `rouge.config.json` `self_improvement.allowlist`/`blocklist` for the enforced file list.

The intent is that Rouge can propose changes to *generation/operational* prompts (the build/fix/document/ship phases) but cannot edit the rubrics, schemas, gold-sets, or reviewer agents that judge its output. This prevents the boiling-frog drift where sequences of individually-defensible edits soften the instrument until real failures stop being caught.

## PO check templates

Templates in `library/templates/` are parameterised quality checks. During seeding, they're instantiated with product-specific parameters.

A template like:
```json
{
  "given": "User is on {screen} viewing {element}",
  "when": "User {action} on {element}",
  "then": "Visual feedback appears within {max_ms}ms"
}
```

becomes:
```json
{
  "given": "User is on /dashboard viewing the trip list",
  "when": "User clicks on the trip list",
  "then": "Visual feedback appears within 200ms"
}
```

Phase prompts handle instantiation by replacing `{parameter}` placeholders with product-specific values from the vision document and spec.
