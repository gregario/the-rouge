# Safety Hooks Design (Open Source)

> Adapted from gstack's safety hook system. Implementation priority: before open source launch.

## Problem

Rouge's guardrails are currently prompt-level instructions ("never deploy to production," "never delete projects," "Stripe test mode only"). These work for a controlled single-user system but are insufficient for open source:

1. **Prompt instructions can be overridden** by context window pressure or conflicting instructions
2. **No audit trail** of which guardrails were active during a cycle
3. **No user customization** — everyone gets the same guardrails regardless of their deployment setup

## Design: Claude Code Hooks

Claude Code supports hooks — shell commands that execute before/after tool calls. These are infrastructure-level, not prompt-level. They run regardless of what the model decides.

### Required Hooks (Always Active)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "rouge-safety-check pre-bash \"$TOOL_INPUT\""
      },
      {
        "matcher": "Write",
        "command": "rouge-safety-check pre-write \"$TOOL_INPUT\""
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "rouge-safety-check post-bash \"$TOOL_OUTPUT\""
      }
    ]
  }
}
```

### `rouge-safety-check` CLI (bash script)

**Pre-Bash checks:**
- Block `rm -rf /` and variants (path traversal outside project)
- Block `git push --force` to production branches
- Block `wrangler deploy` without `--env staging` (production deploy guard)
- Block `stripe` commands without `--test-mode` or test API keys
- Block `supabase` commands that drop/delete databases
- Log the command to `~/.rouge/audit-log.jsonl`

**Pre-Write checks:**
- Block writes to files outside the project directory
- Block writes to `.env` files (credentials must be set manually)
- Block writes to `~/.rouge/telemetry-consent` (user sets this manually)

**Post-Bash checks:**
- Log exit code and (truncated) output to audit log
- Detect error patterns that indicate credential issues → flag for human

### User-Customizable Hooks

Users can add project-specific hooks in `rouge.config.json`:

```json
{
  "safety": {
    "blocked_commands": ["docker rm", "kubectl delete"],
    "allowed_deploy_targets": ["staging", "preview"],
    "custom_pre_hooks": ["./my-safety-check.sh"]
  }
}
```

### Audit Log

Every hook invocation is logged to `~/.rouge/audit-log.jsonl`:

```json
{
  "timestamp": "<ISO 8601>",
  "hook": "pre-bash",
  "project": "<project name>",
  "cycle": 0,
  "phase": "building",
  "command_summary": "wrangler deploy --env staging",
  "verdict": "ALLOW | BLOCK",
  "reason": "<why blocked, if blocked>"
}
```

## gstack Reference

gstack's implementation: safety-hooks skill template, safety check logic.
Key patterns: matcher-based routing, pre/post separation, audit logging, graceful degradation (if hook script is missing, warn but don't block).
