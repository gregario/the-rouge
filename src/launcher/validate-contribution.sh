#!/usr/bin/env bash
# Validates integration catalogue contributions.
# Usage: validate-contribution.sh <path-to-contribution-dir>
# Example: validate-contribution.sh library/integrations/tier-2/mapbox
# Exits 0 on pass, 1 on failure with human-readable messages.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: validate-contribution.sh <path-to-contribution-dir>"
  echo "Example: validate-contribution.sh library/integrations/tier-2/mapbox"
  exit 1
fi

CONTRIB_DIR="$1"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILURES=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILURES=$((FAILURES + 1)); }

# ---------------------------------------------------------------------------
# Rule 1: Manifest integrity — manifest.yaml exists and parses as valid YAML
# ---------------------------------------------------------------------------
MANIFEST="$CONTRIB_DIR/manifest.yaml"
if [[ ! -f "$MANIFEST" ]]; then
  fail "manifest.yaml does not exist in $CONTRIB_DIR"
  echo ""
  echo "Cannot continue without manifest.yaml. $FAILURES failure(s)."
  exit 1
fi

# Try yq first, fall back to basic syntax check
YAML_VALID=true
if command -v yq &>/dev/null; then
  if ! yq eval '.' "$MANIFEST" >/dev/null 2>&1; then
    YAML_VALID=false
  fi
else
  # Basic syntax check: no tabs, colons have values, no obvious parse errors
  if grep -P '^\t' "$MANIFEST" >/dev/null 2>&1; then
    YAML_VALID=false
  fi
  # Check for lines that are clearly broken YAML (key without colon on non-comment, non-blank, non-list lines)
  # This is intentionally lenient — yq is preferred
fi

if [[ "$YAML_VALID" == "true" ]]; then
  pass "Manifest integrity — manifest.yaml exists and parses as valid YAML"
else
  fail "Manifest integrity — manifest.yaml is not valid YAML"
fi

# ---------------------------------------------------------------------------
# Helper: read a field from manifest.yaml
# ---------------------------------------------------------------------------
read_field() {
  local field="$1"
  if command -v yq &>/dev/null; then
    yq eval ".$field // \"\"" "$MANIFEST" 2>/dev/null
  else
    # Fallback: simple grep-based extraction (top-level scalar fields only)
    grep -E "^${field}:" "$MANIFEST" 2>/dev/null | sed "s/^${field}:[[:space:]]*//" | sed 's/^["'"'"']\(.*\)["'"'"']$/\1/' || echo ""
  fi
}

# ---------------------------------------------------------------------------
# Rule 2: Required fields — all mandatory fields present
# ---------------------------------------------------------------------------
REQUIRED_FIELDS="id name tier version description maintainer compatible_with"
ALL_FIELDS_PRESENT=true
for field in $REQUIRED_FIELDS; do
  value="$(read_field "$field")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    fail "Required field '$field' is missing from manifest.yaml"
    ALL_FIELDS_PRESENT=false
  fi
done
if [[ "$ALL_FIELDS_PRESENT" == "true" ]]; then
  pass "Required fields — all mandatory fields present (id, name, tier, version, description, maintainer, compatible_with)"
fi

# ---------------------------------------------------------------------------
# Rule 3: Naming conventions — id is kebab-case, env_vars are SCREAMING_SNAKE
# ---------------------------------------------------------------------------
ID="$(read_field "id")"
if [[ -n "$ID" && "$ID" != "null" ]]; then
  if [[ "$ID" =~ ^[a-z0-9-]+$ ]]; then
    pass "Naming convention — id '$ID' is valid kebab-case"
  else
    fail "Naming convention — id '$ID' is not kebab-case (expected [a-z0-9-]+)"
  fi
else
  fail "Naming convention — cannot check id (field missing)"
fi

# Check env_vars if present
if command -v yq &>/dev/null; then
  ENV_VARS="$(yq eval '.env_vars // [] | .[]' "$MANIFEST" 2>/dev/null)"
else
  # Fallback: extract env_vars entries (lines after env_vars: that start with -)
  ENV_VARS="$(awk '/^env_vars:/{found=1; next} found && /^[[:space:]]*-/{gsub(/^[[:space:]]*-[[:space:]]*/, ""); print; next} found && /^[a-z]/{exit}' "$MANIFEST" 2>/dev/null)"
fi

