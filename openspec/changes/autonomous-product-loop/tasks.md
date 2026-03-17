## 1. Project Foundation & State Management

- [ ] 1.1 Define and implement `state.json` schema — current_state, cycle_number, feature_areas (with status), current_feature_area, last_evaluation, change_specs_pending, vision_check_results, confidence_history, timestamp
- [ ] 1.2 Implement state persistence module — write state after every state transition, atomic writes to prevent corruption
- [ ] 1.3 Implement crash recovery logic — read state.json on startup, determine resume action per state (building: check for deploy artifacts; evaluating: restart; analyzing: re-run from last report; waiting-for-human: check Slack)
- [ ] 1.4 Define vision document schema (YAML/JSON) — name, one_liner, persona, problem, emotional_north_star, reference_products (with dimensions and URLs), feature_areas (with user_journeys and acceptance_criteria), product_standard (overrides, additions, reference_screenshots)
- [ ] 1.5 Implement vision document parser — extract acceptance criteria as testable assertions, user journeys as simulatable flows, reference product dimensions, product standard overrides
- [ ] 1.6 Define product standard schema — inherits (global + domain), overrides (heuristic ID + modified threshold + justification), additions (project-specific heuristics in Library entry format), definition_of_done (plain English + heuristic count references)

## 2. The Library — Storage & Data Model

- [ ] 2.1 Design and implement Library storage format — file-based, one file per heuristic entry, directory structure: `library/global/`, `library/domain/{web,game,artifact}/`, `library/personal/`, `library/history/`
- [ ] 2.2 Implement heuristic entry schema — id, name, rule, measurement (with type: dom-analysis | screenshot-llm | lighthouse-metric | interaction-test | journey-test | api-test), threshold, type (functional | non-functional), tier (global | domain | personal), domain, source, version, status, deprecated_reason
- [ ] 2.3 Implement Library read API — query by tier, domain, status; return all active heuristics for a given evaluation context (global + relevant domain + personal fingerprint)
- [ ] 2.4 Implement Library write API — add new entry, update entry (increment version, preserve history), deprecate entry (set status, record reason), prune deprecated entries older than N months
- [ ] 2.5 Implement version history — every update creates a history entry with old value, new value, reason, date; stored in `library/history/`
- [ ] 2.6 Implement conflict detection — when adding/updating entries, check for conflicting active entries; flag conflicts for human resolution in next briefing

## 3. The Library — Day-One Seed

- [ ] 3.1 Seed product standards (functional): hierarchy-primary (DOM analysis, primary score ≥1.5x secondary), hierarchy-levels (3 visual weight tiers), three-click-rule (journey simulation ≤3 clicks), five-state-coverage (5 states per interactive screen), progressive-disclosure (≤7 primary actions visible), user-journey-completeness (100% journeys complete), error-recovery (100% error states have recovery path)
- [ ] 3.2 Seed design standards (functional): visual-consistency (≤2 font families, ≤5 sizes, ≤8 colors), interactive-feedback (100% elements respond to hover/click), animation-state-transitions (≥80% transitions animated), mobile-responsive (usable at 375px+, ≥44px tap targets), empty-state-guidance (100% empty states have CTA)
- [ ] 3.3 Seed engineering standards (non-functional): page-load-time (LCP <2000ms), time-to-interactive (TTI <3000ms), lighthouse-performance (score ≥80), lighthouse-accessibility (score ≥90), no-console-errors (0 errors), api-response-time (p95 <500ms reads, <1000ms writes)
- [ ] 3.4 Seed web domain heuristics: nav-persistent (nav visible on every route), above-fold-value (primary element ≥50% visible at 1440×900), form-validation-inline (100% inline), breadcrumb-depth (breadcrumbs at ≥3 levels deep)
- [ ] 3.5 Verify all seeded heuristics have valid measurement methods and thresholds by running them against a known-good reference product (Stripe dashboard or similar)

## 4. The Library — Personal Taste Fingerprint

