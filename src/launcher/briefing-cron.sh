#!/usr/bin/env bash
# Writes a trigger file that the launcher detects on next iteration.
# Install: crontab -e → 0 8 * * * /path/to/The-Rouge/src/launcher/briefing-cron.sh
set -euo pipefail

ROUGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "{\"triggered_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$ROUGE_ROOT/trigger-briefing.json"
