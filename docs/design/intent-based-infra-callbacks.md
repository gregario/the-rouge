# Intent-Based Infrastructure Callbacks — Design Document

**Date:** 2026-04-12
**Status:** PROPOSAL — awaiting implementation
**Issue:** #103 Layer 4
**Prerequisites:** Layer 1 (prompt isolation rules) ✅, Layer 2 (provider-agnostic prompts) ✅, Layer 3 (--add-dir scoping) ✅

## Problem

Rouge runs `claude -p --dangerously-skip-permissions` with full filesystem and shell access. Claude can execute any command — including `vercel deploy`, `supabase db push`, `git push --force`, `rm -rf /`, and any other destructive operation. Layers 1-3 reduce the LIKELIHOOD of accidents but don't PREVENT them:

- Layer 1 tells Claude not to (prompt rules — ignorable)
- Layer 2 removes provider-specific commands from prompts (but Claude can still run them)
- Layer 3 scopes `--add-dir` to reduce accidental directory discovery (but Claude can still `cd /`)

Layer 4 is the architectural change that makes destructive infrastructure operations **physically impossible** from inside the Claude subprocess.

## Design Principle

**Claude writes intent. The launcher executes.**

Instead of Claude running `npx vercel deploy --yes --prod` directly, Claude writes a structured intent to a file:

```json
// state.json or a new intent file
{
  "pending_action": {
    "type": "deploy-staging",
    "target": "vercel",
    "project_dir": ".",
    "timestamp": "2026-04-12T..."
  }
}
```

The Claude subprocess exits. The launcher reads the intent, validates it against the project's `infrastructure_manifest.json`, and executes the command on Claude's behalf. If the intent is invalid (unknown action, wrong target, not allowed by config), the launcher refuses and logs the refusal.

## Architecture

```
┌─────────────────────────────────────┐
│ Claude subprocess (sandboxed)       │
│                                     │
│ Can: write code, run tests,         │
│      read files, git add/commit     │
│                                     │
│ Cannot: deploy, manage DB,          │
│         push to remote, manage      │
│         cloud resources             │
│                                     │
│ Signals intent by writing to:       │
│   state.json → pending_action       │
│   OR pending-action.json            │
└──────────────┬──────────────────────┘
               │ subprocess exits
               ▼
┌─────────────────────────────────────┐
│ Launcher (rouge-loop.js)            │
│                                     │
│ Reads pending_action                │
│ Validates against:                  │
│   - infrastructure_manifest.json    │
│   - rouge.config.json               │
│   - allowed_actions whitelist       │
│                                     │
│ Executes the validated action       │
│ Writes result back to state.json    │
│                                     │
│ Then invokes next Claude phase      │
└─────────────────────────────────────┘
```

## Action Catalogue

### Tier 1 — Deploy operations

| Action type | Parameters | Validator | Executor |
|---|---|---|---|
| `deploy-staging` | `target` | Must match `vision.json.infrastructure.deployment_target` | `deploy-to-staging.js` (already exists) |
| `deploy-production` | `target` | Must match target + require `shipping` state | `deploy-to-staging.js` with production flag |

### Tier 2 — Database operations

| Action type | Parameters | Validator | Executor |
|---|---|---|---|
| `db-migrate` | `provider`, `project_ref` | Must match `infrastructure_manifest.json.database.provider` | Provider-specific: `supabase db push`, `drizzle-kit migrate`, etc. |
| `db-seed` | `script` | Script must be in project dir, not absolute path | `node <script>` in project dir |

### Tier 3 — Git operations

| Action type | Parameters | Validator | Executor |
|---|---|---|---|
| `git-push` | `remote`, `branch` | NEVER `--force`. Remote must be `origin`. Branch must match state.json branch. | `git push origin <branch>` |
| `git-tag` | `tag_name` | Must match milestone tag pattern | `git tag <name>` |

### Tier 4 — Cloud resource management

| Action type | Parameters | Validator | Executor |
|---|---|---|---|
| `create-github-repo` | `name`, `private` | Must be private. Name must match project slug. | `gh repo create` |
| `create-supabase-project` | `name`, `region` | Must match infra manifest. Check slot availability. | Supabase API |
| `link-vercel-project` | `name` | Must create NEW, never adopt existing (Layer 1 rule) | `vercel link` |

## Intent Protocol

### Writing intent (Claude side)

The building prompt instructs Claude to write intent instead of executing commands:

```markdown
## Infrastructure Operations

You CANNOT execute infrastructure commands directly (deploy, migrate, push).
Instead, write your intent to `pending-action.json`:

{
  "action": "<action-type>",
  "params": { ... },
  "reason": "Why this action is needed at this point in the build"
}

Then exit. The launcher will validate and execute the action, writing the
result to `action-result.json`. On your next invocation, read the result
to see if the action succeeded.
```

### Reading result (Claude side)

After the launcher executes (or refuses), it writes:

```json
// action-result.json
{
  "action": "deploy-staging",
  "status": "success",
  "result": {
    "url": "https://my-product.vercel.app",
    "timestamp": "2026-04-12T..."
  }
}
```

Or on failure:

```json
{
  "action": "deploy-staging",
  "status": "refused",
  "reason": "deployment_target is 'vercel' but action requested 'cloudflare'"
}
```

### Launcher-side handler

In `rouge-loop.js`, after each phase returns:

```js
// Check for pending infrastructure action
const actionFile = path.join(projectDir, 'pending-action.json');
if (fs.existsSync(actionFile)) {
  const action = readJson(actionFile);
  const result = executeInfraAction(action, projectDir, state);
  writeJson(path.join(projectDir, 'action-result.json'), result);
  fs.unlinkSync(actionFile); // consumed
}
```

