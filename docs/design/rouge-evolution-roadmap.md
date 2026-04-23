# Rouge Evolution Roadmap

**Date started:** 2026-04-23
**Horizon:** as long as it takes
**Status:** planning document — _all_ work tracked here, executed one step at a time

This roadmap is the single source of truth for everything Rouge needs to do to become the best version of itself. It captures:

1. The wire-up work left over from the ECC DNA transplant (Phase 1-6 landed infrastructure, none of it reaches the running loop yet)
2. Every question the owner raised on 2026-04-23 (dashboard WIP, deployment, skills in spec, spec decomposition, intelligence in the loop, validation in the loop, "are we actually getting smarter")
3. Every capability promised but not delivered in prior comparisons with everything-claude-code
4. Long-horizon product evolution items (non-software domains, multi-tenant, federated library)

## Discipline

Every step on this roadmap obeys these rules:

1. **One step per PR.** Atomic, revertible, independently verifiable. No more 6-phase dumps.
2. **Every step delivers a measurable change.** Not "capability added" — "metric moved" (hallucination rate, bundle size, cycles-to-ship, Lighthouse score, escalation rate, token spend).
3. **Verification gate before moving on.** Each step declares how we know it worked. If the gate doesn't pass, we stop and fix before starting the next step.
4. **Strictly additive where existing consumers exist.** Grep first. Consumers updated in the same commit as the emitter.
5. **The dashboard WIP is sacrosanct** unless explicitly folded into a step.
6. **Honest ROI labelling.** Some steps are foundational, some polish, some long-horizon bets. We don't pretend polish is foundational.

## How to read this document

- Steps are numbered `P<part>.<step>` (e.g. P0.3).
- Each step has fixed fields: **What lands / Files / Verify / Depends on / ROI / Risk.**
- Parts are ordered roughly by when they become unblocked, but work within a part can often parallelize.
- Steps marked ⭐ are highest-ROI per unit of risk — do these first within their part.

## Table of contents

