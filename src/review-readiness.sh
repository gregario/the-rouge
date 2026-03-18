#!/usr/bin/env bash
# review-readiness: Read/update the review readiness dashboard in cycle_context.json
# Usage:
#   review-readiness status                     — print dashboard summary
#   review-readiness pass <gate> [score]        — mark a gate as passed
#   review-readiness fail <gate>                — mark a gate as failed
#   review-readiness check                      — exit 0 if all gates passed, exit 1 if not
#
# Gates: test_integrity, qa_gate, ai_code_audit, security_review, a11y_review, design_review, po_review

set -euo pipefail

CONTEXT_FILE="${ROUGE_CONTEXT_FILE:-cycle_context.json}"
ACTION="${1:-status}"
GATE="${2:-}"
SCORE="${3:-}"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "Error: $CONTEXT_FILE not found" >&2
  exit 1
fi

case "$ACTION" in
  status)
    # Print dashboard from cycle_context.json
    python3 -c "
import json, sys
with open('$CONTEXT_FILE') as f:
    ctx = json.load(f)
dash = ctx.get('review_readiness_dashboard', {})
gates = ['test_integrity', 'qa_gate', 'ai_code_audit', 'security_review', 'a11y_review', 'design_review', 'po_review']
all_passed = True
for g in gates:
    info = dash.get(g, {})
    passed = info.get('passed', False)
    ts = info.get('timestamp', '—')
    score = info.get('score', info.get('confidence', ''))
    status = '✓ PASS' if passed else '✗ PENDING'
    score_str = f' (score: {score})' if score else ''
    if not passed:
        all_passed = False
    print(f'  {g:20s} {status}{score_str}  {ts}')
print()
print('CLEARED TO SHIP' if all_passed else 'NOT READY')
"
    ;;

  pass)
    if [ -z "$GATE" ]; then echo "Usage: review-readiness pass <gate> [score]" >&2; exit 1; fi
    python3 -c "
import json, datetime
gate = '$GATE'
score = '$SCORE'
with open('$CONTEXT_FILE') as f:
    ctx = json.load(f)
dash = ctx.setdefault('review_readiness_dashboard', {})
entry = {'passed': True, 'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat()}
if score:
    try:
        entry['score'] = float(score)
    except ValueError:
        entry['confidence'] = float(score) if score.replace('.','').isdigit() else score
dash[gate] = entry
with open('$CONTEXT_FILE', 'w') as f:
    json.dump(ctx, f, indent=2)
print(f'{gate}: PASSED')
"
    ;;

  fail)
    if [ -z "$GATE" ]; then echo "Usage: review-readiness fail <gate>" >&2; exit 1; fi
    python3 -c "
import json, datetime
gate = '$GATE'
with open('$CONTEXT_FILE') as f:
    ctx = json.load(f)
dash = ctx.setdefault('review_readiness_dashboard', {})
dash[gate] = {'passed': False, 'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat()}
with open('$CONTEXT_FILE', 'w') as f:
    json.dump(ctx, f, indent=2)
print(f'{gate}: FAILED')
"
    ;;

  check)
    python3 -c "
import json, sys
with open('$CONTEXT_FILE') as f:
    ctx = json.load(f)
dash = ctx.get('review_readiness_dashboard', {})
gates = ['test_integrity', 'qa_gate', 'ai_code_audit', 'security_review', 'a11y_review', 'design_review', 'po_review']
all_passed = all(dash.get(g, {}).get('passed', False) for g in gates)
sys.exit(0 if all_passed else 1)
"
    ;;

  *)
    echo "Usage: review-readiness {status|pass|fail|check} [gate] [score]" >&2
    exit 1
    ;;
esac
