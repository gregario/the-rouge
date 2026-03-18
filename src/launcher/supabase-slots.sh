#!/usr/bin/env bash
# Supabase free tier slot management (2 active project limit).
# Usage: supabase-slots.sh check|pause <ref>|restore <ref>|status <ref>|wait-for <ref> <status>
set -euo pipefail

get_token() {
  # V1 (macOS): extract from keychain
  if command -v security &>/dev/null; then
    local raw
    raw="$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)" || true
    if [[ -n "$raw" ]]; then
      echo "$raw" | base64 -d 2>/dev/null || echo "$raw"
      return
    fi
  fi
  # V2 (Linux/Docker): env var
  echo "${SUPABASE_ACCESS_TOKEN:-}"
}

api() {
  local method="$1" path="$2"
  shift 2
  local token
  token="$(get_token)"
  [[ -n "$token" ]] || { echo "No Supabase token found" >&2; return 1; }
  curl -s -X "$method" "https://api.supabase.com/v1$path" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    "$@"
}

CMD="${1:-help}"

case "$CMD" in
  check)
    # Count active (non-paused) projects
    api GET "/projects" | jq '[.[] | select(.status == "ACTIVE_HEALTHY" or .status == "COMING_UP")] | length'
    ;;
  pause)
    REF="${2:?Usage: supabase-slots.sh pause <project-ref>}"
    api POST "/projects/$REF/pause"
    echo "Pause requested for $REF"
    ;;
  restore)
    REF="${2:?Usage: supabase-slots.sh restore <project-ref>}"
    api POST "/projects/$REF/restore"
    echo "Restore requested for $REF"
    ;;
  status)
    REF="${2:?Usage: supabase-slots.sh status <project-ref>}"
    api GET "/projects/$REF" | jq -r '.status'
    ;;
  wait-for)
    REF="${2:?Usage: supabase-slots.sh wait-for <project-ref> <target-status>}"
    TARGET="${3:?Usage: supabase-slots.sh wait-for <project-ref> <target-status>}"
    for i in $(seq 1 30); do
      CURRENT="$(api GET "/projects/$REF" | jq -r '.status')"
      if [[ "$CURRENT" == "$TARGET" ]]; then
        echo "$TARGET"
        exit 0
      fi
      echo "Waiting... ($CURRENT → $TARGET) [$i/30]" >&2
      sleep 10
    done
    echo "Timeout waiting for $TARGET (current: $CURRENT)" >&2
    exit 1
    ;;
  help|*)
    echo "Supabase slot management (2 active project limit)"
    echo ""
    echo "Usage:"
    echo "  supabase-slots.sh check                      Count active projects"
    echo "  supabase-slots.sh pause <ref>                Pause a project"
    echo "  supabase-slots.sh restore <ref>              Restore a paused project"
    echo "  supabase-slots.sh status <ref>               Get project status"
    echo "  supabase-slots.sh wait-for <ref> <status>    Poll until target status (max 5min)"
    ;;
esac
