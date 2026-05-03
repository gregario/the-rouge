# LLM Provider Support + Rate-Limit Handling

**Status:** planned, not started
**Owner:** Greg
**Created:** 2026-04-16
**Session log:** append entries to this file as phases ship.

---

## North Star

**Rouge runs on whichever Anthropic auth a user has: Claude Code subscription (default), direct API, AWS Bedrock, or Google Vertex — chosen per spec, switchable mid-build when rate limits hit.**

Cost display is mode-transparent: dollars where we know them, tokens/turns where we don't. Never a fake synthesized number.

## Strategic context

Rouge today is **subscription-auth only** (verified 2026-04-15):
- `src/launcher/secrets.js:374` — `INTEGRATION_KEYS` covers deploy/product keys (Stripe/Supabase/Sentry/Slack/Cloudflare/Vercel) but **no LLM provider keys**.
- `src/launcher/rouge-loop.js:1602` — `spawn('claude', …)` passes only deploy secrets; **no `ANTHROPIC_API_KEY`, `CLAUDE_CODE_USE_BEDROCK`, or `CLAUDE_CODE_USE_VERTEX`** env vars.
- `src/launcher/doctor.js:79` — auth check is subscription-only (`claude -p "test" --max-turns 0`).
- README references "API key costs apply" but the code path doesn't exist.

This means **anyone cloning Rouge without a Pro/Max subscription can't run it**. We need this wired before shipping v1.0 to npm.

## Decisions locked (from brainstorming session 2026-04-15/16)

1. **Default provider is Claude Code subscription.** Cheapest for typical users.
2. **Per-spec provider selection**, not global. Lets users mix: cheap seeding on subscription, expensive builds on API, etc.
3. **Dropdown UX beside the chat send button** — the standard Cursor/Cline/Continue pattern. Active provider visible, click to switch, disabled providers show a `+ Add key` that deep-links to `/setup#llm-auth`.
4. **Build-time confirmation.** When a spec is promoted to build ("Build this"), reconfirm the provider — build costs dwarf spec costs.
5. **Cost display principle: mode-transparent, never synthesize.**
   - API / Bedrock / Vertex: real $ at provider rates
   - Subscription: NOT shown as $. Hover breakdown shows tokens and turn count.
   - Example: `$23.40` visible; hover `$23.40 — 1.5M tokens via API · 2.8M tokens via Claude Code subscription (47 turns)`
   - Explicitly rejected: "percentage of subprocesses" metric (low-signal, implies precision), synthetic "$0 subscription" label (hides reality).
   - Optional visual: thin stacked bar (green subscription tokens / blue API tokens) for at-a-glance ratio.
