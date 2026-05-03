# Seeding Flow Trace — Complete Handover Document

This document traces the full seeding flow from project creation through to build-readiness, covering every code path, disk write, frontend render, and progression condition.

---

## Summary Table

| Step | Trigger | Disk writes | Frontend update | Progression condition | Known bugs / gaps |
|------|---------|-------------|-----------------|----------------------|-------------------|
| 1. Project creation | POST /api/projects | `.rouge/state.json`, `seeding-state.json` | Project card appears in list | Immediate — returns `{ ok: true, slug }` | No auto-greeting (was removed due to rename race) |
| 2. First message | User types + sends | `seeding-chat.jsonl` (human entry), session files via `claude -p` | Optimistic pending bubble in chat | Claude returns a response; session_id persisted | Orchestrator prompt resolution fragile under Turbopack |
| 3. Brainstorming | Bridge injects orchestrator + brainstorming sub-prompt | `seed_spec/brainstorming.md` | Messages grouped under "Brainstorming" section; gates render distinctly | `[DISCIPLINE_COMPLETE: brainstorming]` + artifact verified on disk (>=500 bytes) | Agent sometimes emits marker before writing artifact |
| 4. Auto-classification | Bridge runs after brainstorming completes | `seed_spec/sizing.json`, seeding-state.json (applicable_disciplines, project_size) | Stepper shows only applicable disciplines; system note announces tier | Classification succeeds (explicit signals or keyword fallback) | Keyword fallback biases high; missing Classifier Signals section stalls classification |
| 5. Taste | Next turn after sizing completes | `seed_spec/taste.md` | Messages under "Taste" section | `[DISCIPLINE_COMPLETE: taste]` + artifact >=300 bytes | — |
| 6. Competition (M+ only) | Auto-continuation after prior discipline | `seed_spec/competition.md` | Messages under "Competition" section | `[DISCIPLINE_COMPLETE: competition]` + artifact >=500 bytes | Skipped at XS/S tier |
| 7. Spec | Auto-continuation | `seed_spec/milestones.json` | Messages under "Spec" section | `[DISCIPLINE_COMPLETE: spec]` + artifact >=500 bytes | Long autonomous stretches can hit MAX_CHUNK_DEPTH |
| 8. Infrastructure (S+ only) | Auto-continuation | `infrastructure_manifest.json` | Messages under "Infrastructure" section | `[DISCIPLINE_COMPLETE: infrastructure]` + artifact >=200 bytes | Skipped at XS tier |
| 9. Design (S+ only) | Auto-continuation | `design/pass-1-ux-architecture.yaml`, `design/pass-2-component-design.yaml`, `design/pass-3-visual-design.yaml` | Messages under "Design" section | `[DISCIPLINE_COMPLETE: design]` + all 3 pass files >=300 bytes each | Agent has been observed writing only Pass 1 then emitting marker |
| 10. Legal-Privacy (S+ only) | Auto-continuation | `legal/terms.md`, `legal/privacy.md`, optionally `legal/cookies.md` | Messages under "Legal & Privacy" section | `[DISCIPLINE_COMPLETE: legal-privacy]` + `legal/` dir with >=1 file | — |
| 11. Marketing (M+ only) | Auto-continuation | `marketing/landing-page-copy.md`, `marketing/landing-page.html`, `marketing/product-hunt-launch.md`, `README.md` | Messages under "Marketing" section | `[DISCIPLINE_COMPLETE: marketing]` + `marketing/` dir with >=1 file | Skipped at XS/S tier |
| 12. SEEDING_COMPLETE | Agent emits marker after final-approval gate | `state.json` promoted to `ready`, foundation stories prepended to `task_ledger.json` | Project state badge changes; "Build this" button appears | `validateTierCompletion` + `finalizeSeeding` both pass | Fallback finalization if reconciler catches all-done before marker |

## Per-Tier Discipline Table

| Discipline | XS | S | M+ |
|---|---|---|---|
| brainstorming | Run | Run | Run |
| sizing | Run (auto) | Run (auto) | Run (auto) |
| taste | Run | Run | Run |
| competition | **Skip** | **Skip** | Run |
| spec | Run | Run | Run |
| infrastructure | **Skip** | Run | Run |
| design | **Skip** | Run | Run |
| legal-privacy | **Skip** | Run | Run |
| marketing | **Skip** | **Skip** | Run |
| **Total active** | **4** | **7** | **9** |

Tier mapping source: `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/tier-registry.ts` lines 23-33.

---

## Step 1: Project Creation

### What triggers it

User clicks "New Project" in the dashboard and submits a slug and optional name. This sends `POST /api/projects` with `{ slug, name }`.

