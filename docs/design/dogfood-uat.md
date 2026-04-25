# UAT — Dogfood Rouge end-to-end (post-P4.1 / post-P5.9)

**Goal:** validate that the modernized prompts (P1.19), filled catalogue (P4.1
waves 1-7: 32 tier-2 + 24 tier-3), and harness PoC (P5.9) actually produce a
working product end-to-end. Unit tests proved each layer works individually;
this UAT proves they compose.

**Estimated time:** 60-90 min active attention. Most of it is watching the
dashboard while Rouge runs.

**Estimated cost:** US$15-30 in Anthropic API spend. Set the project cap to
$50 as a safety margin.

**What this UAT exercises (and why):**

| Layer | Exercised by |
|---|---|
| P1.19 modernized prompts | Every phase the build hits — seeding (8/9 disciplines for an S-tier project), foundation eval, build, milestone-check (test integrity → code review → product walk → evaluation), analyzing, ship-promote, vision-check, retro |
| P4.1 catalogue (tier-2) | Spec references Clerk + Neon (both wave-1 additions); foundation phase resolves them via `library/integrations/tier-2/{clerk,neon}.yaml` |
| P4.1 catalogue (tier-3) | Foundation phase scaffolds against `clerk-nextjs-middleware` + `neon-drizzle-migrations` patterns |
| P4.1 schema tests | Already validated at unit level — this UAT confirms the entries are *useful* in practice |
| P5.9 harness PoC | NOT wired to any phase yet — runs the `rouge harness probe` CLI separately to confirm SDK round-trip works against the real API |
| Tier-skip routing | S tier skips competition + marketing; UAT confirms the skip markers resolve correctly in bot.js |
| Single-branch milestone tagging | Build runs on `build/quick-tasks` and tags `milestone/quick-tasks/<name>` per shipped milestone |

## Product chosen for the UAT

**"Quick Tasks"** — a simple multi-user todo app with email auth and a
shared list view. Shaped to land in **S tier** (auth + DB + 2-3
milestones).

Why this product:
- Forces an `S` classification — runs 7 of 9 seeding disciplines, exercises
  the most prompt surface without ballooning into M+ / L territory.
- Forces foundation phase (auth + DB + shared schema across routes).
- Touches the two highest-value tier-2 catalogue additions (Clerk for
  auth, Neon for Postgres).
- Has unambiguous shippability — a working signed-in user can add a task
  and see it persist; failure modes are observable.
- Small enough to finish in one sitting at the cycle cap.

**Vision sketch for the seeding trigger message:**

> Build me Quick Tasks — a simple shared todo list. Users sign in with
> Google or email magic-link. Each user has their own private task list.
> Tasks have a title, optional notes, due date, and complete/incomplete
> state. The list view shows incomplete tasks on top, completed at the
> bottom (collapsed). Add / edit / complete / delete a task. No
> reminders, no sharing between users, no tagging or projects — just
> the focused list. Deploy to Vercel. Postgres for storage.

## Pre-flight checks (run these BEFORE starting the UAT)

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge

# 1. Working tree clean, on main, in sync with origin
git status                       # expect: nothing to commit
git log origin/main --oneline -1 # confirm matches local HEAD

# 2. All required deps present + auth working
node src/launcher/rouge-cli.js doctor
# Expect: all required ✅; warnings on Vercel CLI / MCPs OK; not blocker.
# REQUIRED green checks: Node, Claude Code CLI, Git, gh, Anthropic auth.

# 3. Anthropic API key for the harness probe (separate from Claude Code subscription)
# If you want to run the P5.9 probe step, set:
#   export ANTHROPIC_API_KEY=sk-ant-...
# Skip the probe step if you don't want to spend the ~$0.01.

