# Runner System — Eval Assertions

These assertions verify system-level behaviors managed by the launcher and spanning multiple phases.

## State Machine Assertions (12.1-12.5)

### AC 12.1: cycle_context.json schema
- [ ] Schema matches schemas/cycle-context.json
- [ ] Context accumulates across cycles (appended, not replaced)

### AC 12.2: State machine transitions
- [ ] All 14 states reachable
- [ ] Transitions follow defined rules

### AC 12.3: Full context passing
- [ ] claude -p receives complete cycle_context.json (not summarized)

### AC 12.3b: QA gate trigger
- [ ] After building completes → test-integrity → qa-gate
- [ ] QA FAIL → qa-fixing → test-integrity (loop)
- [ ] QA PASS → po-reviewing

### AC 12.4: QA fix loop
- [ ] QA fails → bug fix brief → rebuild → re-test
- [ ] 3 attempts on same criteria → escalate

### AC 12.5: PO Review trigger
- [ ] After QA passes → PO Review with full context including QA report

## Journey Log Assertions (15.1-15.6)

### AC 15.1: Journey.json schema
- [ ] Per-loop entries with: number, feature_area, branch, timestamps, verdicts, confidence, outcome

### AC 15.2: Journey append
- [ ] Entry appended after each loop (promoted, rolled back, or ongoing)

### AC 15.3: Rollback entries
- [ ] outcome=rolled_back with reason and learnings

### AC 15.4: Timeline renderer
- [ ] Can generate Mermaid timeline from journey.json

### AC 15.5: Feature evolution view
- [ ] Shows what changed per loop

### AC 15.6: Briefing inclusion
- [ ] Last N loops with outcomes and confidence trend included in morning briefing

## Meta-Loop Assertions (17.1-17.4)

### AC 17.1: Cross-product pattern detection
- [ ] After 3+ products, aggregate evaluation reports
- [ ] Identify recurring heuristic failures

### AC 17.2: Factory vs product classification
- [ ] Determine if failures are factory-level (stacks, templates) or product-level

### AC 17.3: Factory improvement specs
- [ ] Generate change specs targeting AI-Factory for recurring issues

### AC 17.4: Meta-analysis trigger
- [ ] Runs after every 5 completed products

## Notifier Assertions (18.1-19.7)

### AC 18.1: Slack bot running
- [ ] Bot connects via Socket Mode

### AC 18.2: Product-ready notification
- [ ] Structured: production URL, build time, quality summary, confidence

### AC 18.3: Pivot notification
- [ ] Status, what's happening, options (A/B/C/D)

### AC 18.4: Scope expansion notification
- [ ] Queued for morning briefing

### AC 18.5: Morning briefing
- [ ] Progress per feature area, highlights, issues, confidence trend, screenshots

### AC 18.6: Screenshot capture
- [ ] Primary screen + feature area screens captured and annotated

### AC 19.1-19.7: Feedback processing
- [ ] Messages received from Slack
- [ ] Parsed into distinct items
- [ ] Classified (product-change/global-learning/domain-learning/personal-preference/direction)
- [ ] Ambiguity detection with Slack confirmation
- [ ] Routed to Runner or Library
- [ ] Non-critical batched for briefing, critical sent immediately