- [ ] 4.1 Implement fingerprint entry schema — id, preference (plain English), evidence (list of {date, source_quote}), strength (0.0-1.0), last_expressed (date), contradictions (list), applies_to (all | web | game | artifact)
- [ ] 4.2 Implement pattern detection — after 3+ feedback instances on the same dimension, auto-create fingerprint entry with strength ≥0.7 and flag in next briefing
- [ ] 4.3 Implement strength calculation — 0.3 for single mention, 0.5 for 2 mentions, 0.7 for 3+, 1.0 for 5+ with no contradictions; contradictions reduce strength by 0.2 each
- [ ] 4.4 Implement decay — preferences not reinforced in 6+ months decay 0.1/month to floor of 0.2
- [ ] 4.5 Implement fingerprint query — return all entries with strength ≥0.5, formatted as design constraints with strength and evidence count

## 5. The Library — Feedback Classification

- [ ] 5.1 Implement feedback classifier — LLM-based analysis of feedback text to determine: product-change, global-learning, domain-learning, personal-preference, or direction
- [ ] 5.2 Implement classification logic — analyze each feedback item for scope (this product vs all products vs domain), dimension (functional vs non-functional), and specificity (general principle vs personal preference)
- [ ] 5.3 Implement ambiguity detection — when classification confidence is below threshold, generate Slack confirmation question with options
- [ ] 5.4 Implement feedback-to-heuristic conversion — translate classified feedback into Library entry format (derive id, rule, measurement, threshold from the feedback text)
- [ ] 5.5 Test classifier against 20+ example feedback statements covering all classification types, verify ≥85% accuracy

## 6. The Evaluator — Criteria Checking

- [ ] 6.1 Implement vision document criteria extractor — parse acceptance_criteria sections into testable assertions
- [ ] 6.2 Implement browser-based criteria testing — for each criterion, determine test approach (DOM query, interaction simulation, screenshot + LLM vision), execute, record pass/fail with evidence
- [ ] 6.3 Implement criteria failure classification — for each failure, determine: missing-feature (not built), broken-interaction (built but broken), or incomplete-implementation (partially built)
- [ ] 6.4 Implement criteria report generation — total, passed, failed, with per-failure: criterion text, expected, observed, screenshot, classification

## 7. The Evaluator — Product Sense Checking

- [ ] 7.1 Implement user journey simulator — given a journey (entry point, steps, goal), navigate the product using LLM-driven decisions (not scripted), attempting to complete the journey naturally
- [ ] 7.2 Implement friction point detection — after each action, assess: did the product respond as expected? Was there visual feedback? Was the next step obvious? Flag ambiguous or missing responses as friction points with severity (minor, moderate, major)
- [ ] 7.3 Implement journey failure reporting — when journey can't complete within 10 actions, report: journey name, progress, stuck point, what was tried, failure classification
- [ ] 7.4 Implement undiscovered flow exploration — when the simulator notices interactive elements not part of any defined journey, explore up to 3 undocumented paths and report findings
- [ ] 7.5 Test journey simulator against a known product (e.g., a simple deployed web app) — verify it can navigate, detect friction, and report failures accurately

## 8. The Evaluator — External Signal Collection

- [ ] 8.1 Implement browser QA integration — invoke browser QA tooling to run: page load check (all routes), console error check, interactive element check, form submission check, navigation check
- [ ] 8.2 Implement browser QA report parser — extract structured results: pages_tested, pages_passing, console_errors (with URL and message), dead_elements (with selector and URL), form_issues, navigation_issues
- [ ] 8.3 Implement Lighthouse integration — run Lighthouse on 3-10 key pages (landing, primary nav destinations, core journey endpoints), extract: Performance, Accessibility, SEO scores, LCP, FID/INP, CLS, TTI
- [ ] 8.4 Implement spec-completeness calculator — parse seed spec for all criteria, cross-reference with criteria check results, calculate: total, implemented-and-verified, implemented-but-failing, not-implemented, overall percentage, per-feature-area breakdown
- [ ] 8.5 Implement reference product screenshot capture — navigate to reference product URLs, capture screenshots of specified dimensions (navigation, data density, etc.), cache in Library for reuse

## 9. The Evaluator — Pairwise Comparison & Heuristics