## Dropping --dangerously-skip-permissions

Once Layer 4 is implemented, the Claude subprocess no longer needs unrestricted shell access. The `--allowedTools` flag restricts what Claude can do:

```js
const ALLOWED_TOOLS = [
  'Bash(npm:* node:* npx:vitest npx:tsc git:add git:commit git:status git:diff git:log)',
  'Edit', 'Write', 'Read', 'Grep', 'Glob',
];

spawn('claude', [
  '-p',
  '--allowedTools', ALLOWED_TOOLS.join(','),
  '--add-dir', promptsDir,
  '--add-dir', libraryDir,
  // NO --dangerously-skip-permissions
], { cwd: projectDir });
```

Claude can:
- Run npm/node/vitest/tsc (build + test)
- Use git add/commit/status/diff/log (local version control)
- Read, write, edit, grep, glob (file operations)

Claude CANNOT:
- Run vercel/wrangler/supabase/gh (cloud operations)
- Run git push (remote operations)
- Run rm -rf, kill, or other destructive system commands
- Access files outside the project dir + whitelisted prompt dirs

## Migration Plan

### Phase 1: Intent writing (backwards-compatible)

1. Add `pending-action.json` support to `rouge-loop.js` — read after each phase, execute if present
2. Add `action-result.json` writing
3. Update building prompts to PREFER intent-writing over direct commands
4. Keep `--dangerously-skip-permissions` — Claude can still run commands directly as a fallback

This phase is safe: if Claude writes intent, the launcher handles it. If Claude runs the command directly (old behaviour), it still works.

### Phase 2: Enforce intent-only

1. Drop `--dangerously-skip-permissions`
2. Add `--allowedTools` whitelist
3. Update all prompts to REQUIRE intent-writing (remove "as a fallback, you can run...")
4. Test with 2-3 real builds to verify nothing is missing from the whitelist

### Phase 3: Audit + harden

1. Log all intents to `interventions.jsonl` for audit trail
2. Add cost estimation to deploy actions (estimated deploy cost before executing)
3. Add confirmation prompts for Tier 4 actions (create cloud resources) — launcher asks human via dashboard/Slack before executing
4. Rate-limit actions per cycle (max 3 deploys, max 1 repo create, etc.)

## Implementation Checklist

### Phase 1

- [ ] Add `executeInfraAction(action, projectDir, state)` function to rouge-loop.js
- [ ] Register handlers for: deploy-staging, deploy-production, db-migrate, db-seed, git-push, git-tag
- [ ] Add pending-action.json reader after each phase in the main loop
- [ ] Add action-result.json writer
- [ ] Update 01-building.md to document intent-writing protocol
- [ ] Update 00-foundation-building.md to document intent-writing protocol
- [ ] Update 07-ship-promote.md to use intent for production deploy
- [ ] Add tests: valid action dispatches correctly, invalid action is refused, unknown action type errors cleanly
- [ ] Test with a real build (keep --dangerously-skip-permissions as fallback)

### Phase 2

- [ ] Remove --dangerously-skip-permissions from claude invocation
- [ ] Add --allowedTools whitelist
- [ ] Update all prompts: remove direct command references, require intent-writing
- [ ] Test with 2-3 real builds
- [ ] Document the whitelist in docs/design/

### Phase 3

- [ ] Log all intents to interventions.jsonl
- [ ] Add confirmation for Tier 4 actions via dashboard
- [ ] Add rate limiting per cycle
- [ ] Cost estimation for deploy actions

## Risk Assessment

### What could break

1. **Missing tool in whitelist.** If Claude needs a tool that's not in `--allowedTools`, the build fails with a permissions error. Mitigation: Phase 1 runs with fallback permissions; Phase 2 only drops them after real-build testing.

2. **Intent protocol too verbose.** If writing intent + reading result is significantly slower than running commands directly, build cycles take longer. Mitigation: the action execution adds ~5-10s per infrastructure operation, which is negligible compared to the ~10-min Claude phases.

3. **Claude ignores intent protocol.** If a prompt update accidentally reintroduces direct commands, Claude tries to run them and gets blocked. Mitigation: the error message says "use pending-action.json instead" with a reference to the protocol docs.

4. **Edge cases in --allowedTools.** Some npm scripts run arbitrary commands (postinstall, prepare). These may need specific whitelisting. Mitigation: test common build patterns before Phase 2.

### What this does NOT solve

- **File system access.** Claude can still read/write any file in the project dir. Intent-based callbacks only cover INFRASTRUCTURE operations, not file operations.
- **Prompt injection.** A compromised dependency could write a malicious `pending-action.json`. Mitigation: validate all action parameters strictly.
- **Network access.** Claude can still `curl` or `fetch` from within npm scripts. Restricting network access requires containerisation (#84), not tool whitelisting.

## Relationship to Other Issues

- **#103 Layers 1-3**: prerequisites, all complete
- **#84 (containerised execution)**: Layer 4 is a SOFTWARE boundary; #84 is a HARDWARE boundary (containers). Both are valuable. Layer 4 is implementable now; #84 requires infrastructure decisions.
- **#61 (sandbox architecture)**: closed as superseded by #84. Layer 4 is the non-container approach to the same goal.
- **#94 (dashboard control plane)**: the dashboard's `resolve-escalation` endpoint is an example of the intent pattern — human writes intent, system executes. Layer 4 extends this to Claude.

## Timeline Estimate

- Phase 1: 4-6 hours (add intent reader/writer, register handlers, update prompts, test)
- Phase 2: 2-3 hours (drop permissions, add whitelist, test with real builds)
- Phase 3: 2-3 hours (audit logging, confirmation prompts, rate limiting)

Total: ~8-12 hours across 3 PRs.