### What code runs

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/app/api/projects/route.ts`

1. `assertLoopback()` — verifies the request comes from localhost (line 31).
2. Validates slug format: must match `/^[a-z0-9][a-z0-9-]*$/` (line 42).
3. Checks for existing project directory at `join(projectsRoot, slug)` (line 49-54).
4. `mkdirSync(projectDir, { recursive: true })` — creates the project directory (line 57).
5. Constructs `initialState` object (lines 58-84).
6. `writeFileSync(statePathForWrite(projectDir), ...)` — writes `.rouge/state.json` (lines 85-88). `statePathForWrite` creates `.rouge/` if needed and returns `<projectDir>/.rouge/state.json`.
7. `writeSeedingState(projectDir, { session_id: null, status: 'not-started', started_at: ... })` — writes `seeding-state.json` to the project root (lines 89-93).
8. Returns `{ ok: true, slug }` — no background seeding session is started (removed due to rename race, see comment lines 96-105).

### What gets written to disk

**`<projectDir>/.rouge/state.json`:**
```json
{
  "project": "<slug>",
  "name": "<name or slug>",
  "current_state": "seeding",
  "budget_cap_usd": <from rouge.config.json or 100>,
  "milestones": [],
  "escalations": [],
  "seedingProgress": {
    "disciplines": [
      { "discipline": "brainstorming", "status": "pending" },
      { "discipline": "sizing", "status": "pending" },
      { "discipline": "taste", "status": "pending" },
      { "discipline": "competition", "status": "pending" },
      { "discipline": "spec", "status": "pending" },
      { "discipline": "infrastructure", "status": "pending" },
      { "discipline": "design", "status": "pending" },
      { "discipline": "legal-privacy", "status": "pending" },
      { "discipline": "marketing", "status": "pending" }
    ],
    "completedCount": 0,
    "totalCount": 9
  },
  "createdAt": "<ISO timestamp>"
}
```

**`<projectDir>/seeding-state.json`:**
```json
{
  "session_id": null,
  "status": "not-started",
  "started_at": "<ISO timestamp>"
}
```

### What the frontend shows

After the POST returns, the dashboard refetches the project list. The scanner finds the new directory, reads `.rouge/state.json`, and the project appears in the project list as a card in "seeding" state. The Spec tab shows the `SeedingLayout` (creating stage) with a `DisciplineStepper` showing only "Brainstorming" (pre-classification) and an empty `ChatPanel` with placeholder "Describe what you want to build...".

### What determines progression to next step

The user must type a message describing what they want to build and click Send. Nothing auto-starts.

### Known bugs / gaps at this step

The auto-greeting feature was removed (lines 96-105 comment) because it raced with the inline title editor — Claude would start working while the project directory was being renamed, causing ENOENT failures.

---

## Step 2: First User Message — Prompt Loading and Claude Invocation

### What triggers it

User types a message in the ChatPanel textarea and presses Enter or clicks Send. This calls `seeding.sendMessage(text)` which hits `POST /api/projects/[slug]/seed/message`.

### What code runs

**File:** `/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seed-handler.ts`

The entry point is `handleSeedMessage(projectDir, userText)` (line 229) which delegates to `runSeedingTurn(projectDir, text, options)` (line 376).

**Turn flow (first message):**

1. **Reconciliation skip** — `isKickoff` is false, so `reconcileDisciplineState()` runs (line 421). On the first turn, no disciplines are complete so this is a no-op.

2. **Pending gate clear** — checks if the pre-turn state was `awaiting_gate` (line 403). First turn: no gate pending.

3. **Fallback finalization check** — checks if all disciplines are complete but `seeding_complete` wasn't set (line 450). First turn: not all done.

4. **Read seeding state** — `readSeedingState(projectDir)` returns the initial state with `session_id: null` (line 474).

5. **Derive active discipline** — `resolveActiveDiscipline(state.current_discipline)` returns `'brainstorming'` (first in DISCIPLINE_SEQUENCE) (line 480).

6. **Check if first turn** — `state.session_id === null` is true (line 482).

7. **Check if discipline prompt needed** — `activeDiscipline !== null && activeDiscipline !== 'sizing' && !alreadyPrompted.includes(activeDiscipline)` is true for brainstorming (line 485-488).

8. **Build prompt sections** (lines 501-542):
   - **Section 1:** Reads orchestrator prompt from `src/prompts/seeding/00-swarm-orchestrator.md` via `currentOrchestratorPromptPath()` (line 504). Resolution tries: `ROUGE_ORCHESTRATOR_PROMPT` env var, then CWD-relative paths, then `__dirname`-relative paths (lines 28-47).
   - **Section 2:** `loadDisciplinePrompt('brainstorming')` reads `src/prompts/seeding/01-brainstorming.md`. Wrapped with a `DISCIPLINE TRANSITION` header (lines 513-518).
   - **Section 3:** Any pending correction from prior turn (none on first) (lines 531-533).
   - **Section 4:** "The user has described what they want to build. Their first message is below" bridging text (lines 535-539).
   - **Section 5:** The user's message text (line 541).
   - All joined with `\n\n` (line 542).

9. **Call Claude** — `runClaude({ projectDir, prompt, sessionId: state.session_id })` (lines 544-547). `sessionId` is null so this starts a new `claude -p` session.

10. **Rate limit check** — `detectRateLimit(result.result)` (line 562). If rate-limited, status set to `paused` and returns 429.

11. **Clear pending correction** — safe to clear since Claude saw it (line 578-579).

12. **Record discipline prompted** — `markDisciplinePrompted(projectDir, 'brainstorming')` writes to seeding-state.json and updates state.json seedingProgress (line 587-589). The discipline status becomes `'in-progress'` in state.json.

13. **Persist session_id** — `updateSessionId(projectDir, result.session_id)` (line 592-594).

14. **Activate session** — `setStatus(projectDir, 'active')` (line 597-599).

15. **Parse markers** — `extractMarkers(result.result)` and `segmentMarkers(result.result)` parse `[GATE:]`, `[DECISION:]`, `[HEARTBEAT:]`, `[WROTE:]`, `[DISCIPLINE_COMPLETE:]`, `[DISCIPLINE_SKIPPED:]`, `SEEDING_COMPLETE` from Claude's response (lines 610-621).

16. **Append messages** — human message written to `seeding-chat.jsonl`, then each segment of Claude's response written as a separate chat entry tagged with discipline and kind (lines 805-816).

17. **Apply marker state effects** — updates heartbeat time, sets any pending gate (lines 816).

18. **Derive title** — `maybeDeriveWorkingTitle(projectDir, text)` fires in background to rename the project from placeholder slug to a working title (line 854-855).

19. **Auto-continuation** — if the response contained autonomous markers (DECISION/HEARTBEAT/WROTE) and no gate, fires `runContinuationTurn` to keep the discipline moving (lines 907-975).

### What gets written to disk

- **`<projectDir>/seeding-chat.jsonl`** — one JSON line per message: the human message, then one per Claude response segment (prose, gate_question, autonomous_decision, heartbeat, wrote_artifact, system_note).
- **`<projectDir>/seeding-state.json`** — updated with `session_id`, `status: 'active'`, `disciplines_prompted: ['brainstorming']`, `current_discipline: 'brainstorming'`.
- **`<projectDir>/.rouge/state.json`** — `seedingProgress.disciplines[0].status` set to `'in-progress'`, `currentDiscipline: 'brainstorming'`.

### What the frontend shows

**ChatPanel** (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/components/chat-panel.tsx`):
- Before send: optimistic pending message appears immediately (lines 88-99).
- `ElapsedTimeIndicator` shows "Rouge is thinking" with elapsed timer (lines 324-329).
- After response arrives: messages appear grouped under "Brainstorming" discipline section.
- Each message is tagged with `kind` — gates render with distinct styling, decisions show "Alternatives considered / Reason / Override" structure.

