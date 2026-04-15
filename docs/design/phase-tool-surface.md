# Phase Tool Surface Audit

Audit of every `bash` block in `src/prompts/**` as of #103 PR (a). Categorizes each command into: **allow** (Rouge-core whitelist), **route-to-intent** (must go through `INFRA_ACTION_HANDLERS`), or **deny** (must not appear in prompts at all).

## Allow — Rouge-core whitelist

These patterns are used by multiple phases and are safe to grant directly. They go into `.claude/settings.json` under `permissions.allow`.

| Pattern | Used by |
|---|---|
| `Bash(git status)` | 01-building, 00-foundation-building |
| `Bash(git log *)` | 01-building, 00-foundation-building |
| `Bash(git diff *)` | 02c-code-review |
| `Bash(git add *)` | 02a, 02c, 02d, 02e, 02f, 10, 00-foundation-evaluating |
| `Bash(git commit *)` | 02a, 02c, 02d, 02e, 02f, 10, 00-foundation-evaluating |
| `Bash(npm test *)` | final-validation-gate |
| `Bash(npm audit *)` | 02c-code-review |
| `Bash(npx eslint *)` | 02c-code-review |
| `Bash(npx jscpd *)` | 02c-code-review |
| `Bash(npx madge *)` | 02c-code-review |
| `Bash(npx knip *)` | 02c-code-review |
| `Bash(npx @sentry/cli *)` | final-validation-gate |
| `Bash(mkdir -p *)` | 02d, 02f, 10, seeding/02 |
| `Bash(find *)` | 02c-code-review |
| `Bash(jq *)`, `Bash(test *)`, `Bash(xargs *)`, `Bash(wc *)`, `Bash(sort *)`, `Bash(head *)`, `Bash(grep *)` | shell utilities used across walk/evaluation phases |
| `Bash(openspec *)` | seeding/04-spec, 05-change-spec-generation |
| `Bash(src/*.sh *)` | 02-evaluation-orchestrator (rouge-diff-scope.sh, review-readiness.sh) |
| `Bash($B *)` | 02d, 02f, 10, final-gate, seeding/02 (gstack browse binary, path from `$ROUGE_BROWSE_BIN`) |

## Route-to-intent — removed from prompts

These were in prompts but must not be executed by Claude directly. They are handled by the launcher via `pending-action.json` → `INFRA_ACTION_HANDLERS`.

| Previous command | Replaced by intent |
|---|---|
| `npx wrangler versions deploy …` (07-ship-promote rollback) | `rollback-production` (vendor-dispatched) |
| `vercel rollback` (07-ship-promote) | `rollback-production` |
| `vercel deploy`, `vercel link`, `vercel env …` | `deploy-staging`, `deploy-production`, `env-set` (already shipped in Layer 4 Phase 1) |
| `supabase db push`, `supabase functions deploy` | `db-migrate` (already shipped) |
| `supabase projects create` | `provision-database` (to be added in PR (b)) |
| `gh repo create` | `provision-repo` (to be added in PR (b)) |
| `git push …` | `git-push` (already shipped, never allows `force: true`) |

## Deny — must never appear in prompts

Added to `.claude/settings.json` `permissions.deny` so a Claude subprocess is refused if it tries.

| Pattern | Rationale |
|---|---|
| `Bash(vercel *)` | Provider CLI — must route via intent |
| `Bash(supabase *)` | Provider CLI — must route via intent |
| `Bash(gh *)` | GitHub CLI — must route via intent |
| `Bash(wrangler *)`, `Bash(npx wrangler *)` | Cloudflare CLI — must route via intent |
| `Bash(flyctl *)`, `Bash(aws *)`, `Bash(gcloud *)`, `Bash(heroku *)` | Vendor CLIs not yet supported — escalate |
| `Bash(git push *)` | Push only via `git-push` intent (enforces no-force) |
| `Bash(rm -rf *)` | Never destructive mass delete from a prompt |
| `Bash(curl *)`, `Bash(wget *)` | Network fetch only via `web-fetch` intent |

Deny takes precedence over allow per Claude Code permission semantics.

## Footguns noted

- **`$B` expansion.** The browse binary path is stored in `$ROUGE_BROWSE_BIN`. Allow pattern `Bash($B *)` only matches the literal string `$B *`, not the expanded path. PR (b) must either (a) resolve the binary path at spawn time and whitelist the resolved path, or (b) rename the prompt convention to always invoke by absolute path and whitelist `Bash(*/browse *)`. Tracked for PR (b).
- **`eval $(src/rouge-diff-scope.sh main)`** in 02-evaluation-orchestrator. `eval` is a classic footgun. Out of scope for PR (a); noted for a follow-up to replace with `source <(…)` or variable assignment.
- **Compound commands.** Prompts use `&&`, `||`, `|` extensively. Claude Code splits these and matches each leg against the allowlist independently. Every leg must be in the allow list or the whole command is denied. Audit above lists each leg separately.
- **`npx` is not stripped.** `Bash(npx:*)` would be far too broad. Each `npx <tool>` is whitelisted by specific tool name.

## Empirical findings (PR b, 2026-04-16)

Verified against `claude 2.1.110` via `test/launcher/allowed-tools-behavior.test.js`:

1. **Denied Bash pattern in `-p` mode returns a string error; does not hang.** Safe for autonomous loops.
2. **`--dangerously-skip-permissions` does NOT bypass `--disallowedTools`.** Observed: *"The command was denied by your permission settings."* — subprocess continued and said DONE.
3. **Allowed Bash patterns execute without prompts in `-p`.**

Consequence: PR (b) passes `--disallowedTools` alongside `--dangerously-skip-permissions` at every spawn site. Denies enforce immediately; dropping the dangerous flag becomes a PR (c) hardening step, not a prerequisite.

## Vendor extensibility

Vendor-specific deny patterns live in `library/vendors/<vendor>/manifest.json` and are merged into the launcher-constructed `--disallowedTools` at spawn time by `src/launcher/vendors.js` + `src/launcher/tool-permissions.js`. See `docs/contributing/adding-a-vendor.md` and `schemas/vendor-manifest.json`. The Rouge-core denylist in `src/launcher/tool-permissions.js:ROUGE_CORE_DENY` is vendor-agnostic.