# 4. Required external accounts for the chosen product:
#   - Vercel account (for deploy target) — `vercel login`
#   - Neon account (for Postgres) — Rouge will create the project; needs API access
#   - Clerk account (for auth) — Rouge will create the app; needs API access
#   - Google OAuth (for the magic-link / OAuth provider) — pre-create a Google Cloud OAuth app
#     and have the client ID/secret ready
# Set the per-integration secrets before starting:
node src/launcher/rouge-cli.js setup vercel
node src/launcher/rouge-cli.js setup neon
node src/launcher/rouge-cli.js setup clerk
# (Each prompts for the credentials it needs and stores in the secrets keychain.)

# 5. Full test suite green
npm test 2>&1 | grep -E "ℹ (pass|fail)" | tail -3
# Expect: pass ≥ 1781, fail 1 (the pre-existing flaky claude-p test — known)

# 6. Set the project cap to $50 as a safety margin
# (Rouge will refuse to spawn new phases when cycle spend exceeds the cap.)
# This is set in rouge.config.json; current default for S-tier is $60.
```

## Step 0 — P5.9 harness probe (optional, ~$0.01)

Validates the SDK adapter round-trips correctly against the real
Anthropic API. Independent from the build — runs separately.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node src/launcher/rouge-cli.js harness probe
```

**Expect:**
- Structured `final_review_report`-shaped JSON with `recommendation`,
  `confidence`, `polish_gaps`, `delight_moments`, `overall_impression`.
- Usage section showing `cache_creation_input_tokens > 0` (the system
  block was cached).
- `✓ Round-trip succeeded — adapter is wired correctly.`

Then run a second time within 5 min:
```bash
node src/launcher/rouge-cli.js harness probe
```
**Expect:** same shape, but `cache_read_input_tokens > 0` and
`cache_creation_input_tokens` near 0 (cache HIT).

**If this fails:** something is wrong with the SDK install, the API key,
or the adapter. Fix before proceeding to the build UAT.

## Step 1 — Init the project

```bash
node src/launcher/rouge-cli.js init quick-tasks
```

**Expect:**
- A new directory under your projects root (typically `~/projects/quick-tasks/`)
- `.rouge/state.json` initialised
- A confirmation line ending in: `Next: run \`rouge seed quick-tasks "<what you want to build>"\``

**Check-in:** if Rouge complains about a missing projects-root config, run
`rouge setup` (no args) first to do the one-time setup.

## Step 2 — Start the dashboard (in a second terminal)

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
node src/launcher/rouge-cli.js dashboard start
```

**Expect:** dashboard starts on `http://localhost:3000` (or whatever port
is configured). Open in browser. The "quick-tasks" project should appear
in the sidebar with state `init`.

Keep this terminal running for the rest of the UAT — it's how you watch
seeding gates, build phases, and eval cycles.

## Step 3 — Trigger seeding

```bash
node src/launcher/rouge-cli.js seed quick-tasks "Build me Quick Tasks — a simple shared todo list. Users sign in with Google or email magic-link. Each user has their own private task list. Tasks have a title, optional notes, due date, and complete/incomplete state. The list view shows incomplete tasks on top, completed at the bottom (collapsed). Add / edit / complete / delete a task. No reminders, no sharing between users, no tagging or projects — just the focused list. Deploy to Vercel. Postgres for storage."
```

**What happens:** Rouge spawns `claude -p` running the swarm
orchestrator (`seeding/00-swarm-orchestrator.md`). The orchestrator
dispatches disciplines in order, surfacing gates back to you via the
dashboard.

### Seeding check-in points

#### Check-in A — BRAINSTORMING (~5 min)

The orchestrator runs `seeding/01-brainstorming.md`. **Watch for:** three
hard gates in sequence:
- `[GATE: brainstorming/H1-premise-persona]` — confirm "who specifically"
- `[GATE: brainstorming/H2-north-star]` — one-sentence feeling shift
- `[GATE: brainstorming/H3-scope-summary]` — single batched gate listing
  every feature area as "baseline" or "expanded"

