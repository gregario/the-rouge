#!/usr/bin/env bash
# Send notifications via Slack webhook.
# Usage: notify.sh <message>
#        notify.sh --block-kit <json-file>
set -euo pipefail

WEBHOOK="${ROUGE_SLACK_WEBHOOK:?Set ROUGE_SLACK_WEBHOOK env var}"

if [[ "${1:-}" == "--block-kit" ]]; then
  curl -s -X POST "$WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d @"${2:?JSON file required}"
else
  curl -s -X POST "$WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg text "$*" '{text: $text}')"
fi
