#!/usr/bin/env bash
# Check for auth tokens approaching expiry. Run on launcher startup.
set -euo pipefail

WARN_DAYS="${ROUGE_AUTH_WARN_DAYS:-7}"
NOW=$(date +%s)
WARNINGS=""

check_stripe() {
  local config="$HOME/.config/stripe/config.toml"
  [[ -f "$config" ]] || return 0
  local expiry
  expiry="$(grep 'test_mode_key_expires_at' "$config" | head -1 | sed "s/.*= *['\"]*//" | sed "s/['\"]*//")" || return 0
  [[ -n "$expiry" ]] || return 0
  local expiry_epoch
  # macOS date
  expiry_epoch="$(date -j -f "%Y-%m-%d" "$expiry" +%s 2>/dev/null)" || \
  # Linux date
  expiry_epoch="$(date -d "$expiry" +%s 2>/dev/null)" || return 0
  local days_left=$(( (expiry_epoch - NOW) / 86400 ))
  if [[ $days_left -le $WARN_DAYS ]]; then
    WARNINGS="${WARNINGS}⚠️ Stripe CLI key expires in ${days_left} days ($expiry). Run 'stripe login' to renew.\n"
  fi
}

check_stripe

if [[ -n "$WARNINGS" ]]; then
  echo -e "$WARNINGS"
fi