**You do:** answer each gate via the dashboard's chat input. Keep
answers terse — direction-only, not implementation. Accept the
expand-scope ethos (the prompt is built for it; don't fight depth).

**Brainstorming output written to:** `seed_spec/brainstorming.md` — the
file should contain the full design doc structure (Problem, User,
Emotional North Star, 10-Star Experience, Feature Areas, etc.) plus
the **Classifier Signals** block (entity_count, integration_count,
role_count, journey_count, screen_count). Verify the signals are
populated — they drive the SIZING phase.

**Failure mode to watch for:** orchestrator hangs without emitting the
batched H3 gate (would mean the per-FA gating regression slipped in).
Rouge taste ethos: brainstorming should encourage scope *up*, not down.

#### Check-in B — TASTE (~3 min)

`seeding/03-taste.md` runs. Single hard gate:
`[GATE: taste/H1-verdict-signoff]`. The verdict will likely be PASS
with a sharpened brief (todo apps are well-trodden; the focus is
solid). If TASTE proposes KILL, that's fine — accept it and end the
UAT. The Pomodoro fallback below is the alternate if Quick Tasks gets
killed.

#### Check-in C — SIZING (~1 min)

`seeding/03b-sizing.md` runs. No gates (autonomous). Reads the
classifier signals from BRAINSTORMING. Expected output:
`seed_spec/sizing.json` with `project_size: "S"` (or possibly "M" if
brainstorming pulled in more scope than expected).

If `project_size: "L"` or `"XL"`, abort the UAT — the budget cap won't
hold, and the iterative per-FA mode is heavier than intended for this
test.

#### Check-in D — SPEC (~10-15 min)

`seeding/04-spec.md` runs. Four-beat shape:
- **Beat 1**: emits `[GATE: spec/H1-decomposition]` with the proposed
  milestone + story breakdown. **Watch for:** typically 2-3 milestones
  for an S-tier todo app. Roughly: M1 = auth flow, M2 = task CRUD,
  M3 = list view + polish. Approve unless the breakdown is wildly off.
- **Beat 2**: `[DECISION: complexity-profile]` — should pick `full-stack`
  (Next.js + Postgres). No gate unless ambiguous.
- **Beat 3**: per-FA spec writes — chat is QUIET (no prose), only
  `[WROTE: faN-spec-written]` markers + heartbeats.
- **Beat 4**: one rollup message, then `[DISCIPLINE_COMPLETE: spec]`.

**Verify after Beat 3:** the per-FA spec depth is 3-8 pages each. If
specs are thin (< 3 pages, missing edge cases / error states), that's
a P1.19 modernization regression — flag immediately.

#### Check-in E — INFRASTRUCTURE (~5 min)

`seeding/08-infrastructure.md` runs. Possible gates:
- `[GATE: infrastructure/S1-deploy-target]` — if there's ambiguity
  between Vercel / Cloudflare / etc. The vision says Vercel; should
  be autonomous unless the spec contradicts.
- `[GATE: infrastructure/S2-project-dependency]` — only if it detects a
  shareable resource. Unlikely for a fresh project.

**Verify:** `infrastructure_manifest.json` is written with:
- `database.provider: "neon"` (or supabase if it picks that)
- `auth.provider: "clerk"` (or authjs / supabase)
- `deploy.target: "vercel"`
- `incompatibilities_resolved: []` (must be empty — that's the gate
  before DESIGN can run)

**Failure mode:** if the infra phase invents an integration not in our
catalogue (e.g. picks "PlanetScale" which isn't in tier-2), the
foundation phase will fail at scaffold. Should be unlikely with our
catalogue covering the obvious database options.

#### Check-in F — DESIGN (~10-15 min)

`seeding/05-design.md` runs. Three-pass shape (UX architecture →
component design → visual design). Single hard gate at the end:
`[GATE: design/H1-direction-signoff]`. Expect three YAML artifacts in
`design/`:
- `pass-1-ux-architecture.yaml` (sitemap, journeys, hierarchy scores)
- `pass-2-component-design.yaml` (component mapping, 5-state coverage)
- `pass-3-visual-design.yaml` (tokens, typography, slop audit)

**Critical check:** `slop_detected: false` in pass 3. If the design phase
detects slop in its own output, the prompt is supposed to revise. If it
emits `slop_detected: true` AND emits `[DISCIPLINE_COMPLETE: design]`
together, that's a regression — the prompt should refuse to complete
until clean.

#### Check-in G — LEGAL/PRIVACY (~3 min)

`seeding/06-legal-privacy.md` runs. One hard gate:
`[GATE: legal-privacy/H1-jurisdiction]` (GDPR / CCPA / minimal). For a
hobby project, "minimal" is fine.

Expect `legal/terms.md` + `legal/privacy.md` written. Cookie policy is
conditional — Quick Tasks uses session cookies for auth, so cookies.md
should also be generated.

#### Check-in H — Skipped disciplines

S-tier skips COMPETITION + MARKETING. **Verify** in the orchestrator's
chat output:
```
[DISCIPLINE_SKIPPED: competition — applicable_at=M; project_size=S is below threshold]
[DISCIPLINE_SKIPPED: marketing — applicable_at=M; project_size=S is below threshold]
```

The dashboard's discipline tracker should show these as `skipped` (not
`pending`). If they show as `pending` or attempted, the tier-skip
routing is broken.

#### Check-in I — SEED SUMMARY

After all eligible disciplines complete, orchestrator emits
`[GATE: seeding/H-final-approval]` with the SEED SUMMARY: product
name, milestone count, story count, AC count, etc. Approve to
finalise.

After approval, expect:
- `vision.json` written
- `product_standard.json` written
- `seed_spec/milestones.json` written with milestones[].stories[]
- `infrastructure_manifest.json`, `legal/`, `design/` all populated
- `.rouge/state.json` set to `current_state: "ready"` with
  `foundation.status: "pending"` (full-stack profile needs foundation)
- `SEEDING_COMPLETE` emitted as a bare word

**Total seeding time:** ~30-45 min wall clock. Most of it is the spec
+ design phases.

## Step 4 — Trigger the build loop

```bash
node src/launcher/rouge-cli.js build quick-tasks
```

**What happens:** Rouge loops through phases. Watch the dashboard.

### Build check-in points

#### Check-in J — Foundation phase (~10-15 min)

`loop/00-foundation-building.md` (PR 7 modernization with three
preserved safety blocks). Sets up:
- Neon Postgres project (or Supabase if infra picked that)
- Clerk app
- Drizzle schema for `users` (auto by Clerk) + `tasks`
- Vercel project linked
- Initial migrations applied

**ISOLATION RULES check:** Rouge is supposed to **NEVER** adopt
existing Neon/Vercel/Clerk resources. If the foundation phase says
"found existing 'quick-tasks' Vercel project — adopting", that's a
regression — the rule was added after a real incident (mtgordle was
destroyed). Watch the foundation log for any "adopted existing" lines;
they should never appear.

After foundation completes, `loop/00-foundation-evaluating.md` runs.
Verdict: PASS. If FAIL with `silent_degradation_check.status: "FAIL"`,
the builder substituted something — restart the foundation, don't let
it pass.

#### Check-in K — Story building (cycle 1, ~10-20 min)

For each milestone:
- `state: "story-building"` — `loop/01-building.md` runs (PR 8 — three
  preserved safety blocks)
- For each story in the milestone, the builder writes code + tests +
  deploys to staging. Per the modernized prompt, each story builds
  ONE thing; cross-story scope creep is forbidden.
- `state: "milestone-check"` — eval orchestrator runs all sub-phases.

**Watch the dashboard** for live tool-call activity (the `phase-events`
stream from `claude -p --output-format stream-json`). If the dashboard
goes silent for >2 min, that's the spin detector's red zone — Rouge
will auto-escalate.

**Critical preservation check:** "Do NOT delete failing tests. That is
fraud." should never be triggered in the wild — but if you see Rouge
deleting tests in commits, that's a regression of the PR 8 safety
preservation.

#### Check-in L — Milestone evaluation (~5 min per milestone)

`loop/02-evaluation-orchestrator.md` (PR 24) dispatches:
- 02a-test-integrity (PR 22) — verifies tests mirror spec, 100% verdict
  rule
- 02c-code-review (PR 23) — seven-dimension rubric, OWASP security,
  P1.15/16/16b confidence stack
- 02d-product-walk (PR 21) — observer, not judge; six "Never" Anti-
  Patterns preserved
- 02e-evaluation (PR 26) — full P1.14 rubric / P1.15 confidence /
  P1.16 quote-before-score / P1.16b structured evidence_ref / P1.20
  unknown verdict / P1.21 capability-check stack

**For each milestone, expect:**
```json
{
  "evaluation_report": {
    "qa": { "verdict": "PASS", "criteria_pass_rate": 0.95, ... },
    "design": { "verdict": "PASS", "a11y_review": { "verdict": "PASS", ... } },
    "po": {
      "verdict": "PRODUCTION_READY",
      "confidence": 0.7-0.95,
      "rubric_scores": { /* six dimensions, 0-3 each */ },
      "recommended_action": "continue"
    },
    "health_score": 70-100
  }
}
```

If PO verdict is `NEEDS_IMPROVEMENT`, analyzing runs and may add change
specs for cycle 2. If `NOT_READY`, escalation. Either is fine — UAT
just needs to confirm the routing works.

#### Check-in M — Capability-check sharp edge (PRE-EXISTING)

If at any point a story is blocked by a missing integration (e.g. spec
asked for SMS but Twilio wasn't wired in foundation), watch what
happens:
- Eval-orchestrator routes to `milestone-fix`
- `milestone-fix` tries to build it, blocks again
- After ~3 cycles of the same root_cause, `audit-recommender.js` (P1.13)
  fires the "research-before-solving" recommendation

This is the pre-existing routing behavior I flagged in the dry-run.
Rouge gets out via the audit-recommender backstop, but it takes 3
cycles of churn. **If this happens in your UAT, log the cycle count it
took to escape the loop** — that's the data point we'd use to motivate
extending capability-check to the milestone-fix transition.

#### Check-in N — Ship phase

`loop/07-ship-promote.md` (PR 6) runs after the last milestone passes.

- Two pre-checks (gates) — both must show true
- One deploy attempt; on failure, escalates (no auto-retry by design,
  PR 6 preservation)
- Promotes the staging URL to production (Vercel preview → prod)

**Verify post-ship:** the production URL loads, sign-in works, you can
add and complete a task. If you can't actually use the app, the build
has shipped a non-functional product despite passing every gate —
that's the highest-impact failure mode this UAT can surface.

#### Check-in O — Final review

`loop/10-final-review.md` (PR 18 — calibration lock-in, prompt
unchanged) runs as a customer-voice end-of-build check. Read the
report:
- `recommendation: "ship" | "refine" | "major-rework"`
- `confidence: 0.0-1.0`
- `polish_gaps[]`, `rough_edges[]`, `delight_moments[]`,
  `overall_impression`

If recommendation is `ship` and the production URL works, the UAT
**passes**.

If recommendation is `refine` or `major-rework`, the UAT still passes
*as a Rouge dogfood* — the system correctly identified gaps. Decide
separately whether to iterate.

## Success criteria

The UAT passes when **all** are true:

1. Seeding completes without orchestrator hangs or invalid markers.
2. All disciplines that should run, run; all that should skip, skip.
3. Foundation evaluation passes (no silent degradation detected).
4. At least one milestone's eval verdict is `PRODUCTION_READY`.
5. The shipped production URL is accessible and the core flow works
   (sign in, add a task, see it persist after refresh).
6. Final review's recommendation is `ship` OR `refine` (not
   `major-rework`).
7. Total spend ≤ $30 (under the $50 cap with margin).
8. No regression of any preserved-by-design safety block (no force-push,
   no test deletion, no resource adoption, no premature
   SEEDING_COMPLETE before artifacts).

## Failure modes to watch for and what they indicate

| Symptom | Likely root cause | Severity |
|---|---|---|
| Orchestrator hangs without emitting H3 batched gate during BRAINSTORMING | Per-FA gating regression in PR 11 | High — but covered by tests |
| Tier-skip markers don't show up for COMPETITION/MARKETING | Discipline-registry-vs-prompt drift; PR 13 modernization regression | High |
| Spec output thin (< 3 pages per FA) | PR 15 depth-over-brevity preservation slipped | High |
| Build phase deletes failing tests to make suite green | PR 8 "that is fraud" preservation regression | **Critical** |
| Foundation phase adopts an existing Neon/Vercel/Clerk resource | PR 7 ISOLATION RULES regression | **Critical** |
| Production URL returns 401 / 500 on first load | Static-export capability-mismatch (preserved rule failed); foundation deploy bug; or auth misconfig | Important |
| Capability-gap loops > 3 cycles before audit-recommender fires | Pre-existing routing limitation I flagged in dry-run; not from recent changes | Important (known) |
| Cost spike past $30 during single milestone | spin-detector / cost-tracker not gating; or genuine prompt complexity blowing budget | Important |

## What to capture (for retro)

After the UAT — pass or fail — capture these into a UAT log file:

```bash
# In the project directory:
PROJECT=quick-tasks
LOG=docs/uat/uat-${PROJECT}-$(date +%Y%m%d).md

# Required content:
# 1. Final state snapshot
cat ~/projects/${PROJECT}/.rouge/state.json
cat ~/projects/${PROJECT}/cycle_context.json | jq '.evaluation_report'
cat ~/projects/${PROJECT}/cycle_context.json | jq '.final_review_report'

# 2. Total token + dollar spend
grep -E '"input_tokens"|"output_tokens"' ~/projects/${PROJECT}/.rouge/journey.jsonl | head -50

# 3. Cycle count + phase transitions
jq -r '.transitions[] | "\(.timestamp) \(.from) -> \(.to)"' ~/projects/${PROJECT}/.rouge/checkpoints.jsonl | tail -40

# 4. Any escalations
jq -r 'select(.escalation_needed == true)' ~/projects/${PROJECT}/.rouge/state.json
```

## Cleanup

If the UAT passes and the product is reusable, leave it intact. If you
want to delete:

```bash
node src/launcher/rouge-cli.js uninstall quick-tasks --confirm
# Then remove the external resources:
vercel project rm quick-tasks --yes
neon projects delete <project-id>  # via neonctl
# Clerk: dashboard → Quick Tasks → Settings → Delete app
```

## Fallback if Quick Tasks fails seeding

If TASTE kills the Quick Tasks idea (rare for a known good shape, but
possible) or if SIZING classifies it L+, fall back to **"Pomodoro
Timer"** (XS):

```
node src/launcher/rouge-cli.js init pomodoro
node src/launcher/rouge-cli.js seed pomodoro "A focus timer. 25-minute work sessions, 5-minute breaks. Start, pause, reset. Big visible countdown. Audible alert at zero. Persist progress in localStorage so closing the tab doesn't lose state. Single page, deploy to GitHub Pages."
```

XS path tests less surface (4 of 9 disciplines run, no foundation, no
DB) but proves the smallest-product path still works.

---

**Author:** Rouge maintainer dogfood UAT, 2026-04-25
**References:** [P1.19 modernization sweep](rouge-evolution-roadmap.md#1043),
[P4.1 catalogue waves 1-7](rouge-evolution-roadmap.md#1054),
[P5.9 harness PoC](harness-poc.md)