- [Part 0 — Finish the floor](#part-0--finish-the-floor)
- [Part I — Intelligence layer (make Rouge smarter per build)](#part-i--intelligence-layer-make-rouge-smarter-per-build)
- [Part II — Feedback loop (Rouge gets smarter over time)](#part-ii--feedback-loop-rouge-gets-smarter-over-time)
- [Part III — Deployment, onboarding, cross-platform](#part-iii--deployment-onboarding-cross-platform)
- [Part IV — Catalog growth](#part-iv--catalog-growth)
- [Part V — Quality, CI, distribution](#part-v--quality-ci-distribution)
- [Part VI — Product evolution (long horizon)](#part-vi--product-evolution-long-horizon)
- [Cross-cutting principles](#cross-cutting-principles)
- [Kill-switch criteria](#kill-switch-criteria)

## Harness-dependent items (block on P5.9)

The agent-harness architecture decision — whether Rouge keeps `claude -p` subprocess spawning, migrates to the Anthropic Agent SDK, or goes hybrid — is P5.9, scheduled **after** independent work lands so the PoC has real instrumented phases to measure against.

Items below are fully or partially blocked on P5.9. Everything else proceeds now.

**Fully dependent (wiring shape differs materially by harness choice):**
- P0.2 — MCPs into Claude spawn
- P0.5 — config-protection wiring into safety-check
- P0.11a — prompt caching
- P0.11b — batch API for retro/docs phases
- P1.4 — context7 in building (depends on MCP wiring)
- P1.10 — structured output via tool_use
- P1.11 — citations API in findings
- P2.6 — conversation-analyzer (reads whatever the tool-call log becomes)
- P2.11 — cost forecasting (capture mechanism)
- P6.7 — multi-Claude model orchestration

**Partially dependent (catalog/prompt side can land; wiring refines post-PoC):**
- P0.4 — language-reviewer dispatch (prompt-level independent; dispatch mechanism refines)
- P0.11 — governance events (self-improve + ship events independent; safety-override capture tied)
- P2.3 — prompt-version hash instrumentation
- P3.7 / P6.2 — Rouge-as-service / multi-tenant

**Count:** 10 fully dependent + 4 partial, out of 67 total — ~21%. The remaining ~79% proceeds independently of the harness decision.

Every harness-dependent step above carries a "blocks on P5.9" note in its entry.

---

## Governance corrections (from LLM-judge literature review, 2026-04-23)

These close a gap the research surfaced. Do first — tightening the boundary costs almost nothing and prevents a real drift class.

### GC.1 — Tighten self-improve allowlist: exclude judge/rubric prompts ⭐
- **What lands:** `rouge.config.json` self-improvement allowlist narrowed to exclude prompts that function as measurement instruments (judges, rubrics, thresholds). Pipeline can propose amendments to *generation* prompts only. Principle (generic software-engineering hygiene): a system should not author changes to the instrument it is measured by, because sequences of individually-defensible edits can emergently soften the instrument until real failures stop being caught. This is the classic boiling-frog risk in self-improving systems.
- **Files:** `rouge.config.json`, `src/launcher/self-improve-safety.js` (tests to enforce), `tests/self-improve.test.js`
- **Current allowlist problem:** `src/prompts/loop/*.md` includes judge-nature files (`02c`, `02d`, `02e`, `02f`, `06`, `10`). Library heuristic files (`library/global/*.json`) are neither allowed nor blocked — undefined behavior.
- **Proposed split:**
  - **Explicit allow** (generation/operational): `src/prompts/loop/01-building.md`, `00-foundation-building.md`, `03-qa-fixing.md`, `04-analyzing.md`, `05-change-spec-generation.md`, `07-ship-promote.md`, `08-document-release.md`, `09-cycle-retrospective.md`, `src/prompts/seeding/*.md` except `03-taste.md`, `docs/design/*.md`
  - **Explicit block** (instruments): `src/prompts/loop/02*.md`, `06-vision-check.md`, `10-final-review.md`, `src/prompts/final/*.md`, `src/prompts/seeding/03-taste.md`, `library/global/*.json`, `library/domain/**`, `library/templates/*.json`, `library/rules/**`, `library/rubrics/**`, `schemas/library-entry-v*.json`
- **Verify:** add test — attempted self-improve edit to `02e-evaluation.md` or `library/global/lcp.json` is rejected with "judge-prompt modifications must be human-authored."
- **Depends on:** nothing
- **ROI:** highest governance ROI per unit of work
- **Risk:** low — purely restrictive; no existing feature relied on self-improve editing these files.

### GC.2 — Document the judge/pipeline boundary
- **What lands:** CLAUDE.md + VISION.md explicitly name the judge/pipeline boundary. New contributors (human or Claude) see the principle in the first doc they read.
- **Files:** `CLAUDE.md` (extend "What NOT to do" or add "Governance boundary" section), `VISION.md` (add to "How decisions get made")
- **Verify:** docs read-through; the principle is findable on first pass without archaeology.
- **Depends on:** GC.1
- **ROI:** medium
- **Risk:** none

---

## Part 0 — Finish the floor

Close the loop on work already started. These block Part I because live traffic will reveal bugs here.

### P0.1 — Ship the escalation UX WIP ⭐
- **What lands:** The 4 uncommitted dashboard files on main: "Rouge is processing your guidance" banner, unified Send/Resume behavior, per-action label state (sending → delivered), budget-saved refetch. These are UAT-driven fixes from the owner's actual use, already substantially done.
- **Files:** `dashboard/src/app/projects/[name]/page.tsx`, `dashboard/src/components/escalation-response.tsx`, `dashboard/src/components/project-budget-cap-inline.tsx`, `dashboard/src/components/project-header.tsx`
- **Verify:** Run the dashboard, trigger an escalation in a test project, submit guidance, observe the banner. `npm run dashboard:test` passes.
- **Depends on:** nothing
- **ROI:** high — fixes a trust-eroding UX silence during every escalation
- **Risk:** low — frontend-only, existing tests cover the bridge APIs

### P0.2 — Wire MCPs into rouge-loop.js Claude spawn ⭐
- **What lands:** Before each Claude invocation, `rouge-loop.js` generates a per-build settings fragment from the active profile's `mcps_to_enable`, passes it via `--mcp-config` or equivalent. The next factory phase has Supabase schema, context7 live docs, and web search in context.
- **Files:** `src/launcher/rouge-loop.js` (spawn code path), new `src/launcher/mcp-spawn-config.js` (helper to compose settings fragment from manifest + env)
- **Verify:** (a) unit test: given a profile + present env vars, helper returns expected settings shape. (b) end-to-end: start a real build, inspect spawned Claude's tool availability via an audit-log entry that records which MCPs were loaded per phase. (c) hallucination spot-check: run building phase on a story needing Next.js 16 API — with context7 wired, no invented imports.
- **Depends on:** P0.1 merged (to avoid conflict), MCP manifests (landed)
- **ROI:** highest single-wiring ROI — context7 alone kills a class of hallucinations
- **Risk:** medium — changes how Claude is spawned; if shape is wrong, every phase breaks. Mitigation: env-flagged (`ROUGE_ENABLE_MCPS=1`) for first few cycles, default-on once observed green.

### P0.3 — Wire profile-loader into preamble-injector
- **What lands:** `preamble-injector.js` reads `active_spec.profile` (or `rouge.config.json` default), loads only the declared rules/skills/agents. Fallback to 'all' preserved for legacy projects.
- **Files:** `src/launcher/preamble-injector.js` (add profile awareness), `src/launcher/rouge-cli.js` (add `--profile` to `rouge init` and `rouge seed`)
- **Verify:** (a) unit tests for profile-scoped preamble output vs 'all'. (b) token-count diff: measure preamble size for saas-webapp profile vs all-loaded — expect ≥ 40% reduction. (c) regression: existing projects without profiles still work (fallback).
- **Depends on:** P0.2 (MCPs are a profile field; wiring both together catches composition bugs)
- **ROI:** medium-high — token savings per phase + stack-aware context sharpness
- **Risk:** medium — preamble is load-bearing. Mitigation: shadow-run both side-by-side for 3 cycles, compare outputs.

### P0.4 — Wire language-reviewer dispatch in 02c evaluation ⭐
- **What lands:** `02-evaluation-orchestrator.md` reads `active_spec.infrastructure.primary_language`, invokes `library/agents/<lang>-reviewer.md` as a subagent with `library/rules/<lang>/` + `library/rules/common/` + (conditionally) `library/rules/web/` loaded. Falls back silently if no agent for the language. Findings written to `cycle_context.code_review_report.language_review`.
- **Files:** `src/prompts/loop/02-evaluation-orchestrator.md`, `src/prompts/loop/02c-code-review.md`, possibly `src/launcher/context-assembly.js` if the subagent needs context-view helpers
- **Verify:** (a) test build on a TS product: `language_review.blocking` populated with real findings that the generic review missed. (b) test build on an Elixir product (or simulated): `language_review.skipped_reason` set, no failure. (c) diff the finding set between language-aware and generic for the same cycle — expect strictly more / more-specific findings.
- **Depends on:** P0.3 (profile controls which reviewer gets loaded)
- **ROI:** highest product-quality delta per build — Rust lifetime misuse, Py mutable defaults, TS `any` leaks all catchable now
- **Risk:** medium — evaluation flow is central. Mitigation: dispatch gated behind a config flag initially.

### P0.5 — Wire config-protection into rouge-safety-check.sh
- **What lands:** `rouge-safety-check.sh` shells to `node src/launcher/config-protection.js` on pre-write hook. Default mode `warn` (logs audit entry but allows). Requires a `// rationale:` comment in the diff when factory edits a protected config — otherwise logs as notable event.
- **Files:** `src/launcher/rouge-safety-check.sh`, add CLI entry point in `src/launcher/config-protection.js`, `rouge.config.json` (add `config_protection: "warn" | "block" | "off"` field)
- **Verify:** integration test: factory commits tsconfig with `strict: false` and no rationale → audit log records warning. Factory commits with `// rationale: ...` → silent. Strict mode blocks without rationale.
- **Depends on:** P0.4 proven stable (we're touching safety-check, want all other flows green first)
- **ROI:** medium — catches a specific silent-failure class
- **Risk:** medium — safety-check is blocklisted for self-improvement for good reason. Mitigation: change is a single shell line invoking the module; module is already well-tested.

### P0.6 — Wire MCP health-check into `rouge doctor`
- **What lands:** `rouge doctor` output grows a "MCPs" section listing each configured MCP with status: ready / missing-env / draft / retired. Surfaces the specific env vars a user needs to set for the selected profile.
- **Files:** `src/launcher/doctor.js` (or `src/launcher/health-report.js`), possibly a new table-render helper
- **Verify:** `rouge doctor` with a fresh install lists all 8 MCPs and flags the missing env vars. Integration test with a synthetic env.
- **Depends on:** P0.3 (profile drives which MCPs to care about)
- **ROI:** medium — onboarding clarity, zero build-time mystery failures
- **Risk:** low — additive

### P0.7 — Wire iterative-retrieval into brainstorm + competition
- **What lands:** Seeding phases `01-brainstorming.md` and `02-competition.md` invoke iterative-retrieval when doing research (competitive landscape, feature pattern surveying). Dispatch: broad query → score 0–1 → refine → loop max 3. Output recorded in cycle_context with per-cycle evidence trail.
- **Files:** `src/prompts/seeding/01-brainstorming.md`, `src/prompts/seeding/02-competition.md`, possibly new `src/launcher/iterative-retrieval.js` helper if we want a deterministic scorer
- **Verify:** before/after token spend on a seed run — expect 30–60% reduction in research-phase tokens with equal or better research quality (judged by spec completeness downstream). Record cycle count in seed_spec evidence.
- **Depends on:** P0.2 (firecrawl/exa MCPs wired)
- **ROI:** medium-high — cheaper and sharper seeding
- **Risk:** medium — prompt change in load-bearing seeding flow. Mitigation: parallel run both shapes for 2 projects, diff outputs.

### P0.8 — Wire iterative-retrieval into building for codebase context
- **What lands:** Building prompt references a `retrieval-in-codebase` skill that factory can invoke instead of naive grep when asking "where is X used?" or "what's the existing pattern for Y?"
- **Files:** `src/prompts/loop/01-building.md`, new `library/skills/retrieval-in-codebase/SKILL.md`
- **Verify:** on a medium-complexity project (≥ 20 files), measure tokens consumed by "find where X is used" queries before/after. Expect ≥ 40% reduction, equal or better precision.
- **Depends on:** P0.7 (validates the pattern works)
- **ROI:** medium — compounds over long builds
- **Risk:** low — additive skill; building prompt only references it as an option

### P0.9 — Variant-tracker in evaluation phase (shadow evaluation)
- **What lands:** `02e-evaluation.md` reads each Library heuristic, evaluates both active and shadow variants against product-walk evidence, records outcomes in `cycle_context.heuristic_runs[]`. Launcher persists runs to a per-project JSONL sidecar. Only active-variant outcomes gate.
- **Files:** `src/prompts/loop/02e-evaluation.md`, `src/launcher/rouge-loop.js` (to persist runs after phase ends), possibly a new `src/launcher/heuristic-runs-log.js` helper
- **Verify:** 3 cycles of build → check sidecar JSONL grows with one entry per heuristic per cycle. Active outcomes still gate. Shadow outcomes visible but don't affect routing.
- **Depends on:** P0.4 (language review first — don't cascade prompt edits)
- **ROI:** foundational for Part II — without this, we have no evidence to feed amendments
- **Risk:** medium — touches eval, the judgment phase. Mitigation: shadow tracking is purely additive; active path unchanged.

### P0.10 — Amendify + governance integration in retrospective
- **What lands:** `09-cycle-retrospective.md` produces a `structured_retro` block (worked/failed/untried). If a failed area recurs ≥ 3 cycles, retro invokes `amendify.proposeAmendment` to draft a shadow variant for the relevant heuristic or prompt. Calls `governance.write()` for every proposal.
- **Files:** `src/prompts/loop/09-cycle-retrospective.md`, `src/launcher/rouge-loop.js` (writer plumbing)
- **Verify:** simulate 3 cycles with a recurring failed area → retro output shows 1 amendment proposal + 1 governance event. Amendment file persists as a shadow variant on the heuristic.
- **Depends on:** P0.9
- **ROI:** foundational for Part II
- **Risk:** low-medium — isolated to retrospective

### P0.11a — Prompt caching in Claude spawn ⭐
- **What lands:** Every `claude -p` invocation Rouge makes uses Anthropic's prompt-caching mechanism for the preamble (vision, product standard, library heuristics, invariant instructions). These prefix tokens repeat across every phase of every cycle — caching cuts input cost by ~90% on the cached portion.
- **Files:** `src/launcher/rouge-loop.js` (spawn code), `src/launcher/preamble-injector.js` (mark cache boundaries), new helper `src/launcher/prompt-cache.js`
- **Verify:** per-phase token spend drops ≥ 30% on second-phase-onward within a cycle. Baseline vs cached recorded in cost-tracker.
- **Depends on:** P0.2
- **ROI:** very high — lowest-risk, highest-dollar win in the whole roadmap
- **Risk:** low — caching is transparent; worst case it's a no-op if cache misses

### P0.11b — Batch API for retrospective + documentation phases
- **What lands:** Phases that don't need to be real-time — retrospective (`09`), documentation (`08-document-release`), and optionally `02g-security-review` when it's a periodic rather than blocking check — use Anthropic's batch API. 50% cheaper, higher latency acceptable.
- **Files:** `src/launcher/rouge-loop.js` (phase-dispatch code path), new `src/launcher/batch-runner.js`
- **Verify:** batch-eligible phases complete within batch SLA (24h); cost per build drops measurably. Fall-through to synchronous call if batch timeout approaches.
- **Depends on:** P0.11a
- **ROI:** high — ongoing cost reduction
- **Risk:** medium — batch failures must fall back cleanly

### P0.11 — Governance events from self-improve + ship-promote + safety overrides
- **What lands:** Every self-improve PR draft → governance event. Every milestone promotion → governance event. Every safety-override (explicit human approval to proceed past a warn) → governance event. `governance.jsonl` becomes a queryable decision trail.
- **Files:** `src/launcher/self-improve.js`, `src/launcher/rouge-loop.js` (ship-promote path), `src/launcher/rouge-safety-check.sh` (safety override recording)
- **Verify:** after one full build cycle, `governance.jsonl` contains ≥ 1 event per major category the build exercised. `rouge governance query --category milestone-promotion` returns the expected entry.
- **Depends on:** P0.10
- **ROI:** foundational for Part II (auditability enables the smartness measurement)
- **Risk:** low — writes only, no gating

---

## Part I — Intelligence layer (make Rouge smarter per build)

Part 0 wires _what we have_. Part I grows the intelligence surface itself.

### P1.1 — Language-specific rules + reviewers for more languages
- **What lands:** Add reviewer agents + rules for Swift, Kotlin, Java, PHP, Ruby, Elixir, C# so the dispatch in P0.4 covers more stacks.
- **Files:** `library/agents/<lang>-reviewer.md` × 7, `library/rules/<lang>/*.md` × ~20
- **Verify:** `validate-agents` + `validate-rules` pass. Feasibility gate returns `accept` for new-language products.
- **Depends on:** P0.4
- **ROI:** scales quality across more product shapes
- **Risk:** low — additive catalog

### P1.2 — Security reviewer as a distinct lens (sub-phase 6)
- **What lands:** Promote `library/agents/security-reviewer.md` from an inline reference in 02c to a dedicated sub-phase invocation after code-review. OWASP Top 10 + OWASP Agentic Top 10. This requires adding a new loop prompt and updating the 17-prompt test count.
- **Files:** `src/prompts/loop/02g-security-review.md` (new), `src/prompts/loop/02-evaluation-orchestrator.md`, `test/prompts/contract-validation.test.js` (update asserted count 17 → 18)
- **Verify:** security findings appear as a distinct `cycle_context.security_review` key; 02c's existing `security_review` block preserved (or migrated with diff visible). Test build on an intentionally vulnerable fixture finds SQL injection and IDOR.
- **Depends on:** P0.4
- **ROI:** medium — catches a class the generic review misses (SSRF, XXE, IDOR patterns)
- **Risk:** medium — adds a new prompt, touches contract test. Mitigation: one PR, narrowly scoped.

### P1.3 — Silent-failure-hunter dispatched after product-walk
- **What lands:** `02d-product-walk.md` completes → dispatch silent-failure-hunter with journey + screen evidence. Findings written to `cycle_context.silent_failures` with confidence scores. Evaluation phase reads this in PO lens.
- **Files:** `src/prompts/loop/02d-product-walk.md`, `src/prompts/loop/02e-evaluation.md` (new input key)
- **Verify:** on a seeded fixture with a known silent failure (button click no state change), agent flags it with confidence ≥ 0.7.
- **Depends on:** P0.4
- **ROI:** medium — closes a test-suite blindspot class
- **Risk:** low-medium — additive but the PO lens needs to know to read the new key

### P1.4 — Context7 integrated into building phase preamble
- **What lands:** When building, factory invokes context7 for every unfamiliar framework API before using it. Preamble explicitly instructs this. Governance log records framework-version pairs consulted per cycle.
- **Files:** `src/prompts/loop/01-building.md`, preamble docs update
- **Verify:** on a build that uses a framework released after Claude's cutoff, code doesn't hallucinate APIs. Measure before/after by diffing invented-API error rates in the eval phase.
- **Depends on:** P0.2 (MCPs wired)
- **ROI:** high — kills a measurable hallucination class
- **Risk:** low — prompt-only change, MCP already available

### P1.5 — Spec decomposition "one task at a time" — per-FA iterative spec
- **What lands:** Seeding's Beat 3 (deep work quiet) currently produces all FAs in one sweep. Change: each FA gets its own iterative-retrieval cycle for context (competing patterns, integration docs, AC examples), produces its spec, persists, next FA starts. Reduces context-window pressure and spec drift.
- **Files:** `src/prompts/seeding/04-spec.md`, possibly new `src/launcher/spec-fa-orchestrator.js` helper
- **Verify:** on a 5-FA product, spec tokens drop, but per-FA length grows (3–8 pages each, the current target). FA specs demonstrate specific framework-idiomatic AC language (Next.js middleware, Supabase RLS, etc.)
- **Depends on:** P0.7 (iterative retrieval in seeding proven)
- **ROI:** high — matches what the owner explicitly asked for
- **Risk:** medium — spec is Rouge's crown jewel, per P0.4 discipline. Mitigation: shadow run alongside current shape for 2 seeds.

### P1.6 — Foundation-cycle detection tightening
- **What lands:** Complexity profiles currently trigger foundation cycles when the spec declares complex integrations. Add: detect foundation-cycle need via dependency-graph analysis at the end of Beat 2 (shape decision) so the decision is made before per-FA work, not after.
- **Files:** `src/prompts/seeding/04-spec.md`, `src/launcher/dependency-resolver.js`
- **Verify:** on a product with implicit foundation needs (e.g. auth + payments both depend on users table), foundation is proposed in Beat 2, not patched in later.
- **Depends on:** P1.5
- **ROI:** medium — avoids "we should have built auth first" mid-loop pivots
- **Risk:** low-medium — pure scheduling change

### P1.7 — Per-story context scoping during building
- **What lands:** Factory currently gets full milestone-context for each story. Change: `context-assembly.js` produces a tighter per-story view (only files the spec says this story touches + immediate deps), with iterative-retrieval for broader lookups as needed.
- **Files:** `src/launcher/context-assembly.js`, `src/prompts/loop/01-building.md`
- **Verify:** per-story token spend measured before/after on 5 stories; expect 20-40% reduction with equal or better build outcome.
- **Depends on:** P0.8
- **ROI:** medium — compounds over long builds
- **Risk:** medium — context starvation is worse than context overload. Mitigation: fallback path where factory can request a broader view if needed.

### P1.8 — Structured decisions in seeding markers
- **What lands:** `[DECISION: slug]` markers currently free-text. Require structured sidecar JSON: `{ slug, confidence, alternatives_considered, chosen_reason }`. Enables the variant tracker to A/B seeding decisions over time.
- **Files:** `src/prompts/seeding/00-swarm-orchestrator.md`, `dashboard/src/bridge/seed-handler.ts`
- **Verify:** dashboard renders the structured decisions; governance log captures them. Decision shape asserted in contract test.
- **Depends on:** P0.11
- **ROI:** medium — feeds Part II feedback loop with real seeding evidence
- **Risk:** low — marker format change, bridge updated in same PR

### P1.10 — Structured output for phase outputs (tool_use constraints)
- **What lands:** Phases that produce JSON (evaluation, code-review, analysis, change-spec-generation) use Anthropic's tool-use structured output instead of parsing free-form JSON out of prose. Hard schema guarantees; malformed output impossible.
- **Files:** `src/launcher/rouge-loop.js` (invocation mode), `src/prompts/loop/*.md` (prompts can drop the "output format" examples since schema is enforced), new tool schema per phase
- **Verify:** intentionally-bad prompts → structured output still schema-valid or clean error, never silent drift. Schema-failure rate drops to zero in audit log.
- **Depends on:** P0.11a
- **ROI:** high — eliminates a class of parsing errors
- **Risk:** medium — phase prompts need modification to work with structured-output mode. Mitigation: phase-at-a-time rollout with fallback.

### P1.11 — Citations API in evaluation findings
- **What lands:** Evaluation, code-review, and security-review findings carry exact source-code citations (file + line-range + quoted text) via Anthropic's citations feature. "Bug on src/auth.ts:42" becomes a checkable claim with a pinned quote, not a summary.
- **Files:** `src/prompts/loop/02c-code-review.md`, `02e-evaluation.md`, `02g-security-review.md` (Part I.2)
- **Verify:** every blocking finding includes a citation block; clicking it in dashboard jumps to exact line.
- **Depends on:** P1.10
- **ROI:** medium-high — evidence quality jumps; dashboard UX follows
- **Risk:** low

### P1.12 — Spec-based test scaffolding
- **What lands:** Seeding spec AC (WHEN/THEN) auto-generates Playwright test stubs (browser) and unit-test stubs (per-FA). Factory phase starts each story with tests already scaffolded, must fill them in. Test-integrity phase verifies AC ↔ test alignment as a derivable invariant.
- **Files:** new `src/launcher/ac-to-tests.js`, called from foundation or building phase setup
- **Verify:** on a fixture product with 12 ACs, 12 test stubs appear before story 1 starts. Test-integrity reports 100% alignment since tests derive from AC.
- **Depends on:** P1.5 (per-FA iterative spec)
- **ROI:** high — closes the "tests don't actually test the spec" gap
- **Risk:** medium — auto-generated scaffolds can mislead; stubs must be non-passing until impl lands

### P1.14 — Rouge-native evaluation rubric (product-quality domain) ⭐
- **What lands:** Rouge's 02e-evaluation PO lens rewritten with a Rouge-native rubric scoped to product-quality judgement (not research-document judgement). Dimensions derived from Rouge's own evidence surface — what a real user would see, click, and feel when using the shipped product. Ordinal anchors per dimension (public pattern from G-Eval). Human-authored; never edited by self-improve (GC.1 blocks).
- **Proposed Rouge-native dimensions (draft — iterate before adopting):**
  - **Journey completeness** — does the observed product walk cover every acceptance criterion the spec committed to?
  - **Interaction fidelity** — does every interactive element do what a user would expect (button actually submits, form validation surfaces, state updates flow)?
  - **Visual coherence** — do the screens look like one product, not a stitched-together demo? (typography / spacing / component consistency)
  - **Content grounding** — does every piece of copy (labels, empty states, error messages) sound like a human wrote it for a real use-case, not a generic template?
  - **Edge resilience** — does the product behave under empty / error / overflow / loading states, not just the happy path?
  - **Vision fit** — does the observed product match the stated north star, or has it drifted?
- Each dimension: 0|1|2|3 ordinal with behavioral anchors describing what a 0 looks like vs a 3. Naming and grouping native to Rouge's product-build domain.
- **Files:** `library/rubrics/product-quality-v1.md` (the rubric as a standalone instrument, versioned independently of prompts), `src/prompts/loop/02e-evaluation.md` (references the rubric, doesn't inline it)
- **Verify:** re-score a past cycle under the new rubric side-by-side with old; differences explained per dimension. Inter-run variance dropped (same cycle evaluated twice → same verdict ± 1 point on any dimension).
- **Depends on:** GC.1 (block self-improve from editing the rubric first), P1.10 (structured output)
- **ROI:** highest measurement-quality delta
- **Risk:** medium — 02e is load-bearing. Mitigation: shadow-run 3 cycles before promoting active; preserve old scoring in parallel for comparison.

### P1.15 — Closed-vocabulary confidence tags on findings
- **What lands:** Every finding in Rouge's evaluation phases carries a confidence tag from `high | moderate | low | unverified` (Anthropic's own agent-eval guidance uses this shape). Tag maps to evidence type: direct product-walk observation with screenshot = `high`; code-review inference without walk evidence = `moderate`; pattern-matched without direct observation = `low`; speculation without evidence = `unverified` (don't emit — use escape hatch in P1.20 instead).
- **Files:** `src/prompts/loop/02c-code-review.md`, `02e-evaluation.md`, schema update for finding shape
- **Verify:** schema test — every finding has a confidence tag; `high` findings must include `evidence_span` citing the specific observation.
- **Depends on:** P1.14
- **ROI:** medium — reduces false-positive gating
- **Risk:** low

### P1.16 — Quote-evidence-before-verdict pattern (G-Eval)
- **What lands:** Eval judges quote the specific product-walk evidence into `<evidence>` XML tags before writing the verdict. Pattern from G-Eval (public, Liu et al. EMNLP 2023) + Anthropic's long-doc guidance. Structurally in the prompt: first an `<evidence>` block of verbatim product-walk quotes, then a verdict grounded only in what was quoted.
- **Files:** `src/prompts/loop/02c-code-review.md`, `02d-product-walk.md` (producer side), `02e-evaluation.md` (judge side)
- **Verify:** inspect 02e output on a real cycle — every `criteria_results[].evidence` is a verbatim product-walk quote, not paraphrase or reconstruction.
- **Depends on:** P1.14
- **ROI:** high — cuts a hallucinated-finding class
- **Risk:** low

### P1.17 — Isolated-dimension judge calls (Anthropic agent-eval guidance)
- **What lands:** Rouge's 02e currently judges QA + Design + PO + security in one invocation. Anthropic's published agent-eval guide explicitly recommends: "grade each dimension with an isolated LLM-as-judge rather than using one to grade all dimensions." Split 02e into per-dimension sub-invocations; each gets a focused prompt and isolated rubric.
- **Files:** split `02e-evaluation.md` → `02e-qa-lens.md`, `02e-design-lens.md`, `02e-po-lens.md`; orchestrator 02 invokes each in parallel; update contract test asserting prompt count.
- **Verify:** total tokens roughly equal to single-call (dimensional focus offsets preamble repetition once prompt caching P0.11a lands). Inter-call variance drops on repeated eval of same cycle.
- **Depends on:** P1.14, P0.11a (prompt caching makes parallel dimension calls cheap)
- **ROI:** medium-high — reduces variance, enables dimension-specific tuning
- **Risk:** medium — splits the 17-prompt contract test; update assertion.

### P1.18 — Gold set + Cohen's Kappa calibration for Rouge judges
- **What lands:** Build a 20–50 item gold set of past cycles with human-labeled "correct" verdicts per dimension. After any eval-prompt change, re-run against gold set, compute Cohen's Kappa between new-prompt verdicts and human labels. Require ≥ 0.75 before promoting. Standard MT-Bench / G-Eval / Anthropic calibration practice.
- **Files:** new `library/gold-sets/product-eval/*.json` (20–50 entries: past cycle_context snapshot + human verdict per dimension), new `src/launcher/gold-set-calibrator.js` + tests, `rouge eval-calibrate` CLI.
- **Verify:** CLI runs gold set against current 02e prompt, reports Kappa per dimension. Intentionally-bad prompt change → Kappa drops → CLI reports drop, blocks promotion if below threshold.
- **Depends on:** P1.14
- **ROI:** highest long-term — this is the instrument Rouge uses to measure whether its own measurement is improving
- **Risk:** medium — requires human-labeled bootstrap data

### P1.19 — Opus 4.7 / modern-model prompt modernization pass
- **What lands:** Sweep all Rouge prompts for patterns the current model generation treats differently from older ones:
  - Remove "think step by step", "reason carefully" scaffolding — Anthropic's published Opus 4.7 guidance: "raise effort to xhigh" instead for intelligence-sensitive tasks
  - Replace "CRITICAL:", "YOU MUST", all-caps emphasis with calm declaratives — Opus 4.7 over-triggers on shouty language
  - Convert "don't do X" to "do Y" formulations (Anthropic's own recommendation)
  - State scope explicitly ("apply this to every section") — Opus 4.7 is literal and won't silently generalize
  - Add XML tag structure with consistent vocabulary: `<instructions>`, `<context>`, `<input>`, `<example>`, `<candidate>`, `<rubric>`, `<verdict>`, `<evidence>`
- **Files:** every `src/prompts/**/*.md` (~30 files) — one prompt per PR
- **Verify:** per-prompt, shadow-run against a reference cycle. Output quality stable or improved. Token count stable or down.
- **Depends on:** GC.1 (don't modernize judge prompts until allowlist tightened)
- **ROI:** high compounding
- **Risk:** medium — prompt changes at scale. Mitigation: one prompt per PR.

### P1.20 — "Unknown" escape hatch for insufficient-evidence findings
- **What lands:** Every judge prompt in Rouge instructs: "If the evidence does not let you reach a defensible verdict, emit `verdict: unknown` with the reason. Do not guess." Distinct from `env_limited` (code exists, can't verify in headless) — `unknown` is "I can't tell either way from what I was given." Directly from Anthropic's published agent-eval guidance.
- **Files:** `02c-code-review.md`, `02d-product-walk.md`, `02e-evaluation.md`, `02f-re-walk.md`, seeding `03-taste.md`
- **Verify:** synthetic adversarial test — feed judge evidence that genuinely doesn't resolve; output should be `unknown`, not a guessed verdict.
- **Depends on:** P1.14
- **ROI:** medium
- **Risk:** low

### P1.13 — Research-before-solving detector (meta-principle)
- **What lands:** Rouge detects when it's about to enter "burst of PRs" mode (3+ consecutive similar fix stories) and escalates for a systematic audit instead of continuing to patch. Borrowed from the owner's explicit preference.
- **Files:** `src/launcher/spin-detector.js` (extend), retrospective phase wiring
- **Verify:** synthetic: 3 back-to-back fix stories with similar root-cause tag → escalation raised: "recommend audit before next fix."
- **Depends on:** P0.10
- **ROI:** high — matches the owner's "no partial solutions / research before solving" discipline
- **Risk:** low — escalation is advisory

### P1.9 — Infrastructure manifest versions stamped per-cycle
- **What lands:** `infrastructure_manifest.json` grows a `stamped_at` and `stack_versions` field recording exact versions of Next.js/Supabase/etc at seed time. Building phase pins to these versions. Library patterns reference version-range compat.
- **Files:** `src/prompts/seeding/08-infrastructure.md`, `library/integrations/tier-2/*/manifest.yaml` (add compat ranges), `src/launcher/integration-catalog.js`
- **Verify:** a build started in April 2026 and resumed in July 2026 still uses April's pinned versions unless explicit bump approved.
- **Depends on:** P1.5
- **ROI:** medium — prevents silent drift when dependencies update mid-build
- **Risk:** low

---

## Part II — Feedback loop (Rouge gets smarter over time)

Part I raises the _current_ quality ceiling. Part II makes Rouge _improve_ that ceiling.

### P2.1 — Variant evidence aggregation module
- **What lands:** `src/launcher/variant-evidence.js` reads per-project heuristic-runs JSONLs across all registered projects, aggregates pass/fail by variant, invokes `variant-tracker.recommendation()` on each entry.
- **Files:** new `src/launcher/variant-evidence.js`, unit tests
- **Verify:** after 5 projects × 3 cycles = 15 data points per heuristic, module produces a recommendation for each. Matches hand-computed expected verdict.
- **Depends on:** P0.9, P0.11
- **ROI:** foundational — without cross-project aggregation, variant tracking is per-project noise
- **Risk:** low — pure computation

### P2.2 — Auto-draft PRs for promoted amendments
- **What lands:** When `variant-evidence.recommendation = promote-amendment` AND `sufficient = true` AND no safety-critical regression, draft a PR via `gh` with body from `amendify.draftPR()`. Human reviews, merges, promotes.
- **Files:** new `src/launcher/promotion-pr-writer.js`, CLI entry `rouge variant-review` to trigger
- **Verify:** synthetic fixture: 3 projects with clear shadow outperformance → `rouge variant-review` produces a PR with evidence markdown, governance event recorded.
- **Depends on:** P2.1
- **ROI:** high — closes the self-improvement loop with evidence
- **Risk:** medium — gh CLI integration, PR contents. Mitigation: default `--dry-run`, require explicit `--open` flag to actually create PR.

### P2.3 — Instrumentation: prompt-version hash per invocation
- **What lands:** Every phase invocation records the exact prompt hash in the audit trail and cycle_context. Enables "this build used prompt v3.4.2 of 02e, here's what changed in v3.4.3 and did it improve outcomes."
- **Files:** `src/launcher/rouge-loop.js`, `src/launcher/preamble-injector.js`
- **Verify:** query audit-log: given a time range, list distinct prompt hashes used and their outcome distributions.
- **Depends on:** P0.11
- **ROI:** foundational for outcome-vs-prompt analysis
- **Risk:** low — additive field

### P2.4 — Outcome ledger per project
- **What lands:** After each milestone ships, `outcome_ledger.jsonl` records: product shape, stack, prompt versions used, library heuristic pass rates, Lighthouse scores, human-feedback rating if provided, time-to-ship, token spend. This is the master evidence file for "is Rouge getting smarter?"
- **Files:** new `src/launcher/outcome-ledger.js`, called from `07-ship-promote.md`, schema `schemas/outcome-ledger-entry.json`
- **Verify:** after 3 test products ship, ledger has 3 entries with all required fields. `rouge smartness` CLI summarizes trends.
- **Depends on:** P2.3
- **ROI:** highest for Part II — this is the ground truth for smartness over time
- **Risk:** low — write-only

### P2.5 — `rouge smartness` CLI: trend dashboard
- **What lands:** New CLI subcommand + dashboard tab. Reads outcome_ledger, governance log, variant evidence. Produces charts: mean Lighthouse by month, hallucination rate by month, escalation rate by month, time-to-ship by product shape. The answer to "are we smarter than 90 days ago?"
- **Files:** new `src/launcher/smartness-report.js`, dashboard page `dashboard/src/app/smartness/page.tsx` + API route
- **Verify:** with 6+ months of outcome data (or backfilled synthetic), report renders and trends computed correctly.
- **Depends on:** P2.4
- **ROI:** highest — the answer to the owner's explicit question
- **Risk:** low — read-only computation + visualization

### P2.6 — Conversation-analyzer agent
- **What lands:** Agent reads `tools.jsonl` per cycle, identifies: wasted token paths (re-reading same file N times), stuck loops, successful strategies. Output feeds retrospective.
- **Files:** new `library/agents/conversation-analyzer.md`, wire into 09-cycle-retrospective
- **Verify:** on a known-inefficient cycle, agent identifies the inefficiency with a specific file+count evidence.
- **Depends on:** P0.10
- **ROI:** medium — closes the "why did this cycle waste tokens" gap
- **Risk:** low — read-only agent

### P2.7 — Taste fingerprint per user × domain
- **What lands:** When human feedback is provided during escalations, classify the feedback (per `schemas/feedback-classification.json`) and update a per-user-per-domain taste fingerprint. Future products of similar shape consult the fingerprint in seeding's taste discipline.
- **Files:** new `src/launcher/taste-fingerprint.js`, integration with escalation flow, schema `schemas/taste-fingerprint.json` (already exists — check and extend)
- **Verify:** after 10 escalations resolved on web-SaaS products, fingerprint reflects patterns (e.g. "user prefers minimal copy", "user dislikes modals"). Next seeding references it.
- **Depends on:** P0.11, P1.8
- **ROI:** medium — bakes human taste into future Rouge behavior
- **Risk:** medium — mis-classification compounds. Mitigation: fingerprint entries are advisory, not gating.

### P2.8 — Cross-project library contributions
- **What lands:** When a foundation cycle builds a new integration pattern, after 2+ products ship with it successfully, `contribute-pattern.js` auto-promotes it from drafts/ to tier-2 or tier-3 with evidence references.
- **Files:** `src/launcher/contribute-pattern.js` (exists), extend with evidence gate
- **Verify:** simulate 2 successful Neon Postgres builds → pattern auto-moves from `drafts/` to `tier-3/`.
- **Depends on:** P2.1
- **ROI:** medium — catalog grows from real usage, not speculation
- **Risk:** low — evidence-gated, additive

### P2.10 — Automated benchmark harness ⭐
- **What lands:** Separate repo (`the-rouge-benchmarks`) with N fixture product specs (starter todo, CRUD dashboard, payments flow, multi-tenant app, MCP server, etc.). Nightly cron runs Rouge against each, records outcome in a central ledger. THE ground-truth signal for "is Rouge smarter than last month."
- **Files:** new repo, harness runner (`src/launcher/benchmark-runner.js`), cron infra
- **Verify:** N benchmarks run nightly, outcomes aggregate into a public "Rouge performance over time" page.
- **Depends on:** P2.4, P2.5
- **ROI:** the outcome-truth of the whole roadmap — without this, "smartness" is a feel-good story
- **Risk:** medium — cost per benchmark run adds up; needs budget cap per benchmark

### P2.11 — Cost forecasting in dashboard
- **What lands:** Dashboard shows "this build is tracking at $45 projected of $100 cap" computed from phase-spend regression + current cycle position. Warnings before the cap, not just at it.
- **Files:** `dashboard/src/app/projects/[name]/page.tsx` (budget component), `src/launcher/cost-tracker.js` (projection)
- **Verify:** halfway through a build, projection within ±15% of actual final spend.
- **Depends on:** P2.4
- **ROI:** medium — UX transparency
- **Risk:** low

### P2.12 — Red-team review before ship-promote
- **What lands:** After eval passes, before ship, a red-team agent probes the product for abuse cases: can a user exfiltrate another user's data, can inputs bypass validation, can the free tier be abused to rack up cost on the paid backend. Blocks ship if critical findings.
- **Files:** `library/agents/red-team-reviewer.md`, new sub-phase `src/prompts/loop/06b-red-team.md` or inline in vision-check
- **Verify:** fixture product with deliberate IDOR or cost-amplification → red-team flags it, ship blocked.
- **Depends on:** P1.2 (security reviewer live)
- **ROI:** high for anything user-facing
- **Risk:** medium — prompt-count test again (see P1.2 for the same resolution)

### P2.13 — User-provided feedback ingestion
- **What lands:** `rouge feedback <project> [--cycle N]` CLI + dashboard tab. Owner rates shipped product / specific cycle / specific decision. Feedback → taste fingerprint + variant tracker evidence.
- **Files:** new CLI command, dashboard component, integration with `src/launcher/taste-fingerprint.js`
- **Verify:** feedback submitted in dashboard surfaces in next seeding's taste discipline.
- **Depends on:** P2.7
- **ROI:** high — closes the human-in-the-loop signal
- **Risk:** low

### P2.9 — Federated library inbox
- **What lands:** If the owner chooses to open this, other Rouge users can submit library entries. Inbox at `library/incoming/`, review CLI `rouge library review`, merge to tier-2 after manual approval.
- **Files:** new `src/launcher/library-inbox.js`, contribution GH template
- **Verify:** submission flow end-to-end on a fork.
- **Depends on:** P2.8
- **ROI:** long-horizon — only matters if Rouge has users beyond owner
- **Risk:** low — gated by manual review

---

## Part III — Deployment, onboarding, cross-platform

### P3.1 — `rouge init --profile <name>` end-to-end ⭐
- **What lands:** Init flow prompts for profile (or accepts `--profile` flag), writes it to project's `rouge.config.json`, triggers profile-aware doctor check to verify required env + MCPs, scaffolds initial files. Setup-complete sentinel records which profile.
- **Files:** `src/launcher/rouge-cli.js` (init command), `dashboard/src/components/setup-wizard.tsx` (interactive flow)
- **Verify:** `rouge init my-app --profile saas-webapp` produces a project with only saas-webapp's rules/skills/MCPs wired, doctor clean.
- **Depends on:** P0.3, P0.6
- **ROI:** high — makes the profile system real user-facing
- **Risk:** medium — onboarding is the first impression. Mitigation: keep legacy `rouge init` (no profile) working.

### P3.2 — Secret collection wizard
- **What lands:** After `rouge init --profile`, interactively collect the profile's `env_required` MCPs + standard secrets (Anthropic key, deploy targets). Store in OS keychain via existing `secrets.js`.
- **Files:** `src/launcher/rouge-cli.js` setup flow, `src/launcher/secrets.js` (add interactive collection)
- **Verify:** fresh machine, `rouge init --profile saas-webapp` walks through Supabase/GitHub/Vercel/Anthropic key collection, doctor clean after.
- **Depends on:** P3.1
- **ROI:** high — removes manual env var wrangling
- **Risk:** low — secrets.js already proven

### P3.3 — Doctor++ (MCP + Playwright + Lighthouse + quota checks)
- **What lands:** `rouge doctor` additionally checks: Playwright browsers installed, Lighthouse binary reachable, Anthropic API quota not exhausted, any per-MCP health (already P0.6 but extended to runtime probing).
- **Files:** `src/launcher/doctor.js`, new helpers per check
- **Verify:** on a fresh machine, doctor surfaces all missing deps with actionable fixes.
- **Depends on:** P0.6
- **ROI:** medium-high — fewer silent failures at build time
- **Risk:** low — read-only checks

### P3.4 — Cross-platform path resolution
- **What lands:** Centralize all path handling behind `src/launcher/paths.js` with symlink resolution, case-insensitive FS handling, Windows path separator support. Grep for raw `path.join` with `HOME` etc., migrate.
- **Files:** new `src/launcher/paths.js`, refactor touchpoints across launcher
- **Verify:** new CI job on Windows runner (Part V) passes the launcher tests.
- **Depends on:** P5.3 (Windows CI)
- **ROI:** medium-low now, foundational for Windows support
- **Risk:** medium — wide refactor. Mitigation: one touchpoint per PR.

### P3.5 — PowerShell installer
- **What lands:** `install.ps1` mirroring the behavior of any existing bash installer. Brew tap alternative for macOS if not already present.
- **Files:** new `install.ps1`, docs/windows-install.md
- **Verify:** install Rouge on a Windows VM, run `rouge doctor` clean.
- **Depends on:** P3.4
- **ROI:** low now, enables Windows users
- **Risk:** low

### P3.6 — Upgrade migration framework
- **What lands:** When Rouge upgrades across versions, auto-migrate project state (task_ledger, cycle_context, state.json) to new shape with backups. `rouge upgrade` command with dry-run.
- **Files:** new `src/launcher/upgrade-migrator.js`, reuse `state-migration.js` patterns
- **Verify:** create a v0.3.1 project, install v0.4.0, run `rouge upgrade project-name` — state migrates, backup in `.rouge/backups/`.
- **Depends on:** P5.4 (SQLite state)
- **ROI:** high as Rouge evolves — prevents "your old projects broke"
- **Risk:** high — state corruption on migration is the worst class of bug. Mitigation: always backup before migrate, write rollback.

### P3.7 — Rouge-as-service deployment model (optional)
- **What lands:** Rouge currently runs locally. For agencies / teams, expose a mode where the launcher runs on a server, dashboard is remote. Requires auth, multi-user project isolation, secret management per user.
- **Files:** new `src/launcher/server-mode.js`, auth middleware in dashboard, per-user secret namespacing
- **Verify:** two users on the same Rouge server can't see each other's projects or secrets.
- **Depends on:** P6.2
- **ROI:** speculative — only matters if Rouge productizes
- **Risk:** high — security model change

### P3.8 — Product deployment matrix
- **What lands:** `deploy-to-staging.js` currently assumes specific targets. Generalize: profile declares `deploy_target: "vercel" | "cloudflare-pages" | "fly" | "railway" | "render"`. Each has a shim that speaks that platform's deploy API.
- **Files:** `src/launcher/deploy-to-staging.js` refactor, new `src/launcher/deploy-adapters/<target>.js` × 5
- **Verify:** test deploy a fixture to each platform, get a live URL.
- **Depends on:** P3.1
- **ROI:** high — products aren't locked to one deploy target
- **Risk:** medium — each adapter can fail differently

### P3.9 — Post-deploy canary via Playwright MCP
- **What lands:** After deploy-to-staging, run a Playwright-driven canary against the live URL: critical journeys, console errors, response codes. Rollback trigger if canary fails.
- **Files:** `src/launcher/post-deploy-canary.js`, integrate into ship-promote
- **Verify:** broken deploy → canary fails → rollback triggered (on platforms supporting it). Healthy deploy → canary passes → promotion proceeds.
- **Depends on:** P0.2 (Playwright MCP), P3.8
- **ROI:** high — real safety before product goes live
- **Risk:** medium — rollback semantics vary per platform

---

## Part IV — Catalog growth

Parts I–III sharpen what Rouge _does_; Part IV expands _what stacks/domains_ it can do it on.

### P4.1 — Fill gaps in Tier-2 integrations
- **What lands:** Add integration catalogue entries for: Neon, Prisma, Drizzle, Turso, Clerk, Auth0, Resend, Stripe Tax, Algolia, Meilisearch, Tinybird, PostHog. Each a tier-2 yaml with tested pattern in tier-3.
- **Files:** `library/integrations/tier-2/<svc>/`, `library/integrations/tier-3/<svc>-<usecase>.yaml`
- **Verify:** feasibility gate returns `accept` for products declaring these. Each tier-3 pattern tested on a fixture product.
- **Depends on:** P2.8 (evidence-gated catalog growth)
- **ROI:** medium-high — each integration unlocks a class of products
- **Risk:** low — additive

### P4.2 — Domain-specific eval lenses (healthcare, fintech, GDPR)
- **What lands:** New agents: `hipaa-reviewer`, `pci-dss-reviewer`, `gdpr-privacy-reviewer`. Triggered when seeding's legal-privacy discipline flags the product as regulated. Each has a focused checklist.
- **Files:** `library/agents/<domain>-reviewer.md` × 3, trigger logic in `06-legal-privacy.md`
- **Verify:** a product declared "stores PHI" automatically triggers hipaa-reviewer in eval.
- **Depends on:** P0.4, P1.2
- **ROI:** high for regulated products (opens a class Rouge couldn't safely build before), zero for others
- **Risk:** medium — false-sense-of-compliance is worse than no review. Mitigation: clear disclaimer "advisory, not legal review."

### P4.3 — More language stacks supported end-to-end
- **What lands:** Rust, Go, Swift, Kotlin, Java, PHP, Ruby, Elixir — not just reviewers but full factory support (skills, rules, build-tool invocations, test runners).
- **Files:** `library/skills/<lang>-patterns/`, `library/rules/<lang>/`, factory preamble updates
- **Verify:** Rouge builds a non-trivial product in each language end-to-end.
- **Depends on:** P1.1
- **ROI:** high — breaks Rouge out of JS/TS monoculture
- **Risk:** medium per language — each has its own tooling quirks

### P4.4 — Framework-specific skills
- **What lands:** Beyond language rules: Next.js 16 patterns, Remix patterns, SvelteKit patterns, Astro patterns, SolidStart patterns (TS side); Django, FastAPI, Flask, Rails, Laravel, Spring patterns (backend side). Each a skill with canonical code exemplars.
- **Files:** `library/skills/<framework>-patterns/` × 10+
- **Verify:** products built with each framework use idiomatic patterns that pass language-reviewer clean.
- **Depends on:** P4.3
- **ROI:** high compounding
- **Risk:** low — additive; shelf-ware if not invoked, but also ready when needed

### P4.5 — More agents (a11y, perf, i18n)
- **What lands:** `a11y-auditor` (deeper than the rules — runs axe-core with real-user context), `perf-auditor` (more than Lighthouse — lab + field metrics), `i18n-reviewer` (translation completeness, locale handling).
- **Files:** `library/agents/<name>.md` × 3
- **Verify:** each catches issues the generic reviewer doesn't.
- **Depends on:** P1.2
- **ROI:** medium — catches specific quality classes
- **Risk:** low

### P4.6 — Mobile app support (10-year horizon)
- **What lands:** Profiles for React Native, Flutter, Swift/UIKit, Kotlin/Jetpack Compose. Mobile-specific skills and rules. Product-walk via emulator (BrowserStack/LambdaTest MCP).
- **Files:** `profiles/mobile-<platform>.json`, `library/skills/<mobile>-patterns/`, new MCP manifests
- **Verify:** Rouge builds and deploys a React Native app end-to-end.
- **Depends on:** P4.4
- **ROI:** large — expands Rouge's TAM
- **Risk:** high — mobile CI/signing/store-submission is a different world

### P4.7 — Game support (10-year horizon, explicitly future in VISION.md)
- **What lands:** Profiles for Godot, Unity (TypeScript WebGL), Phaser. Game-specific evaluation (frame time, asset budgets, physics stability). Different product-walk (gameplay recording, not just page screenshots).
- **Files:** `profiles/game-<engine>.json`, `library/skills/<engine>-patterns/`, `library/agents/game-eval.md`
- **Verify:** Rouge ships a playable Godot game.
- **Depends on:** P4.6 (non-web patterns validated)
- **ROI:** large — domain expansion
- **Risk:** high — entirely new evaluation model

---

## Part V — Quality, CI, distribution

### P5.1 — Coverage gate enforced ⭐
- **What lands:** Flip `.c8rc.json` `check-coverage` to `true`. Establish baseline, floor at 80/80/80/75. Block PRs that drop below.
- **Files:** `.c8rc.json`, CI workflow
- **Verify:** intentionally drop coverage in a test PR → CI blocks.
- **Depends on:** nothing
- **ROI:** medium — catches a common regression class
- **Risk:** low — threshold can be tuned if noisy

### P5.2 — Pre-commit hooks wired
- **What lands:** `husky` + `lint-staged` config running commitlint, markdownlint, catalog validators, and quick test subset before every commit. Factory commits can be exempted via config flag.
- **Files:** `.husky/pre-commit`, `.husky/commit-msg`, `package.json` lint-staged config
- **Verify:** commit with bad message format → rejected.
- **Depends on:** nothing
- **ROI:** medium — catches issues before CI
- **Risk:** low

### P5.3 — Cross-platform CI matrix
- **What lands:** GitHub Actions runs tests on ubuntu-latest, macos-latest, windows-latest × Node 18/20/22. PR blocked if any fails.
- **Files:** `.github/workflows/ci.yml`
- **Verify:** intentionally introduce a Windows-incompatible path → Windows job fails.
- **Depends on:** P3.4
- **ROI:** medium — finds cross-platform bugs before users
- **Risk:** low

### P5.4 — SQLite state store (migration from JSON)
- **What lands:** Port global Rouge state (project registry, cost history, skill-version log, governance log if large) from JSON files to a SQLite DB with migrations. Per-project `task_ledger.json` + `checkpoints.jsonl` stay JSON (they're small and project-scoped). Schemas per ECC's state-store pattern.
- **Files:** new `src/launcher/state-store/` (schema, queries, migrations, index), migration script from JSON
- **Verify:** upgrade from JSON store to SQLite is lossless; queries for trend reports faster.
- **Depends on:** P5.3
- **⚠️ Revisit after P5.9:** the persistence-layer design is part of the harness PoC scope. The SDK path may want different persistence shape than the subprocess path (e.g. in-process DB vs file-based log). Hold off on schema commits until P5.9's decision document lands, or align this step with whichever direction P5.9 recommends.
- **ROI:** medium — required for P2.5 trend dashboards at scale
- **Risk:** high — DB migration is a class of bug. Mitigation: always backup, dry-run, rollback script.

### P5.5 — Install-state tracking
- **What lands:** `~/.rouge/install-state.json` records Rouge version, active profile, installed skills/rules/agents/MCPs per-project. `rouge upgrade` consults it to know what needs migration.
- **Files:** new `src/launcher/install-state.js`, integrate with `rouge init` + `rouge upgrade`
- **Verify:** after install + two upgrades, install-state reflects history correctly.
- **Depends on:** P3.6
- **ROI:** medium — enables selective upgrades
- **Risk:** low

### P5.6 — Distribution via npm, brew, and marketplace
- **What lands:** npm package `the-rouge` (exists). Homebrew tap. Consider: Claude Code plugin marketplace listing (if the licensing allows).
- **Files:** homebrew tap repo, marketplace manifest
- **Verify:** `brew install rouge` and `npm install -g the-rouge` both yield working installs.
- **Depends on:** P5.1 green
- **ROI:** medium — easier install = more adopters
- **Risk:** low

### P5.7 — Release automation
- **What lands:** Changesets or semantic-release driving version bumps and CHANGELOG. Tagged releases trigger npm publish + brew update + GitHub release notes.
- **Files:** `.changeset/`, release workflow, CHANGELOG.md
- **Verify:** tag v0.4.0 → automated publish + release notes.
- **Depends on:** P5.6
- **ROI:** medium — reduces release friction
- **Risk:** low

### P5.9 — Harness architecture decision (PoC + decision doc) ⭐
- **What lands:** A rigorous evaluation of whether Rouge should keep `claude -p --dangerously-skip-permissions` subprocess spawning, migrate to the Anthropic Agent SDK, or go hybrid. Output is a decision document with concrete measurements, not a paper sketch. Runs *after* independent Part 0–V work lands so the PoC has real instrumented phases to measure against.
- **Scope of the spike:**
  - PoC A: rewrite one read-only phase (recommend `09-cycle-retrospective.md`) via Agent SDK. Measure cost, latency, cache-hit behavior, observability (tokens, model version, tool invocations), lines of code to maintain.
  - PoC B: rewrite one destructive phase (`01-building.md` minimally) via SDK. Measure: can we replicate `rouge-safety-check.sh`'s PreToolUse gate via SDK callbacks? What does process-isolation loss mean in practice for Rouge's current safety guarantees?
  - Persistence question: Claude Code's `tools.jsonl` and audit log are side effects of the subprocess harness. Under SDK they must be rebuilt — **treat this as a design opportunity, not a cost.** Evaluate SQLite (per ECC / per P5.4), JSONL-per-project, or hybrid. Decide on what Rouge *wants* to persist, not what we happen to get today.
  - Decision matrix: three positions — (A) stay fully on subprocess, (B) migrate wholesale to SDK, (C) hybrid per-phase. Evidence must support whichever is chosen.
- **Files:** `spike/sdk-retrospective/`, `spike/sdk-building/`, decision doc at `docs/design/harness-architecture-decision.md`, preceded by a proposal at `docs/design/harness-poc-plan.md` before spike work starts
- **Verify:** decision doc cites measured numbers (tokens, $, latency, LoC, error-handling coverage, safety-hook coverage). A different engineer reading the doc can agree or disagree with specific evidence, not vibes. Follow-up PR to update the 10 fully-dependent and 4 partially-dependent roadmap items based on the decision.
- **Depends on:** substantial Part 0–V independent work landed — the PoC benefits from observing real wiring, not theoretical scenarios
- **ROI:** architectural leverage — the decision shapes ~21% of remaining roadmap items
- **Risk:** low for the spike itself (nothing merges to main beyond the decision doc); high for whatever migration follows (mitigated by hybrid-allowed decision framing)

### P5.10 — Unicode safety check on generated product output
- **What lands:** ECC's `check-unicode-safety.js` pattern applied to products Rouge builds. Scans committed code for RTL-override, invisible Unicode, homoglyph attacks. Runs as a code-review sub-check.
- **Files:** new `src/launcher/unicode-safety.js`, integration into `02c-code-review.md` Step 1
- **Verify:** fixture with injected RTL override → detected and flagged as security finding.
- **Depends on:** P1.2
- **ROI:** low-medium — narrow class but serious when it hits
- **Risk:** low

### P5.8 — Dependency audit automation
- **What lands:** Renovate or Dependabot. Security audit runs on every PR. Criticals auto-block.
- **Files:** `renovate.json` or `.github/dependabot.yml`
- **Verify:** a known-vulnerable dep introduced → CI blocks.
- **Depends on:** P5.3
- **ROI:** medium — catches supply-chain issues
- **Risk:** low

---

## Part VI — Product evolution (long horizon)

### P6.1 — Post-build lifecycle (feature additions to shipped products)
- **What lands:** Rouge can pick up a previously-shipped product, given new requirements, and run a targeted build cycle that preserves existing data and deployment. Currently explicitly out-of-scope (VISION.md).
- **Files:** new seeding mode `rouge extend <project> <brief>`, new loop phase handling for existing-codebase awareness
- **Verify:** ship a product v1, run `rouge extend` with new feature brief, v2 deploys without regressing v1 functionality.
- **Depends on:** P2.7 (taste fingerprint), P3.8 (deploy awareness)
- **ROI:** very large — opens Rouge to ongoing product development, not just 0→1
- **Risk:** very high — migration + data preservation + feature flags + rollback are hard. Mitigation: start with additive features only.

### P6.2 — Multi-tenant Rouge
- **What lands:** Rouge-as-SaaS for agencies: multiple human operators, each with their own projects, taste fingerprints, library contributions. Shared catalog, isolated state.
- **Files:** auth, tenant isolation, billing integration
- **Verify:** 5 tenants on the same instance can't see each other's work.
- **Depends on:** P3.7
- **ROI:** business model expansion
- **Risk:** very high — enters security/compliance territory

### P6.3 — Federated library network
- **What lands:** Rouge instances opt-in to a federated library network. Heuristics and integration patterns promoted in one instance can be reviewed and pulled into others. Trust graph per contributor.
- **Files:** federation protocol, trust-graph schema, library-inbox extension
- **Verify:** pattern promoted on instance A is reviewable + pullable on instance B.
- **Depends on:** P2.9
- **ROI:** compound — library grows faster than any single operator could
- **Risk:** high — malicious contributors, license drift

### P6.4 — Non-software domains (electronics, music, video)
- **What lands:** Profiles for hardware design (KiCad), music generation (Ableton/Ardour), video editing (DaVinci/Premiere). Each a completely different evaluation model.
- **Files:** new profiles, entirely new skill families
- **Verify:** Rouge ships a working circuit design / music track / video edit.
- **Depends on:** P4.7 (validated non-traditional eval in games)
- **ROI:** speculative
- **Risk:** very high — domain expertise Rouge doesn't have; might produce confidently-wrong output

### P6.5 — Human-in-the-loop marketplace
- **What lands:** Specific phases (design taste, legal review, content editing) can be handed to paid human reviewers via a marketplace, not just the owner. Rouge orchestrates async humans like it orchestrates async phases.
- **Files:** new marketplace integration, escalation-to-human flow generalized
- **Verify:** a design review request reaches a human reviewer, gets a structured response, Rouge consumes it.
- **Depends on:** P6.2
- **ROI:** very high — human taste at scale
- **Risk:** high — quality of human contractors varies; needs vetting and outcome tracking

### P6.7 — Multi-Claude model orchestration
- **What lands:** Rouge's existing `model-selection.js` picks Opus vs Sonnet per phase. Extend: per-phase can declare a chain (planner=Opus → builder=Sonnet → reviewer=Haiku for lightweight passes). Rouge orchestrates the handoff, passing structured artifacts between models. Aligns with the owner's existing model-tier policy memory.
- **Files:** `src/launcher/model-selection.js` (extend), new `src/launcher/model-chain.js`
- **Verify:** a build using planner=Opus + builder=Sonnet + cost-tracker shows expected cost distribution and preserves quality.
- **Depends on:** P0.11a, P1.10
- **ROI:** medium-high — cost efficiency without quality loss
- **Risk:** medium — model handoffs can lose context if poorly specified

### P6.8 — Hardware-in-the-loop (IoT / embedded / robotics)
- **What lands:** Profiles for ESP32, RP2040, Arduino, ROS. Flashing/deployment via USB/OTA. Hardware-specific eval (power draw, memory footprint, real-time constraint checking).
- **Files:** `profiles/hw-<platform>.json`, new deploy adapters for firmware flash
- **Verify:** Rouge ships a working IoT device firmware.
- **Depends on:** P4.7, P6.4
- **ROI:** speculative
- **Risk:** very high — hardware failure modes Rouge can't simulate

### P6.6 — Rouge builds Rouge
- **What lands:** Rouge's own self-improvement pipeline matures to the point it proposes architectural refactors to its own codebase, tests them in sandboxes, PRs them with evidence. Owner reviews and approves. Rouge gets meaningfully better without direct owner implementation.
- **Files:** expanded self-improve-safety allowlist, sandboxed build environment for Rouge-of-Rouge
- **Verify:** Rouge opens its first PR to itself that actually improves a measurable metric.
- **Depends on:** P2.5, P2.6, P5.4, and robust confidence in governance gates
- **ROI:** the endgame — Rouge as a self-improving system
- **Risk:** existential — without strong governance, Rouge could propose changes that damage itself. Mitigation: never auto-merge to Rouge's own repo, always human gate.

---

## Cross-cutting principles

### Measurement before change
Before any step in Parts I or II, record the metric the step is intended to move. Parts III–V can be more capability-oriented, but even there, bake in a verification metric.

### The variant tracker is the proof engine
Once P0.9 lands, every subsequent prompt/heuristic/agent change should be proposed as a shadow variant, measured against baseline for ≥ N cycles, and promoted only on evidence. No more "I think this prompt reads better."

### Governance log is the ground truth
Every meaningful decision (safety override, amendment promotion, milestone promotion, escalation resolution) writes to `governance.jsonl`. The log is append-only and signed. All retrospectives and trend reports read from here.

### One risk class per PR
If a PR touches `rouge-loop.js`, it doesn't also touch prompts. If it touches a prompt, it doesn't also refactor launcher modules. Single blast radius, easy to revert.

### Respect the blocklist
`src/launcher/*.js`, `.claude/settings.json`, `rouge.config.json`, `rouge-safety-check.sh` are blocklisted for Rouge's own self-improvement. Human-directed changes can touch them but should be minimal, well-reviewed, and never trivially revertable.

### Kill the scaffolding-without-wiring pattern
If a PR lands a module with tests but no caller in the live loop, include in the PR description when the wiring PR will follow. If no clear wiring plan, don't land the module.

## Kill-switch criteria

We stop working on a roadmap item and come back if:

- **Metric regresses** — step was supposed to move X, X moved the wrong way
- **Cycle-to-ship time grows** without commensurate quality gain
- **Escalation rate grows** without commensurate reduction in self-delivered bugs
- **Token cost per build grows** more than 15% without matching quality gain
- **Owner feedback says the step produces worse products** — subjective trumps metrics

## How this document evolves

- Every completed step: mark with landing commit, date, and metric-delta observation.
- Every cancelled step: mark with reason.
- New items from owner conversations or retrospectives: add with a date and source reference.
- When a Part completes, write a retro at its end: what worked, what slipped, what we learned.

---

## Where we are on 2026-04-23

**Completed:**
- `feat/ecc-dna-transplant` branch: Phases 1–6 infrastructure (6 commits, 103 new tests)
- `feat/ecc-dna-transplant` branch: **P0.3** — profile-aware preamble-injector (10 new tests, 972-char section for saas-webapp)
- `feat/ecc-dna-transplant` branch: **P0.9** — variant tracker in eval phase (13 new tests, 02e emits heuristic_runs[], launcher persists to .rouge/heuristic-runs.jsonl sidecar)
- `feat/ecc-dna-transplant` branch: **P0.10** — structured retro + amendment proposals (16 new tests, 09-retro emits structured_retro + amendments_proposed, launcher queues to .rouge/amendments-proposed.jsonl + writes governance events)
- `feat/ecc-dna-transplant` branch: **P1.13** — research-before-solving detector (18 + 6 new tests, audit-recommender module + post-retro integration. Detects whack-a-mole via fix-ratio / recurring root_cause / rising escalations across last N cycles. Writes audit-recommended governance event when ≥1 signal fires. Codifies owner's "no partial solutions" preference.)
- main: **GC.1 + GC.2** — self-improve allowlist narrowed to generation/operational prompts only. Judge/instrument surfaces (02*, 06, 10, final/, seeding/03-taste, library/**, schemas/library-entry-v*, cycle-context-v*, _preamble.md) explicitly blocklisted. 10 new safety tests read the real rouge.config.json to prove the boundary holds. CLAUDE.md + VISION.md document the "judge never edits itself" principle.
- main: **P1.20** — `unknown` verdict escape hatch in 02e-evaluation.md. Distinct from `env_limited`: unknown = evidence didn't resolve; env_limited = code works, test env can't verify. Unknown criteria excluded from pass-rate denominator, trigger re-walk. Reduces hallucinated verdicts under thin evidence.
- main: **P5.1** — coverage gate enabled at baseline (lines 56 / branches 70 / functions 68 / statements 56 — 3 points below actual 59/74/71/59). Blocks regressions without demanding immediate improvement. Aspirational 80/80/75/80 target documented in .c8rc.json for ratchet-up.
- main: **P1.15** — closed-vocabulary confidence tags on all findings (high | moderate | low). High requires evidence_span. Low doesn't deduct from health score. Rules added to both 02c-code-review.md and 02e-evaluation.md.
- `feat/escalation-ux-polish` branch: **P0.1** — dashboard escalation UX (4 files, 477 dashboard tests green)

**Test count:** 471 launcher tests + 477 dashboard tests + 116 standalone module tests all passing except 1 pre-existing `claude -p` flake.

**Next unblocked steps:**
- P1.5 — per-FA iterative spec (owner's explicit "one task at a time" ask)
- P0.4 prompt side — language-reviewer dispatch instructions in evaluation-orchestrator
- P5.1 — flip coverage gate on
- P1.13 — research-before-solving detector (codifies owner's "no partial solutions" memory)

**What we are not doing right now:** harness-dependent items (listed in "Harness-dependent items" section). Those wait for P5.9's PoC + decision, scheduled after substantial independent work has landed.