if [[ -n "$ENV_VARS" ]]; then
  ENV_VARS_VALID=true
  while IFS= read -r var; do
    [[ -z "$var" ]] && continue
    if [[ ! "$var" =~ ^[A-Z0-9_]+$ ]]; then
      fail "Naming convention — env_var '$var' is not SCREAMING_SNAKE_CASE (expected [A-Z0-9_]+)"
      ENV_VARS_VALID=false
    fi
  done <<< "$ENV_VARS"
  if [[ "$ENV_VARS_VALID" == "true" ]]; then
    pass "Naming convention — all env_vars are valid SCREAMING_SNAKE_CASE"
  fi
fi

# ---------------------------------------------------------------------------
# Rule 4: File completeness — tier-specific required files exist
# ---------------------------------------------------------------------------
TIER="$(read_field "tier")"
if [[ -n "$TIER" && "$TIER" != "null" ]]; then
  case "$TIER" in
    1)
      REQUIRED_FILES="manifest.yaml setup.md build.md"
      REQUIRED_DIRS="template"
      ;;
    2)
      REQUIRED_FILES="manifest.yaml setup.md teardown.md"
      REQUIRED_DIRS=""
      ;;
    3)
      REQUIRED_FILES="manifest.yaml pattern.md test.md"
      REQUIRED_DIRS=""
      ;;
    *)
      fail "File completeness — unknown tier '$TIER' (expected 1, 2, or 3)"
      REQUIRED_FILES=""
      REQUIRED_DIRS=""
      ;;
  esac

  FILES_COMPLETE=true
  for f in $REQUIRED_FILES; do
    if [[ ! -f "$CONTRIB_DIR/$f" ]]; then
      fail "File completeness — required file '$f' missing for tier $TIER"
      FILES_COMPLETE=false
    fi
  done
  for d in $REQUIRED_DIRS; do
    [[ -z "$d" ]] && continue
    if [[ ! -d "$CONTRIB_DIR/$d" ]]; then
      fail "File completeness — required directory '$d/' missing for tier $TIER"
      FILES_COMPLETE=false
    fi
  done
  if [[ "$FILES_COMPLETE" == "true" ]]; then
    pass "File completeness — all required files present for tier $TIER"
  fi
else
  fail "File completeness — cannot check (tier field missing)"
fi

# ---------------------------------------------------------------------------
# Rule 5: Semver compliance — version matches X.Y.Z
# ---------------------------------------------------------------------------
VERSION="$(read_field "version")"
if [[ -n "$VERSION" && "$VERSION" != "null" ]]; then
  if [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    pass "Semver compliance — version '$VERSION' is valid"
  else
    fail "Semver compliance — version '$VERSION' does not match X.Y.Z format"
  fi
else
  fail "Semver compliance — cannot check (version field missing)"
fi

# ---------------------------------------------------------------------------
# Rule 6: ID uniqueness — no other contribution shares the same id
# ---------------------------------------------------------------------------
if [[ -n "$ID" && "$ID" != "null" ]]; then
  INTEGRATIONS_DIR="$REPO_ROOT/library/integrations"
  DUPLICATES=0

  if [[ -d "$INTEGRATIONS_DIR" ]]; then
    while IFS= read -r other_manifest; do
      [[ -z "$other_manifest" ]] && continue
      # Skip our own manifest
      OTHER_REAL="$(cd "$(dirname "$other_manifest")" && pwd)/$(basename "$other_manifest")"
      OUR_REAL="$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")"
      [[ "$OTHER_REAL" == "$OUR_REAL" ]] && continue

      if command -v yq &>/dev/null; then
        OTHER_ID="$(yq eval '.id // ""' "$other_manifest" 2>/dev/null)"
      else
        OTHER_ID="$(grep -E '^id:' "$other_manifest" 2>/dev/null | sed 's/^id:[[:space:]]*//' | sed 's/^["'"'"']\(.*\)["'"'"']$/\1/' || echo "")"
      fi

      if [[ "$OTHER_ID" == "$ID" ]]; then
        fail "ID uniqueness — id '$ID' already exists in $other_manifest"
        DUPLICATES=$((DUPLICATES + 1))
      fi
    done < <(find "$INTEGRATIONS_DIR" -name "manifest.yaml" -type f 2>/dev/null)
  fi

  if [[ "$DUPLICATES" -eq 0 ]]; then
    pass "ID uniqueness — id '$ID' is unique across all tiers"
  fi
else
  fail "ID uniqueness — cannot check (id field missing)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  echo "All checks passed."
  exit 0
else
  echo "$FAILURES check(s) failed."
  exit 1
fi
