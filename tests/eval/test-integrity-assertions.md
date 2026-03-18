# Test Integrity Gate — Eval Assertions

**Prompt:** `src/prompts/loop/02a-test-integrity.md`
**Model:** sonnet

## Mock Input

`cycle_context.json` containing:
- `active_spec` with 5 acceptance criteria (AC-trip-1 through AC-trip-5)
- `po_checks` with 3 PO check IDs
- A test suite in the project with:
  - 3 tests mapping to AC-trip-1, AC-trip-2, AC-trip-3 (coverage gaps: AC-trip-4, AC-trip-5)
  - 1 test mapping to removed criterion AC-old-1 (orphaned)
  - 1 test where the criterion text hash doesn't match (stale)

## Assertions

### AC 6.1: Test-to-spec traceability
- [ ] Output `test_integrity_report` contains a `traceability_map` or equivalent showing test → criterion_id mapping
- [ ] Every mapped test has a `criterion_id` or `po_check_id`

### AC 6.2: Spec parser
- [ ] All 5 acceptance criteria IDs extracted from active_spec
- [ ] All 3 PO check IDs extracted

### AC 6.3: Test suite scanner
- [ ] Existing tests scanned and mapped to criteria

### AC 6.4: Coverage gap detection
- [ ] AC-trip-4 and AC-trip-5 identified as gaps (criteria with no test)
- [ ] Gaps appear in output as `coverage_gaps` or equivalent

### AC 6.5: Orphaned test detection
- [ ] Test mapping to AC-old-1 identified as orphaned
- [ ] Orphaned tests listed in output

### AC 6.6: Stale test detection
- [ ] Stale test (hash mismatch) identified
- [ ] Stale tests listed in output

### AC 6.7: Test generation for gaps
- [ ] New tests generated for AC-trip-4 and AC-trip-5
- [ ] Generated tests have proper criterion_id annotations

### AC 6.8: Stale test regeneration
- [ ] Stale test regenerated from updated criterion text
- [ ] Hash updated after regeneration

### AC 6.9: Orphaned test removal
- [ ] Orphaned test excluded or marked for removal

### AC 6.10: Integrity report
- [ ] Output contains `test_integrity_report` with:
  - `spec_coverage_pct` (should be 100% after generation)
  - `po_check_coverage_pct`
  - `orphaned_count` (1)
  - `stale_regenerated_count` (1)
  - `newly_generated_count` (2)

### AC 6.11: Coverage threshold
- [ ] If coverage < 100% before generation, phase generates missing tests before reporting
- [ ] Final `spec_coverage_pct` = 100% (or phase reports why generation failed)

### AC 6.12: Verdict
- [ ] `test_integrity_report.verdict` is either "PASS" or "FAIL"
- [ ] PASS only if spec_coverage_pct = 100%

### Protocol assertions (all phases)
- [ ] Reads cycle_context.json
- [ ] Writes results back to cycle_context.json
- [ ] Does NOT invoke slash commands
- [ ] Does NOT modify state.json
- [ ] Does NOT decide next phase
- [ ] Git commits changes