- [ ] 9.1 Implement pairwise comparison — for each reference product dimension, capture screenshots of both products, present side-by-side to LLM vision with prompt "Which more closely matches professional standards?", record verdict: matches-reference, approaching-reference, significantly-below-reference
- [ ] 9.2 Implement comparison report — reference product name, per-dimension verdict, side-by-side screenshot evidence, specific observations (e.g., "Product uses 3 font sizes where Linear uses 2")
- [ ] 9.3 Implement heuristic evaluation engine — for each active Library heuristic, execute its measurement method, compare against threshold, record pass/fail with measured value and evidence
- [ ] 9.4 Implement measurement method dispatchers — dom-analysis (query DOM), screenshot-llm (capture + LLM vision), lighthouse-metric (extract from Lighthouse results), interaction-test (simulate interaction + verify response), journey-test (run journey simulation), api-test (call API + measure timing)
- [ ] 9.5 Test heuristic engine against seeded heuristics on a known product — verify all measurement methods execute correctly and thresholds are evaluated properly

## 10. The Evaluator — Composite Quality Report

- [ ] 10.1 Implement report aggregation — combine criteria check, product sense, browser QA, performance, spec-completeness, reference comparison, and heuristic results into single structured report
- [ ] 10.2 Implement confidence score calculation — weighted composite: spec-completeness 30%, criteria pass rate 25%, heuristic pass rate 20%, journey completion rate 15%, reference comparison 10% — non-functional scores reported separately
- [ ] 10.3 Implement recommended action logic — continue (confidence ≥0.9, all criteria pass), deepen (0.7-0.9, failures concentrated), broaden (0.7-0.9, missing features), notify-human (<0.7)
- [ ] 10.4 Test report generation against mock evaluation data — verify confidence calculation, action logic, and report structure

## 11. The Seeder — Interactive Swarm

- [ ] 11.1 Implement swarm orchestrator — manage state across disciplines (brainstorming, competition, taste, spec, design), track which disciplines have run, detect loop-back triggers
- [ ] 11.2 Implement loop-back trigger detection — design challenges spec (>3 click journeys), taste challenges scope (too broad/narrow), spec surfaces competition gap
- [ ] 11.3 Implement convergence detection — all disciplines run at least once, no new loop-back triggers in last pass → declare convergence
- [ ] 11.4 Implement vision document generator — produce structured vision document from swarm outputs matching the defined schema
- [ ] 11.5 Implement product standard generator — inherit global + domain from Library, add project overrides and additions, generate definition of done
- [ ] 11.6 Implement seed spec generator — produce feature areas with user journeys (step-by-step), acceptance criteria, data model sketch, interaction patterns, edge cases, explicit scope boundaries
- [ ] 11.7 Implement seed approval flow — present summary (feature area count, criteria count, journey count, heuristic count, definition of done, estimated cycles), handle approval/revision

## 12. The Runner — Core Loop Engine

- [ ] 12.1 Implement state machine — states: seeding, building, evaluating, analyzing, generating-change-spec, vision-checking, waiting-for-human, complete — with defined transitions
- [ ] 12.2 Implement Factory invocation — pass scoped brief (spec, product standard, Library heuristics, reference details, previous evaluation, deployment target), receive completion report (URL, what was built, what was skipped, divergences)
- [ ] 12.3 Implement evaluation trigger — after Factory reports completion, invoke Evaluator with deployment URL and full evaluation context
- [ ] 12.4 Implement analysis engine — read composite quality report, execute recommended action logic, generate change spec or transition state
- [ ] 12.5 Implement change spec generation — translate gap reports into structured change specs with: target feature area, type (deepen/broaden/fix), gaps (source, description, evidence, acceptance criterion), Library context, reference comparison, scope hint
- [ ] 12.6 Implement change spec prioritization — missing-feature > broken-interaction > major friction > global heuristic failures > domain failures > personal failures > non-functional failures
- [ ] 12.7 Implement retry limit — after 5 deepen/broaden cycles on same feature area without reaching `continue`, escalate to human with summary of attempts

## 13. The Runner — Vision Checking & Confidence

