# The Rouge Library

File-based quality heuristic storage. Phase prompts read these files directly.

## Directory Structure

```
library/
├── global/           # Standards that apply to all products
├── domain/
│   ├── web/          # Web-specific heuristics
│   ├── game/         # Game-specific heuristics
│   └── artifact/     # Artifact-specific heuristics (books, images, etc.)
├── personal/         # Personal taste fingerprint entries
├── templates/        # PO check templates (parameterized)
└── README.md         # This file
```

## Reading Heuristics (for phase prompts)

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

## Writing Heuristics

### Add a new heuristic
1. Create a JSON file following the schema in `schemas/library-entry.json`
2. Use a unique, kebab-case `id` (e.g., `nav-persistent`)
3. Place in the correct tier directory (`global/`, `domain/<domain>/`, `personal/`)
4. Set `version: 1`, `status: "active"`
5. Git commit — git provides the version history

### Update a heuristic
1. Edit the JSON file directly
2. Increment `version`
3. Git commit with a message explaining the change

### Deprecate a heuristic
1. Set `status: "deprecated"` and `deprecated_reason: "<why>"`
2. Do NOT delete the file — it remains for historical reference
3. Git commit

## Version History

Git IS the version history. To see a heuristic's evolution:

```bash
git log --oneline -- library/global/three-click-rule.json
git diff HEAD~5 -- library/global/three-click-rule.json
```

## Conflict Detection

Before adding a new heuristic, check for conflicts:

```bash
# Check if ID already exists
grep -rl '"id": "my-new-id"' library/
```

The validation script (`src/launcher/validate-library.sh`) checks for:
- Duplicate IDs across all tiers
- Invalid JSON files
- Missing required fields

## PO Check Templates

Templates in `library/templates/` are parameterized quality checks. During seeding, they are instantiated with product-specific parameters.

### Instantiation

A template like:
```json
{
  "given": "User is on {screen} viewing {element}",
  "when": "User {action} on {element}",
  "then": "Visual feedback appears within {max_ms}ms"
}
```

Gets instantiated to:
```json
{
  "given": "User is on /dashboard viewing the trip list",
  "when": "User clicks on the trip list",
  "then": "Visual feedback appears within 200ms"
}
```

Phase prompts handle instantiation by replacing `{parameter}` placeholders with product-specific values from the vision document and spec.
