# End-to-End Scenarios — Eval Assertions

These are integration scenarios that exercise the full loop. Each requires multiple phases executing in sequence.

### E2E 20.1: Happy path — seed → build → test-integrity → QA → PO Review → promote
- [ ] Three-phase evaluation produces integrity report, QA report, and PO Review report
- [ ] All reports follow their respective schemas

### E2E 20.2: Bug detection loop
- [ ] Injected bug (broken form) caught by QA gate
- [ ] Bug fix brief generated
- [ ] QA re-runs after fix
- [ ] PO Review only runs after QA passes

### E2E 20.3: Quality improvement loop
- [ ] Injected quality issue (flat hierarchy) passes QA
- [ ] PO Review catches it as quality gap
- [ ] NEW spec generated (not bug fix)
- [ ] New spec goes through design mode → full pipeline

### E2E 20.4: Stale test detection
- [ ] Spec changed but tests didn't → Test Integrity detects
- [ ] Tests regenerated
- [ ] QA runs with fresh tests

### E2E 20.5: Multi-feature cycling
- [ ] Feature areas cycled in dependency order
- [ ] Per-area evaluation
- [ ] Cross-area vision check

### E2E 20.6: Taste fingerprint accumulation
- [ ] 3 cycles of recurring feedback theme
- [ ] Library fingerprint entry created
- [ ] Future PO Reviews apply the preference

### E2E 20.7: Regression → rollback
- [ ] Loop makes product worse
- [ ] Regression detected
- [ ] Rollback: PR closed, staging reverted, learnings preserved
- [ ] Next loop incorporates rollback learnings

### E2E 20.8: Dual environment
- [ ] Factory deploys to staging only
- [ ] Promotion only on pass
- [ ] Rollback doesn't affect production

### E2E 20.9: Journey log accumulation
- [ ] journey.json grows across loops
- [ ] Timeline renderable
- [ ] Rollback entries present

### E2E 20.10: PR lifecycle
- [ ] Branch created per loop
- [ ] Structured PR description
- [ ] Merged on promotion, closed on rollback

### E2E 20.11: Crash recovery
- [ ] Crash at each state → restart → resume from checkpoint
- [ ] No lost state

### E2E 20.12: Confidence drop → pivot
- [ ] Confidence drops below 70%
- [ ] Pivot notification sent
- [ ] Runner pauses
- [ ] Human response resumes

### E2E 20.13: Meta-loop
- [ ] 5 products completed
- [ ] Cross-product patterns detected
- [ ] Factory improvement spec generated

### E2E 20.14: Full happy path
- [ ] Seed → build → staging → test integrity → QA pass → PO PRODUCTION_READY → promote → Slack notification → human feedback → Library updated → journey log complete