**DisciplineStepper** (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/components/discipline-stepper.tsx`):
- Brainstorming changes from grey circle (pending) to purple spinner (in-progress) — derived status at line 169: `isCurrent && rawStatus === 'pending'` → `'in-progress'`.

**Data flow:** Watcher (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/watcher.ts`) detects `seeding-chat.jsonl` growth and emits `chat-appended` event. Also detects `.rouge/state.json` change and emits `seeding-progress` event. These SSE events hit the client via `/api/events` (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/app/api/events/route.ts`), triggering refetch of project data.

### What determines progression to next step

Claude must produce a `[DISCIPLINE_COMPLETE: brainstorming]` marker AND the brainstorming artifact must pass `verifyDisciplineArtifact`. Before that, the discipline proceeds through a multi-turn conversation with H1 (premise+persona), H2 (north star), and H3 (batched scope summary) gates.

---

## Step 3: Brainstorming Discipline

### What triggers it

The first user message triggers brainstorming automatically — it is always the first discipline in DISCIPLINE_SEQUENCE.

### What code runs

The orchestrator prompt (`00-swarm-orchestrator.md`) instructs Claude to start with brainstorming. The brainstorming sub-prompt (`01-brainstorming.md`) defines the interaction model.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `brainstorming/H1-premise-persona` | Hard | Always fires. Who has this problem + what they do today. |
| `brainstorming/H2-north-star` | Hard | Always fires. One-sentence feeling shift. |
| `brainstorming/H3-scope-summary` | Hard | Always fires. Batched table of all feature areas with baseline/expanded recommendations. |
| `brainstorming/S1-scope-bounds` | Soft | Only if brief is ambiguous about extent. |
| `brainstorming/S2-opinionation-level` | Soft | Only if product style matters and isn't implied. |

### Autonomous decisions

Working title, surface area, in/out scope, temporal arc, feature area discovery — all narrated via `[DECISION:]` markers.

### What artifact does it write

**Path:** `seed_spec/brainstorming.md`

**Required structure:**
- `# [Product Name] — Design Document`
- `## The Problem` (2-3 paragraphs)
- `## The User` (specific persona)
- `## The Emotional North Star` (one sentence)
- `## The 10-Star Experience` (1-star through 10-star)
- `## Feature Areas` (per area: baseline, our version, user journey, edge cases, competitive difference, scope decision, build estimate)
- `## What Makes This Different`
- `## Temporal Arc` (Day 1 / Week 1 / Month 1 / Year 1)
- `## Open Questions` (tagged by discipline)
- `## Scope Summary` (table)
- `## Classifier Signals` (entity_count, integration_count, role_count, journey_count, screen_count as integers)

### What determines it's "done"

Claude emits `[DISCIPLINE_COMPLETE: brainstorming]`. The bridge's `verifyDisciplineArtifact` checks (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/discipline-artifacts.ts` lines 40-44):
- `seed_spec/brainstorming.md` >= 500 bytes, OR
- `seed_spec/brainstorming-design-doc.md` >= 500 bytes, OR
- `docs/brainstorming.md` >= 500 bytes

Additionally, the turn cannot contain both a `[GATE:]` and a `[DISCIPLINE_COMPLETE:]` — if both appear, the COMPLETE is rejected (lines 624-654 of seed-handler.ts). The sequential ordering is also enforced: no earlier discipline can be uncomplete without a valid artifact.

---

## Step 4: Brainstorming -> Auto-Classification -> Tier-Based Skipping

### What triggers it

`[DISCIPLINE_COMPLETE: brainstorming]` is accepted by `verifyDisciplineArtifact`.

### What code runs (seed-handler.ts lines 677-758)

1. **`markDisciplineComplete(projectDir, 'brainstorming')`** — adds `'brainstorming'` to `disciplines_complete[]`, advances `current_discipline` to `'sizing'` (next in sequence). Updates both `seeding-state.json` and `state.json.seedingProgress`.

2. **Classifier trigger** (lines 687-758): Checks `brainstormingComplete && !alreadyClassified`. Runs `runAutoClassifier(projectDir)`.

3. **Auto-classifier** (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/auto-classifier.ts`):
   - Finds brainstorming artifact at canonical/fallback paths (lines 217-230).
   - Tries to parse `## Classifier Signals` section for explicit `entity_count: N` etc. (lines 102-127).
   - If explicit section is complete, uses those signals. If missing/incomplete, falls back to keyword counting in the full text (lines 133-194).
   - Calls `classify(signals)` — for each signal, maps to a tier via BOUNDARIES lookup. Final tier = max across all signals (lines 71-94).
   - Writes `seed_spec/sizing.json` atomically (lines 258-279).

4. **Mark sizing complete** — `markDisciplineComplete(projectDir, 'sizing')` (line 694).

5. **Get applicable disciplines** — `listApplicableDisciplines(classResult.projectSize)` (line 698). Returns only disciplines whose `DISCIPLINE_TIERS` entry is at or below the project's tier.

6. **Write to seeding state** — `applicable_disciplines` and `project_size` saved (lines 702-703).

7. **Auto-skip non-applicable** (lines 706-720): For every discipline in DISCIPLINE_SEQUENCE that is not in the applicable list (and is not brainstorming/sizing), calls `markDisciplineComplete(projectDir, disc)` and appends a system_note chat message: `"Discipline X auto-skipped — not applicable at <tier> tier."`.

8. **Announce classification** — appends system_note to chat with tier, signal source, applicable count, and reasoning (lines 723-734).

9. **If classification fails** — stashes a pending correction asking the LLM to add the Classifier Signals section and re-emit `[DISCIPLINE_COMPLETE: brainstorming]` (lines 736-757).

### What gets written to disk

**`seed_spec/sizing.json`:**
```json
{
  "schema_version": "sizing-v1",
  "project_size": "XS|S|M|L|XL",
  "signals": { "entity_count": N, "integration_count": N, ... },
  "reasoning": "Classified M: driven by ...",
  "signal_source": "explicit-section|keyword-fallback",
  "classifier_version": "bridge-v1",
  "classified_at": "<ISO>",
  "decided_by": "auto-classifier",
  "human_override": null
}
```

**`seeding-state.json`** — updated with `applicable_disciplines`, `project_size`, all skipped disciplines added to `disciplines_complete`, `current_discipline` advanced past skipped ones.

**`state.json`** — `seedingProgress` updated: skipped disciplines get status `'complete'`, `completedCount` incremented, `currentDiscipline` advanced, `applicableDisciplines` and `projectSize` set.

**`seeding-chat.jsonl`** — system_note entries for each skipped discipline + classification announcement.

### What the frontend shows

**DisciplineStepper** re-renders. Before classification, only "Brainstorming" was visible. After, the stepper shows only applicable disciplines (filtered by `applicableDisciplines` prop at line 126 of discipline-stepper.tsx). Skipped disciplines get a grey dash icon (line 68-81). A summary line shows "N disciplines skipped (XS project)" at the bottom (lines 232-239).

### What determines progression to next discipline

The auto-continuation logic (lines 907-975) fires: `acceptedDisciplines` includes all newly-completed disciplines. `shouldContinueForAdvance` is true. The bridge generates a kickoff text and calls `runContinuationTurn` which recursively calls `runSeedingTurn` with `isKickoff: true`, injecting the next discipline's sub-prompt.

---

## Step 5: Taste Discipline

### What triggers it

Auto-continuation kickoff from the bridge after sizing/skipping completes. Taste is always the first post-sizing discipline because `DISCIPLINE_SEQUENCE` puts it at index 2.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `taste/H1-verdict-signoff` | Hard | Always fires. Verdict (PASS/KILL) + sharpened brief presented together. |
| `taste/S1-kill-ack` | Soft | Only when verdict is KILL. |
| `taste/S2-premise-challenge` | Soft | Only when brainstorming didn't resolve premise questions. |

### Autonomous decisions

Quick triage, persona validation, mode selection (EXPANSION/HOLD/REDUCTION), dream state mapping, PASS verdict construction.

### What it reads from previous disciplines

Brainstorming output, competition output (may be null), original idea statement.

### What artifact does it write

**Path:** `seed_spec/taste.md`

Contains markdown wrapping a JSON block:
```json
{
  "discipline": "taste",
  "verdict": "pass|kill",
  "mode": "expansion|hold|reduction",
  "confidence": 0.0-1.0,
  "sharpened_brief": { ... },
  "graveyard_entry": { ... },
  "loop_back_triggers": [...],
  "human_questions_asked": N,
  "re_invocation_count": 0,
  "notes": "..."
}
```

If PASS: includes a Sharpened Brief (one-liner, persona, problem, killer edge, scope boundaries, vision alignment).
If KILL: includes a Graveyard Entry (reason, salvageable kernel).

### What determines it's "done"

Artifact verification: `seed_spec/taste.md` >= 300 bytes (or fallback paths `seed_spec/taste_verdict.md`, `docs/taste.md`, `docs/taste_verdict.md`).

---

## Step 6: Competition Discipline (M+ only)

### What triggers it

Auto-continuation after taste completes. Only runs at M+ tier; auto-skipped at XS and S.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `competition/S1-domain-classification` | Soft | Only if domain classification is genuinely ambiguous. |

No hard gates — this is autonomous-first.

### What it reads

Brainstorming output (idea statement), cycle_context.json.

### What artifact does it write

**Path:** `seed_spec/competition.md`

Structure:
- Competition Brief header (date, pipeline stage, market density)
- Market Landscape summary
- Competitors table (name, URL, what they do, target audience, maturity, strengths, weaknesses, pricing)
- Competitive Design Patterns table (layout, typography, color, onboarding, etc.)
- Gap Analysis (feature, experience, design, structural, audience gaps)
- Differentiation Angle
- Advisory Verdict (Clear lane / Contested but winnable / Crowded)
- Reference Products for Evaluator
- Screenshots

### What determines it's "done"

Artifact verification: `seed_spec/competition.md` >= 500 bytes (or fallbacks `seed_spec/competition_brief.md`, `docs/competition.md`, `docs/competition_brief.md`).

---

## Step 7: Spec Discipline

### What triggers it

Auto-continuation after taste (XS/S) or competition (M+) completes.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `spec/H1-decomposition` | Hard | Always fires. Milestone + story decomposition sign-off. |
| `spec/S1-shape-ambiguous` | Soft | Only if two complexity profiles are genuinely viable. |
| `spec/S2-paid-integration-flag` | Soft | Only if a required integration is paid-from-day-one. |

### Four-beat interaction shape

1. **Beat 1 — Decomposition:** Proposes milestones, writes `seed_spec/milestones.json`, gates for sign-off.
2. **Beat 2 — Shape:** Decides complexity profile autonomously (single-page/multi-route/stateful/api-first/full-stack).
3. **Beat 3 — Deep work:** Writes per-FA specs with 7 sections each (journeys, ACs, data model, errors, interactions, security, edge cases). Tier-aware depth.
4. **Beat 4 — Sign-off:** Rollup summary, then `[DISCIPLINE_COMPLETE: spec]`.

### Tier-aware depth

| Tier | FA count | ACs per FA | Beat 3 mode |
|---|---|---|---|
| XS | 1 | 2-4 | single pass |
| S | 2-3 | 3-5 | single pass |
| M | 3-5 | 3-5 | single pass |
| L | 6-8 | 4-6 | iterative per-FA + cross-cut |
| XL | 8+ | 5+ | iterative per-FA + cross-cut |

### What artifact does it write

**Path:** `seed_spec/milestones.json`

```json
{
  "milestones": [
    {
      "name": "...",
      "stories": [
        {
          "id": "...",
          "name": "...",
          "status": "pending",
          "acceptance_criteria": ["AC text...", ...],
          "depends_on": [],
          "affected_entities": ["..."],
          "affected_screens": ["..."]
        }
      ]
    }
  ]
}
```

Also writes per-area spec files via OpenSpec CLI and `vision.json` with complexity_profile and infrastructure.services.

### What determines it's "done"

Artifact verification: `seed_spec/milestones.json` >= 500 bytes (or `seed_spec/spec.md`, `docs/spec.md`).

---

## Step 8: Infrastructure Discipline (S+ only)

### What triggers it

Auto-continuation after spec completes. Skipped at XS tier.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `infrastructure/S1-deploy-target` | Soft | Only when multiple deploy targets are genuinely viable. |
| `infrastructure/S2-project-dependency` | Soft | Only if this product could share a capability with an existing Rouge project. |

No hard gates — autonomous-first.

### What it reads

Spec output (feature areas, data models, integration needs).

### Checks performed

1. Database choice vs deploy target compatibility
2. Auth strategy vs framework compatibility
3. Data source viability
4. Known-bad combinations (WebGL + headless, WebSocket + serverless, etc.)
5. Staging strategy selection
6. Project dependencies

### What artifact does it write

**Path:** `infrastructure_manifest.json` (project root)

```json
{
  "database": { "type": "...", "provider": "...", "client": "...", "reason": "..." },
  "deploy": { "target": "vercel|cloudflare-workers|docker-compose|github-pages|none", "staging_env": "...", "production_env": "..." },
  "auth": { "strategy": "...", "provider": "..." },
  "data_sources": [],
  "incompatibilities_resolved": [],
  "depends_on_projects": []
}
```

### What determines it's "done"

Artifact verification: `infrastructure_manifest.json` >= 200 bytes. Strict — no fallback paths because the launcher consumes this at build time.

---

## Step 9: Design Discipline (S+ only)

### What triggers it

Auto-continuation after infrastructure completes. Skipped at XS tier.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `design/H1-direction-signoff` | Hard | Always fires. One gate at the end after all 3 passes are on disk. |

### Three-pass execution

1. **Pass 1: UX Architecture** — sitemap, journey maps, 3-click compliance, information hierarchy, task flows. Scored 0-10 on 5 dimensions (min threshold 8).
2. **Pass 2: Component Design** — screen-component mapping, 5-state design (empty/loading/populated/error/overflow), chart specs, icon specs. Scored 0-10 on 6 dimensions.
3. **Pass 3: Visual Design** — style tokens (colors, typography, spacing, border-radius, shadows), interaction spec (transitions, microinteractions, accessibility), screen mockups, AI slop audit. Scored 0-10 on 7 dimensions.

### What artifacts does it write

**Paths:**
- `design/pass-1-ux-architecture.yaml`
- `design/pass-2-component-design.yaml`
- `design/pass-3-visual-design.yaml`
- `design/design.yaml` (combined rollup)

### What determines it's "done"

Artifact verification (`discipline-artifacts.ts` lines 66-101): ALL THREE pass files must exist at >= 300 bytes each. Accepts both hyphenated (`pass-1-...`) and underscored (`pass_1_...`) filenames. Fallback: combined `design/design.yaml` >= 2000 bytes, or legacy paths (`seed_spec/design.md`, etc.) >= 2000 bytes.

A `slop_detected: true` in the output is a hard block on `[DISCIPLINE_COMPLETE]` per the prompt.

---

## Step 10: Legal-Privacy Discipline (S+ only)

### What triggers it

Auto-continuation after design completes. Skipped at XS tier.

### Gates defined

| Gate ID | Type | Condition |
|---------|------|-----------|
| `legal-privacy/H1-jurisdiction` | Hard | Always fires. Confirm GDPR/CCPA/minimal. |
| `legal-privacy/S1-regulated-domain` | Soft | Only if fintech/health/children/gambling/education/employment detected. |
| `legal-privacy/S2-trademark-conflict` | Soft | Only if blocking trademark found. |

### Two-part output

**Part A: GC Input Review** — trademark check, IP risk, OSS license compliance, regulated domain detection, data handling obligations.

**Part B: Boilerplate Generation:**
- `legal/terms.md` — Terms & Conditions (10 sections)
- `legal/privacy.md` — Privacy Policy (10 sections)
- `legal/cookies.md` — Cookie Policy (conditional, only if browser tracking)

### What determines it's "done"

Artifact verification: `legal/` directory with >= 1 file (or fallback `seed_spec/legal.md`, `docs/legal.md` >= 300 bytes).

---

## Step 11: Marketing Discipline (M+ only)

### What triggers it

Auto-continuation after legal-privacy completes. Skipped at XS and S tier.

### Gates defined

None. Fully autonomous.

### Four artifacts

1. **`marketing/landing-page-copy.md`** — Hero, Problem, Solution, Features, Social Proof, Pricing, FAQ, Footer CTA.
2. **`marketing/landing-page.html`** — Semantic HTML5 scaffold with CSS custom properties referencing design tokens.
3. **`marketing/product-hunt-launch.md`** — Title, Tagline, Description, Maker Comment, Suggested Visuals.
4. **`README.md`** — Badge row, title, install/setup, quick start, features, config, API, contributing, license.

### What determines it's "done"

Artifact verification: `marketing/` directory with >= 1 file (or fallback `seed_spec/marketing.md`, `docs/marketing.md` >= 300 bytes).

---

## Step 12: SEEDING_COMPLETE

### What triggers it

The orchestrator prompt instructs Claude to emit `SEEDING_COMPLETE` as a bare word after the human approves the final summary via `[GATE: seeding/H-final-approval]`. The bridge also has a fallback: if all disciplines are reconciled as complete but `seeding_complete` was never set, it auto-calls `finalizeSeeding` on the next user message (seed-handler.ts lines 450-471).

### What code runs

**seed-handler.ts lines 857-889:**

1. **Tier validation** — `validateTierCompletion(projectDir)` (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/tier-registry.ts` lines 98-151):
   - Reads `seed_spec/sizing.json` for project_size.
   - Reads `seeding-state.json` for `disciplines_complete[]`.
   - Gets required disciplines via `listApplicableDisciplines(projectSize)`.
   - Checks that every required discipline is in the completed set.
   - If any missing: REJECTS `SEEDING_COMPLETE` with a system_note and pending correction.

2. **Finalization** — `finalizeSeeding(projectDir)` (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/seeding-finalize.ts` lines 324-452):

   a. **Propagate infrastructure** — `propagateInfrastructureFromManifest(projectDir)` (lines 258-322): copies `deployment_target`, `needs_database`, `needs_auth` from `infrastructure_manifest.json` into `vision.json.infrastructure` and `cycle_context.json.vision.infrastructure` if those fields are missing. This ensures the launcher's provisioner finds the deploy target.

   b. **Check required artifacts:**
      - `task_ledger.json` must exist
      - `seed_spec/` must exist and contain at least one non-hidden file
      - `vision.json` must exist and be >= 200 bytes
      - `product_standard.json` must exist and be >= 200 bytes
      - `validateTierCompletion` must pass

   c. **Generate foundation stories** — `generateFoundationStories(projectDir)` (lines 40-221):
      - Always: `f-scaffold` (Project scaffold) and `f-deploy` (Staging deploy)
      - S+: `f-database`, `f-auth`, `f-ui-shell`
      - M+: per-integration stories, `f-fixtures`
      - L+: `f-observability`, `f-performance`, `f-security`
      - Prepended as `Foundation` milestone at index 0 of `task_ledger.json`

   d. **Promote state** — reads `.rouge/state.json`, sets `current_state: 'ready'`, sets `foundation: { status: 'pending' }` if not already set. Written atomically via `writeStateJson`.

3. **Mark seeding complete** — `markSeedingComplete(projectDir)` sets `seeding_complete: true` in `seeding-state.json`.

### What gets written to disk

- **`task_ledger.json`** — Foundation milestone prepended with generated stories.
- **`vision.json`** — infrastructure fields propagated from manifest.
- **`cycle_context.json`** — infrastructure fields propagated.
- **`.rouge/state.json`** — `current_state: 'ready'`, `foundation: { status: 'pending' }`.
- **`seeding-state.json`** — `seeding_complete: true`.

### What the frontend shows

The project's state badge changes from "seeding" to "ready". The Spec tab transitions from `SeedingLayout` (creating stage) to the reviewing stage with a View/Revise toggle. The "Build this" button becomes available. The DisciplineStepper shows all applicable disciplines as complete (green checkmarks).

### Known bugs / gaps

- The orchestrator prompt sometimes forgets to emit `SEEDING_COMPLETE` after writing all artifacts. The fallback reconciler catches this on the next user message (seed-handler.ts lines 450-471).
- If `vision.json` or `product_standard.json` are missing (the LLM didn't write them), finalization fails with `missingArtifacts` and seeding stays in `seeding` state.

---

## Frontend Architecture Details

### DisciplineStepper (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/components/discipline-stepper.tsx`)

- **Visible disciplines:** Pre-classification shows only `['brainstorming']`. Post-classification shows only disciplines in `applicableDisciplines` prop (line 126-128).
- **Status derivation:** Raw state.json stores `pending`/`complete`. The component derives `in-progress` when `isCurrent && rawStatus === 'pending'` (line 169).
- **Icons:** pending = grey circle, in-progress = purple spinner, complete = green checkmark (with pulse animation on transition), skipped = grey dash.
- **Clickability:** Only complete and in-progress disciplines are clickable (line 173).
- **Pending gate badge:** If `pendingGateDiscipline` matches, shows an amber dot next to the label (lines 221-226).
- **Skipped summary:** Shows "N disciplines skipped (tier project)" at the bottom (lines 232-239).

### ChatPanel (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/components/chat-panel.tsx`)

- **Message grouping:** Messages are grouped by their `_discipline` metadata tag. Each group renders as a collapsible `DisciplineSection` with header showing discipline label + status pill (Complete/Active) + message count (lines 117-138).
- **Auto-expand/collapse:** Current discipline is auto-expanded. Newly-completed disciplines are auto-collapsed (unless user-selected) (lines 143-183).
- **Scroll to selection:** When user clicks a discipline in the stepper, the chat scrolls to that section (lines 187-199).
- **Optimistic send:** User's message appears immediately as a pending bubble with muted styling. Cleared on refetch once authoritative version lands (lines 88-99).
- **Elapsed time indicator:** Shows during send + daemon processing with per-discipline typical duration ranges (lines 409-456).
- **Resume button:** `resume_prompt` messages show a "Continue" button, only live on the last message (lines 249-252).
- **Stall warning:** If daemon heartbeat age exceeds threshold, shows amber warning (lines 331-343).

### SpecTabContent (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/components/spec-tab-content.tsx`)

- **Three stages:**
  1. `legacy` — no seedingProgress, just SpecView.
  2. `creating` — seedingProgress exists but no spec artifacts yet, shows SeedingLayout (stepper + chat).
  3. `reviewing` — artifacts exist, shows View/Revise toggle.
- **SeedingLayout:** 5-column grid — 1 column for stepper sidebar, 4 columns for ChatPanel (lines 157-185).
- **Revise lock:** When build is running, Revise mode is locked to prevent spec drift (lines 107-109).

### Watcher (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/bridge/watcher.ts`)

- **Two watchers per project:**
  1. Directory watcher on `.rouge/` for `state.json` changes (lines 207-248). Watches the directory, not the file, because atomic rename breaks file-level watchers on macOS.
  2. Directory watcher on project root for `seeding-chat.jsonl` changes (lines 256-268).
- **Events emitted:**
  - `state-change` — when `current_state` changes.
  - `seeding-progress` — when `currentDiscipline` changes.
  - `chat-appended` — when `seeding-chat.jsonl` grows.
  - `build-progress` — when `current_milestone` or `current_story` changes.
  - `escalation` — when new escalation IDs appear.
  - `project-discovered` — when a new project directory appears.
- **Debouncing:** 100ms debounce per key (line 432). Stale entries pruned after 1 hour.
- **Content dedup:** State events only fire when file content actually changes (line 317). Chat events only fire on file growth (line 292).

### SSE Events Endpoint (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/app/api/events/route.ts`)

- Subscribes to the watcher singleton via `subscribe(send, onClose)`.
- Initial handshake: sends `{"type":"connected"}`.
- Keepalive: sends SSE comment every 30s.
- Cleanup on client disconnect via abort signal.

### Bridge Mapper (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/lib/bridge-mapper.ts`)

- `mapRougeStateToProjectDetail(raw, slug)` — converts raw state.json to dashboard's `ProjectDetail` type.
- `mapSeedingProgress()` — validates discipline and status enums via `narrowEnum`, strips unknown values with console warning (lines 111-142).
- Derives `in-progress` milestone/story status from `current_milestone`/`current_story` even when raw status is `pending` (lines 276-299).
- Computes progress as % of done stories over total stories (lines 238-248).

### Project Details (`/Users/gregario/Projects/ClaudeCode/The-Rouge/dashboard/src/lib/project-details.ts`)

- `mergeSeedingProgress()` — if `rawState.seedingProgress` is missing, reconstructs it from `seeding-state.json`. Also enriches existing progress with `applicableDisciplines`/`projectSize` from tier-registry (lines 55-100).
- `mergeMilestonesFromLedger()` — if `state.milestones` is empty, falls back to `task_ledger.json` (lines 29-53).
- `readDeployUrls()` — resolves staging/production URLs from `cycle_context.json` and `infrastructure_manifest.json` (lines 116-163).
- `readProviders()` — derives provider badges from URLs and infrastructure config (lines 174-211).

---

## Detailed Auto-Continuation Mechanics

The bridge implements two forms of auto-continuation (seed-handler.ts lines 896-975):

### 1. Discipline advance continuation

Fires when `acceptedDisciplines.length > 0 && !markers.seedingComplete && !atDepthLimit`. The bridge sends a `[SYSTEM]` instruction to Claude asking it to start the next discipline. The next discipline's sub-prompt is injected because `needsDisciplinePrompt` will be true on the new turn.

### 2. Autonomous chunk continuation

Fires when the turn emitted autonomous markers (DECISION/HEARTBEAT/WROTE) but no discipline completed, no gate was set, and the session is active. The bridge sends a `[SYSTEM] Continue the autonomous chunk` instruction.

### Depth limit

Both are capped by `MAX_CHUNK_DEPTH = 10` (line 227). When hit, a `resume_prompt` message is appended to chat with "Click Continue to resume" text. The user clicks the Continue button which sends `'continue'` as a message, resetting the chunk depth.

### Gate check before continuation

Before either continuation fires, the bridge re-reads seeding state and checks `finalGateCheck.mode !== 'awaiting_gate'` (lines 938, 950). If a gate was set mid-turn by `applyMarkerStateEffects`, continuation is suppressed to avoid prompting over an unanswered gate.

---

## Reconciliation Mechanics

The `reconcileDisciplineState` function (seed-handler.ts lines 1037-1076) runs at the start of every user-initiated turn (not kickoff turns). It:

1. Walks `DISCIPLINE_SEQUENCE` in order.
2. For each discipline not yet complete:
   - Checks if there's a pending gate for this discipline — if so, stops (respects awaiting_gate).
   - Calls `verifyDisciplineArtifact` — if artifact exists on disk, marks the discipline complete.
   - If artifact doesn't exist, stops (first real gap).
3. Returns list of newly-reconciled disciplines.

This catches stranded state from previous turns where markers were rejected but artifacts later became valid (e.g., path mismatches fixed by verifier widening).

---

## End-to-End Data Flow for a Single Message

1. User types in `ChatPanel`, presses Enter.
2. `useSeeding.sendMessage(text)` sets `pendingUserMessage` (optimistic), calls `POST /api/projects/[slug]/seed/message`.
3. Route handler calls `handleSeedMessageRouted(projectDir, userText)`.
4. If daemon mode (`ROUGE_USE_SEED_DAEMON=1`): pre-persists human message to `seeding-chat.jsonl`, enqueues message, ensures daemon running, returns 202 immediately.
5. If inline mode: `runSeedingTurn` runs synchronously — reconcile, build prompt, call Claude, parse response, update state, append messages, auto-continue.
6. Watcher detects `seeding-chat.jsonl` growth → emits `chat-appended` SSE event.
7. Watcher detects `state.json` change → emits `seeding-progress` SSE event.
8. Client receives SSE events → triggers refetch of project data via `/api/projects/[slug]`.
9. `mergeSeedingProgress` enriches state with tier data.
10. `mapRougeStateToProjectDetail` converts raw state to `ProjectDetail`.
11. React components re-render: stepper updates discipline statuses, chat panel shows new messages grouped by discipline.