6. **Rate-limit fallback is pause-and-resume**, not in-process swap (see research below — Claude Code env vars are read at process start; can't be changed mid-run).
7. **Only pause subscription-mode projects** when subscription limits hit. API/Bedrock/Vertex projects continue.

## Claude Code auth — research notes

**Env vars that drive provider selection:**
- `ANTHROPIC_API_KEY` set → direct API (billable). Bypasses subscription.
- `CLAUDE_CODE_USE_BEDROCK=1` + `AWS_REGION` + AWS creds → Bedrock routing.
- `CLAUDE_CODE_USE_VERTEX=1` + `CLOUD_ML_REGION` + GCP project + ADC → Vertex routing.
- **Important gotcha:** if `ANTHROPIC_API_KEY` is set in the shell and user expects subscription, Claude Code warns about dual creds. Rouge must **explicitly unset** `ANTHROPIC_API_KEY` in the spawn env when subscription mode is selected.

**Rate limits (as of 2026):**
- 5-hour rolling session window + 7-day weekly ceiling.
- Anthropic adjusts session caps during peak hours (5am–11am PT / 1pm–7pm GMT on weekdays).
- Error message on hit: `"Claude AI usage limit reached, please try again after [time]"`.
- Recent Claude Code updates surface which limit + reset time in the error message (parseable).
- Subprocess exits non-zero; stderr contains the limit message.

**Mid-subprocess swap:**
- **Not possible.** Env vars are read at process start. Switching provider requires killing the subprocess and spawning a new one with new env.
- Rouge's existing checkpoint/resume machinery already handles this: pause → change `authMode` in state.json → resume. No new infrastructure needed for the "swap provider" action, just plumbing.

**Sources:**
- [Claude Code on Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock)
- [Managing API key environment variables in Claude Code](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code)
- [Using Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [Manage extra usage for paid Claude plans](https://support.claude.com/en/articles/12429409-manage-extra-usage-for-paid-claude-plans)
- [Claude Code CLI env var gist (community reference)](https://gist.github.com/unkn0wncode/f87295d055dd0f0e8082358a0b5cc467)

## Phases

### Phase A — Auth foundation (no visible UX)

Scope:
- Add `llm` to `INTEGRATION_KEYS` in `src/launcher/secrets.js`. Keys: `ANTHROPIC_API_KEY`, `AWS_BEDROCK_ACCESS_KEY_ID`, `AWS_BEDROCK_SECRET_ACCESS_KEY`, `AWS_BEDROCK_REGION`, `GCP_VERTEX_PROJECT`, `GCP_VERTEX_REGION`, `GCP_VERTEX_ADC` (path or JSON).
- Add `authMode` field to `state.json` schema — values: `subscription` (default), `api`, `bedrock`, `vertex`.
- `rouge-loop.js` spawn: build env based on `state.json.authMode` and keychain contents. Explicitly unset `ANTHROPIC_API_KEY` when subscription mode is active.
- `rouge-cli.js` seed spawn: same logic (seeding uses the same provider as build by default).
- Doctor upgrade: detect which auth mode is currently active. Today's "Anthropic auth valid" is ambiguous — report `subscription valid (via claude login)` vs `API key valid` vs `Bedrock creds present` etc.
- `ROUGE_LLM_PROVIDER` env var override for power users and CI.

Not in this phase:
- No UI. No dropdown. No setup wizard step. This is pure plumbing.

Tests:
- Spawn env inspection: subscription mode sets no API var AND removes any inherited ANTHROPIC_API_KEY.
- API mode sets ANTHROPIC_API_KEY and does not set Bedrock/Vertex.
- Bedrock mode sets the Bedrock vars and unsets ANTHROPIC_API_KEY.
- Doctor distinguishes the four modes with distinct status strings.

### Phase B — Setup + dropdown UX

Scope:
- New setup wizard step: **LLM provider** (probably step 1 — nothing else works without auth). Radio: `Subscription (default) / API key / Bedrock / Vertex`. Each reveals the relevant fields; validates on save (Anthropic API key hits a cheap auth endpoint, Bedrock creds hit STS, Vertex creds hit IAM).
- Chat-side provider dropdown in `/projects/[name]` page: shows active provider + model. Click → menu grouped Enabled / Not configured. Disabled providers have a `+ Add key` link to `/setup#llm-auth`.
- Per-spec sticky selection: writes to `state.json.authMode`. Defaults to subscription on new spec creation.
- Build-time reconfirmation: "Build this" button on a spec shows a compact confirm: "Building with: Claude Code subscription. [Change →]" so users don't accidentally start a 100-turn build on the wrong auth.
- `rouge setup` CLI step adds "Configure LLM provider?" prompt (accepts `--llm-provider=subscription|api|bedrock|vertex` flag for non-interactive).

Not in this phase:
- Mid-build switch (that needs rate-limit detection from Phase D).
- Cost display changes (that's Phase C).

### Phase C — Token-first cost tracking

This is the biggest lift. Likely warrants a dedicated mini-plan doc before coding.

Scope:
- Schema change: `state.json.costs` goes from `{ cumulative_cost_usd, cumulative_tokens }` to an array of segments, each tagged by `authMode`:
  ```json
  {
    "costs": {
      "segments": [
        { "authMode": "subscription", "inputTokens": 2800000, "outputTokens": 450000, "turns": 47, "windowStart": "...", "windowEnd": "..." },
        { "authMode": "api",          "inputTokens": 1200000, "outputTokens": 340000, "turns": 12, "dollars": 23.40 }
      ]
    }
  }
  ```
- Migration: existing projects get all historical spend rolled into a single `api`-tagged segment (it's what the old number represented).
- Rate-table module for $ conversion at display time — lookup by provider + model.
- Budget panel becomes segment-aware:
  - Shows total $ across `api`/`bedrock`/`vertex` segments
  - Hover breakdown: `$23.40 · 2.8M tokens via subscription (47 turns) · 1.5M tokens via API`
  - Optional thin stacked-bar (green sub / blue api) below the $ figure
- Spec row in the SpecsTable gets the same treatment: small tokens-via-sub badge when applicable.
- Budget cap enforcement stays $ only — subscription usage doesn't count against `budget_cap_usd` (by design; user's subscription is flat-rate).

Deliberately NOT in scope:
- Synthetic "% of Pro allowance" estimation — rejected (no clean API from Anthropic, implies false precision).
- "Estimated savings vs pure API" calculation — nice-to-have, defer unless users ask.
- Any per-model rate refinement beyond the rate table. Opus/Sonnet/Haiku rates are enough detail.

### Phase D — Rate-limit detection + mid-build fallback UX

Scope:
- Wrap the `spawn('claude', …)` in `rouge-loop.js` to detect the subscription rate-limit error. Parse stderr for `"usage limit reached"` (case-insensitive). Also capture the reset-time hint from the newer Claude Code error format.
- On hit:
  - Transition `state.current_state` to `waiting-for-human` with a structured escalation payload: `{ reason: "rate-limit", resetAt: "...", alternativesAvailable: ["api", "bedrock"] }`.
  - Record the hit as a checkpoint so the timeline shows it.
  - **Only trigger** when active `authMode` is `subscription`. Other modes keep running (they fail differently — e.g., API 429s are handled by existing retry logic).
- Dashboard escalation card gets a new variant for this reason:
  > ⏰ Claude Code subscription rate limit hit. Resets at 4:18pm.
  >
  > [ Wait for reset ] [ Switch to API (~$8 to finish) ] [ Pause ]
- "Switch to API": updates `state.json.authMode` → `api`, dismisses escalation, resumes loop. The new subprocess spawns with the new env.
- Cost estimate for "Switch to API": multiply remaining estimated tokens × current provider rate. Rough but useful.
- When only subscription creds exist, the "Switch" options are grayed with a `+ Add key` link.

Accounting detail:
- Account-scope, not project-scope: if user has 3 subscription-mode projects running and hits the rate limit, all 3 pause simultaneously (they share the same account). Phase D must handle that — single rate-limit event triggers escalation on every active subscription-mode project.

Test plan:
- Simulated rate-limit stderr in a fixture → escalation triggers correctly.
- Switching a paused project from subscription to api updates state.json, env vars in next spawn, and resumes.
- API-mode project is unaffected when subscription limit hits elsewhere.

## Open questions

1. **Anthropic API key validation endpoint.** Phase B needs a cheap "is this key valid" call. `GET /v1/messages/count_tokens` or a tiny `POST /v1/messages` with 1 token? Need to pick one with minimal billing impact.
2. **Bedrock/Vertex live validation.** Is it worth doing (STS check, IAM ping) or just "format looks right + spawn-time failure surfaces in the usual escalation"? Leaning toward format-check only — matches the Slack "app token" pattern already shipped.
3. **Model selection UX.** Phase B's dropdown combines provider + model. Scope: only the three tiers (Opus/Sonnet/Haiku) exposed, or also the version numbers? Recommend tiers only — version numbers drift and Anthropic's latest aliases handle it.
4. **Cost estimate for "Switch to API" escalation.** What's the denominator? "Estimated tokens remaining to finish the current milestone" is the right answer but requires the loop to know its plan. Compromise: show "~$ per 10 turns at current rates" and let user decide.
5. **What about the subscription-family user with a single project?** They hit rate limit → they pause → next-5-hours they're stuck. Is "Wait" good enough UX, or do we need a countdown timer + desktop notification when the window resets? Probably v2.
6. **Usage-limit analytics.** Should Rouge track how often a user hits the subscription rate limit as a signal that they should upgrade to Max or add an API key? Interesting data, possibly noisy. Defer.

## Release timing

Don't publish v0.4.0 to npm until **Phase B** is done at minimum. Auth foundation without UI is invisible, but a user hitting a non-subscription state with no way to configure it is worse than today's subscription-only. Phases C and D can land in subsequent minor versions.

## Session log

Append entries per the format in `2026-04-15-onboarding-refactor-session-log.md`:

```
### YYYY-MM-DD Session — <phase>

**Phase:** A/B/C/D
**Outcome:** shipped / partial / blocked
**Files touched:** …
**PRs:** …
**Decisions made:** …
**Surprises:** …
**Next action:** …
```

### 2026-04-16 Session — planning only

- Researched Claude Code provider env vars and rate-limit surface.
- Locked decisions per list above.
- Wrote this plan doc.
- No code changes.
- **Next action:** Start Phase A on a new branch `feature/llm-provider-auth-foundation`. Begin with `INTEGRATION_KEYS` extension + spawn env mux + doctor upgrade. Keep UI out of scope for this PR.

### Notes for the next session (cold start)

- All context needed to begin Phase A is in this doc — North Star, decisions, research notes with sources, phase scope, open questions. No need to re-research Claude Code env vars or rate limits.
- Workflow pattern established this week (see `2026-04-15-onboarding-refactor-session-log.md`): small focused PRs, sub-split big phases (a/b/c) when needed, auto-merge after green checks, use HEREDOC for commit messages, never force-push or skip hooks.
- `docs/plans/` is gitignored — plans live on disk only, share out of band.
- `npm run docs:check` MUST stay green per PR. Fixed in #125 to skip gitignored paths.
- The four-PR plan in this doc is the right granularity. Phase A alone is shippable.
- Don't publish v0.4.0 to npm until **at least Phase B** — auth foundation without UI is invisible, but a non-subscription user with no setup path is worse than today.

### Phase A starter checklist (carry into next session)

1. Branch: `feature/llm-provider-auth-foundation`
2. `src/launcher/secrets.js`: extend `INTEGRATION_KEYS` with new `llm` group. Keys per the plan above.
3. `src/launcher/state-schema` (or wherever the schema lives): add `authMode` field with default `subscription`. Migration: existing projects without the field default to subscription.
4. `src/launcher/rouge-loop.js` — find the `spawn('claude', …)` site (around line 1602). Wrap env construction in a helper:
   ```js
   function buildClaudeEnv(state, secretsEnv) {
     const env = { ...process.env, ...secretsEnv };
     // CRITICAL: explicit unset for subscription mode — Claude Code warns
     // on dual creds if ANTHROPIC_API_KEY is in shell env (verified 2026-04-15).
     delete env.ANTHROPIC_API_KEY;
     delete env.CLAUDE_CODE_USE_BEDROCK;
     delete env.CLAUDE_CODE_USE_VERTEX;
     const mode = state.authMode || 'subscription';
     if (mode === 'api') env.ANTHROPIC_API_KEY = getSecret('llm', 'ANTHROPIC_API_KEY');
     if (mode === 'bedrock') { env.CLAUDE_CODE_USE_BEDROCK = '1'; /* + AWS vars */ }
     if (mode === 'vertex') { env.CLAUDE_CODE_USE_VERTEX = '1'; /* + GCP vars */ }
     return env;
   }
   ```
5. Same helper in `src/launcher/rouge-cli.js` for the seed spawn (around line 542).
6. `src/launcher/doctor.js`: replace the single "Anthropic auth valid" check with a mode-aware report. New return shape: `{ id: 'auth', status: 'ok', detail: 'subscription valid (claude login)' }` or `'API key valid'` etc.
7. `ROUGE_LLM_PROVIDER` env var: read in the spawn helper as an override for state.json's authMode. Useful for CI and power users.
8. Tests in `tests/`: a new `auth-mode.test.js` that asserts each mode produces the expected env. Use a fixture state.json with each mode value and snapshot the env.
9. Ship as one PR — no UI, just plumbing. Title: `auth: multi-provider env mux + per-spec authMode (Phase A of LLM provider support)`