- [ ] 13.1 Implement vision check — re-read vision document, review all completed work, LLM judgment on alignment, produce vision check report (alignment, gaps, scope recommendations, confidence)
- [ ] 13.2 Implement autonomous scope expansion — when vision check reveals needed capability not in original vision, add to feature queue if confidence >80%, flag in briefing if 70-80%, escalate if <70%
- [ ] 13.3 Implement pivot detection — when vision check reveals fundamental premise issues, compile evidence and notify human with structured pivot proposal
- [ ] 13.4 Implement confidence trend tracking — record confidence after each cycle, detect 3-cycle declining trends and 5-cycle plateaus, flag in briefing
- [ ] 13.5 Implement feature area ordering — dependency analysis, foundation first, cross-cutting last, present order to human during seeding for approval

## 14. The Runner — Meta-Loop

- [ ] 14.1 Implement cross-product pattern detection — after 3+ products, aggregate evaluation reports, identify heuristics that fail across multiple products
- [ ] 14.2 Implement factory-level vs product-level classification — determine whether recurring failures are addressable at the Factory level (stacks, skills, templates) or product level
- [ ] 14.3 Implement Factory improvement spec generation — create change specs targeting AI-Factory for recurring factory-level issues
- [ ] 14.4 Implement meta-analysis trigger — run after every 5 completed products

## 15. The Notifier — Slack Integration

- [ ] 15.1 Implement Slack API client — send messages to configured channel/DM using Block Kit for structured formatting
- [ ] 15.2 Implement product-ready notification — structured message with deployment URL, build time, quality summary, confidence score
- [ ] 15.3 Implement pivot notification — structured message with status, what's happening, what was tried, lettered options (A/B/C/D)
- [ ] 15.4 Implement scope expansion notification — queued for morning briefing, includes capability added, reason, confidence, revert option
- [ ] 15.5 Implement morning briefing — progress per feature area, highlights, issues resolved, items needing input, confidence trend, screenshots (up to 5, annotated)
- [ ] 15.6 Implement briefing screenshot capture — screenshot primary screen + each feature area's main screen + significant design decision screens, annotate with captions
- [ ] 15.7 Implement Saturday demo compilation — all products worked on, per-product status/URL/key achievement/screenshots, Library growth stats, meta-loop findings, cross-product patterns

## 16. The Notifier — Feedback Ingestion

- [ ] 16.1 Implement Slack message listener — receive human messages in response to notifications
- [ ] 16.2 Implement feedback parser — split message into distinct feedback items, handle multi-item messages
- [ ] 16.3 Implement feedback classifier — for each item, classify as product-change, global-learning, domain-learning, personal-preference, or direction using LLM analysis
- [ ] 16.4 Implement ambiguity handler — when classification confidence is low, send Slack confirmation with options
- [ ] 16.5 Implement voice transcription cleanup — detect rough transcription, clean up, present interpreted items for confirmation before routing
- [ ] 16.6 Implement feedback routing — route classified items to Runner (change specs, direction) or Library (standards, domain taste, fingerprint)
- [ ] 16.7 Implement batching logic — queue non-critical events for morning briefing, send critical events immediately (confidence <70%, build failure, pivot, budget threshold)

## 17. Integration & End-to-End Testing

- [ ] 17.1 E2E: Seed a landing page product → full autonomous loop → verify quality report shows ≥85% heuristic pass rate → verify Slack notification fires
- [ ] 17.2 E2E: Seed a multi-feature web product → verify feature-area cycling → verify per-area evaluation → verify cross-area vision check
- [ ] 17.3 E2E: Inject known quality issue (missing interactive feedback on buttons) → verify Evaluator catches it → verify Runner generates change spec → verify Factory fixes it on next cycle
- [ ] 17.4 E2E: Simulate 3 cycles of feedback with recurring theme (e.g., "flat hierarchy") → verify Library creates fingerprint entry with strength ≥0.7 → verify future evaluations apply it
- [ ] 17.5 E2E: Crash mid-cycle (kill process) → restart → verify resume from checkpoint → verify no lost state
- [ ] 17.6 E2E: Simulate confidence dropping below 70% → verify pivot notification fires immediately → verify Runner pauses → verify human response resumes loop
- [ ] 17.7 E2E: Run 5 products → verify meta-loop triggers → verify cross-product pattern detection produces Factory improvement spec
