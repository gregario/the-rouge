#!/usr/bin/env bash
# Maps a state name to its phase prompt file path.
# Usage: state-to-prompt.sh <state>
# Returns: absolute path to the prompt file, or exits 1 if not executable state.
set -euo pipefail

PROMPT_DIR="$(cd "$(dirname "$0")/../prompts" && pwd)"
STATE="${1:?Usage: state-to-prompt.sh <state>}"

case "$STATE" in
  seeding)           echo "$PROMPT_DIR/seeding/00-swarm-orchestrator.md" ;;
  building)          echo "$PROMPT_DIR/loop/01-building.md" ;;
  test-integrity)    echo "$PROMPT_DIR/loop/02a-test-integrity.md" ;;
  qa-gate)           echo "$PROMPT_DIR/loop/02b-qa-gate.md" ;;
  qa-fixing)         echo "$PROMPT_DIR/loop/03-qa-fixing.md" ;;
  po-reviewing)      echo "$PROMPT_DIR/loop/02c-po-review.md" ;;
  analyzing)         echo "$PROMPT_DIR/loop/04-analyzing.md" ;;
  generating-change-spec) echo "$PROMPT_DIR/loop/05-change-spec-generation.md" ;;
  vision-checking)   echo "$PROMPT_DIR/loop/06-vision-check.md" ;;
  promoting)         echo "$PROMPT_DIR/loop/07-ship-promote.md" ;;
  rolling-back)      echo "$PROMPT_DIR/loop/07-ship-promote.md" ;;
  ready|waiting-for-human|complete) exit 1 ;;
  *)                 echo "Unknown state: $STATE" >&2; exit 1 ;;
esac
