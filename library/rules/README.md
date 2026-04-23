# Rules

Per-language and cross-cutting constraints that the factory phase must respect. Loaded into factory preamble based on the active product's stack.

## Shape

```
library/rules/
  common/                      # language-agnostic
  typescript/
  python/
  rust/
  golang/
  web/                         # HTML/CSS/accessibility
  <language>/
```

Each rule is a markdown file with YAML frontmatter:

```yaml
---
id: typescript-strict-mode
name: TypeScript strict mode required
applies_to: [typescript, javascript]
severity: blocking             # blocking | warning | informational
tier: language                 # language | framework | cross-cutting
---
```

## Loading

The preamble-injector reads `cycle_context.active_spec.infrastructure.primary_language` and loads:

1. `library/rules/common/*.md` (always)
2. `library/rules/<primary_language>/*.md`
3. `library/rules/web/*.md` if stack targets a browser

Fallback: if primary_language is unknown or directory doesn't exist, load only common/.

## Validation

`node scripts/ci/validate-rules.js` checks frontmatter and confirms `applies_to` values match directory location.
