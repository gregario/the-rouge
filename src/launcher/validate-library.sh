#!/usr/bin/env bash
# Validates Library heuristic files: no duplicate IDs, valid JSON, required fields.
# Usage: validate-library.sh [library-dir]
set -euo pipefail

LIBRARY_DIR="${1:-$(cd "$(dirname "$0")/../../library" && pwd)}"
ERRORS=0
IDS=()

validate_file() {
  local file="$1"

  # Check valid JSON
  if ! jq empty "$file" 2>/dev/null; then
    echo "ERROR: Invalid JSON: $file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  # Skip non-heuristic files (README, templates, .gitkeep)
  local id
  id="$(jq -r '.id // empty' "$file")" || return 0
  [[ -n "$id" ]] || return 0

  # Check required fields
  for field in id name rule measurement threshold type tier status; do
    if [[ "$(jq -r ".$field // empty" "$file")" == "" ]]; then
      echo "ERROR: Missing required field '$field' in $file"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Check for duplicate IDs
  for existing in "${IDS[@]+"${IDS[@]}"}"; do
    if [[ "$existing" == "$id" ]]; then
      echo "ERROR: Duplicate ID '$id' in $file"
      ERRORS=$((ERRORS + 1))
    fi
  done
  IDS+=("$id")

  # Check measurement.type is valid
  local mtype
  mtype="$(jq -r '.measurement.type // empty' "$file")"
  case "$mtype" in
    dom-analysis|screenshot-llm|lighthouse-metric|interaction-test|journey-test|api-test|code-analysis|count) ;;
    "") echo "ERROR: Missing measurement.type in $file"; ERRORS=$((ERRORS + 1)) ;;
    *) echo "WARNING: Unknown measurement.type '$mtype' in $file" ;;
  esac
}

# Validate all JSON files in library (except templates/ and README)
for file in "$LIBRARY_DIR"/global/*.json "$LIBRARY_DIR"/domain/*/*.json "$LIBRARY_DIR"/personal/*.json; do
  [[ -f "$file" ]] || continue
  validate_file "$file"
done

echo ""
echo "Validated ${#IDS[@]} heuristics. Errors: $ERRORS"
[[ "$ERRORS" -eq 0 ]] && exit 0 || exit 1
