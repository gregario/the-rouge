# Contribution Standard for Stacks, Services, and Integrations

> GitHub Issue: #14. Defines the contract for community contributions to the Rouge catalogue.

## Problem

The Rouge's library supports tiered contributions -- stacks (Tier 1), services (Tier 2), and integrations (Tier 3). Without a formal standard, contributed entries will be inconsistent in structure, incomplete in documentation, and impossible to validate automatically. Phase prompts need to discover and parse contributions at runtime, which requires a machine-readable contract.

Every contribution must be: machine-parseable (YAML manifest), testable (validation script), documented (required markdown files), and compatible with the phase prompt system (discoverable by the launcher).

## Manifest Schema

Every contribution includes a `manifest.yaml` at its root:

```yaml
id: supabase                          # unique, kebab-case
name: Supabase                        # human-readable
tier: 2                               # 1=stack, 2=service, 3=integration
version: 1.0.0                        # semver
description: PostgreSQL database with auth, real-time, and storage
maintainer: community                 # community | core
requires:
  env_vars: [SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY]
  packages: ["@supabase/supabase-js"]
  cli_tools: [supabase]
compatible_with: [nextjs-cloudflare, react-vite]  # stack IDs
cost_tier: free                       # free | paid
```

Required fields: `id`, `name`, `tier`, `version`, `description`, `maintainer`, `compatible_with`.
Optional fields: `requires`, `cost_tier` (defaults to `free`).

The `id` must be globally unique across all tiers. The `compatible_with` list references Tier 1 stack IDs. Tier 1 stacks use `compatible_with: [all]` or omit it.

## Required Files per Tier

### Tier 1 -- Stack

Stacks define a full project scaffold (framework, build tool, deployment target).

```
library/integrations/tier-1/<id>/
  manifest.yaml          # manifest
  setup.md               # scaffolding steps (commands, file structure)
  build.md               # build, test, deploy commands
  template/              # project template files (copied during seeding)
```

### Tier 2 -- Service

Services provide external capabilities consumed by stacks (databases, auth, payments).

```
library/integrations/tier-2/<id>/
  manifest.yaml          # manifest
  setup.md               # provisioning steps (API keys, dashboard config)
  teardown.md            # pause/delete instructions (cost control)
  patterns/              # common usage patterns as markdown files
```

### Tier 3 -- Integration

Integrations are lightweight code patterns that connect services or add capabilities.

```
library/integrations/tier-3/<id>/
  manifest.yaml          # manifest
  pattern.md             # code pattern with explanation
  test.md                # how to verify the integration works
```

## Validation Rules

The `rouge validate-contribution <path>` command checks:

1. **Manifest integrity** -- `manifest.yaml` parses as valid YAML, all required fields present, `tier` is 1/2/3.
2. **File completeness** -- All required files for the declared tier exist.
3. **Naming conventions** -- `id` is kebab-case, `env_vars` entries are SCREAMING_SNAKE_CASE.
4. **Reference validity** -- Every entry in `compatible_with` matches an existing Tier 1 stack ID (or is `all`).
5. **Semver compliance** -- `version` follows semver format (MAJOR.MINOR.PATCH).
6. **ID uniqueness** -- No other contribution across any tier shares the same `id`.

Exit code 0 on pass, non-zero with human-readable error messages on failure.

## Submission Process

1. Fork the repository.
2. Add contribution under `library/integrations/tier-N/<id>/`.
3. Run `rouge validate-contribution library/integrations/tier-N/<id>/` locally.
4. Open a PR against `main`. Description must include: what the contribution enables, which stacks it targets, and whether it introduces paid dependencies.

Review policy:
- **Tier 1 (stacks)**: Core team review required. Stacks affect seeding and the entire loop.
- **Tier 2 (services)**: Core team review required. Services introduce external dependencies.
- **Tier 3 (integrations)**: Community review sufficient. Two approvals from any contributors.

## Discovery by Phase Prompts

Phase prompts discover contributions by reading manifests:

```bash
# Find all services compatible with a stack
for f in library/integrations/tier-2/*/manifest.yaml; do
  yq '.compatible_with[] | select(. == "nextjs-cloudflare" or . == "all")' "$f" && echo "$f"
done
```

The launcher assembles applicable contributions into `cycle_context.json` during seeding based on the product's declared stack.

## Implementation Plan

1. **Validation script** (`src/launcher/validate-contribution.sh`) -- Bash + yq. Implements the six validation rules above.
2. **CI integration** -- GitHub Actions workflow that runs validation on any PR touching `library/integrations/`.
3. **Seed contributions** -- Ship with at least one example per tier (e.g., `nextjs-cloudflare` for Tier 1, `supabase` for Tier 2, `posthog-analytics` for Tier 3).
4. **CONTRIBUTING.md update** -- Add a section pointing to this standard.
5. **Library README update** -- Document the `integrations/` directory alongside existing `global/`, `domain/`, `personal/`, `templates/`.
