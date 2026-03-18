#!/usr/bin/env bash
# Maps a state to the Claude model to use.
# Usage: model-for-state.sh <state>
set -euo pipefail

STATE="${1:?Usage: model-for-state.sh <state>}"

case "$STATE" in
  building|qa-fixing|po-reviewing|analyzing|generating-change-spec|vision-checking)
    echo "opus" ;;
  test-integrity|qa-gate|promoting|rolling-back)
    echo "sonnet" ;;
  *)
    echo "sonnet" ;;
esac
