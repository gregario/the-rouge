# Rate Limit Budget — Rouge Spec vs Rouge Build

## The Problem

Rouge Spec (interactive seeding via Slack) and Rouge Build (autonomous Karpathy Loop)
share the same Claude Code rate limit budget. If both run simultaneously, they compete.

## Current Behavior

- Claude Code Max plan: rate limit resets at a fixed time (shown in error message)
- Each `claude -p` invocation consumes tokens from the same account
- The launcher doesn't know about active seeding sessions
- The Slack bot doesn't know about active build loops

## Recommendations

### Short-term (V1)
- Don't seed and build simultaneously. Use `/rouge pause` on active builds before seeding.
- If rate limited during seeding, the bot auto-pauses. Resume after reset.
- If rate limited during building, the launcher backs off without counting retries.

### Medium-term
- Launcher checks for active seeding sessions before invoking phases.
  If seeding is active, skip the project and continue to the next.
- Add a `ROUGE_BUDGET_MODE` env var: `seeding-priority` (pause builds during seeding)
  or `build-priority` (queue seeding messages until build loop sleeps).

### Long-term (V2)
- Move to API key billing (`ANTHROPIC_API_KEY`) with separate rate limits.
- Or use separate Claude Code profiles/credentials for Spec and Build.

## Rate Limit Detection

The launcher detects rate limits in stderr (not stdout — phase prompts may
mention "rate limit" in their output text, causing false positives).

Rate limits do NOT count toward the 3-retry limit. They trigger exponential
backoff (60s, 120s, 180s) without incrementing the retry counter.
