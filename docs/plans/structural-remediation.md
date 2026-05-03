# Structural Remediation Plan

**Date:** 2026-05-03
**Status:** PLANNED (next session)
**Source:** Three deep audits (artifact dependencies, UI states, prompt-disk contracts)
**Total issues:** 36 (7 high, 16 medium, 13 low)

---

## Problem Statement

Rouge's seeding-to-build pipeline has no enforced artifact contracts. Disciplines
write files in whatever shape the LLM decides, the bridge checks existence and byte
count but not structure, two sources of truth exist for most data, and XS-tier
projects have dependency holes where skipped disciplines leave gaps no one fills.

These aren't individual bugs. They're architectural gaps that produce a different
class of failure for every project size.

---

## Structural Issue 1: No Artifact Contracts

**Problem:** Each discipline "should" write certain files, but there's no enforced
schema. discipline-artifacts.ts checks file existence and minBytes, not structure.
A 200-byte JSON file with entirely wrong fields passes validation.

**Evidence:**
- vision.json schema says `persona: {who, context}`, reality writes `persona: "flat string"` (V-01)
- product_standard.json required by finalize but no prompt defines its schema (V-02)
- task_ledger stories have inconsistent shapes (foundation minimal vs feature full) (V-03)

**Fix: Artifact schema validation layer**

Create `dashboard/src/bridge/artifact-schemas.ts`:
- Define JSON schemas for each artifact: vision.json, sizing.json, milestones.json,
  infrastructure_manifest.json, product_standard.json, task_ledger.json
- Schemas match what prompts ACTUALLY produce (fix schema to match reality, not
  reality to match schema)
- discipline-artifacts.ts calls schema validation after byte-count check
- Validation errors are structured: which field is wrong, what was expected
- Validation errors surface in chat as system notes (not silent)

**Files to modify:**
- `dashboard/src/bridge/discipline-artifacts.ts` — add schema validation calls
- `dashboard/src/bridge/artifact-schemas.ts` — new file with schemas
- `dashboard/src/bridge/seeding-finalize.ts` — use schema validation
- `schemas/vision-v1.json` — update to match reality (flat persona string, scope object)

**Effort:** ~2 hours

---

## Structural Issue 2: Two Sources of Truth

**Problem:** Multiple files claim to be the source of truth for the same data.
No merge strategy, no version tracking, silent overwrites.

| Data | Source 1 | Source 2 | Conflict |
|------|----------|----------|----------|
| Deploy target | vision.json.infrastructure.deployment_target | infrastructure_manifest.json.deploy.target | SPEC writes vision, INFRA writes manifest, finalize only fills empty |
| Milestones | task_ledger.json | seed_spec/milestones.json | Written by different code paths, can drift |
| Stories | task_ledger.json | state.json.milestones[].stories[] | Loaded once at foundation-eval, never re-synced |
| Discipline status | seeding-state.json | state.json.seedingProgress.disciplines[] | Written by different functions, can desync |
| Project size | seed_spec/sizing.json | seeding-state.json.project_size | Written at different times |

**Fix: Canonical source registry + read helpers**

For each data type, designate ONE canonical source. All reads go through a helper
that reads from the canonical source. All writes go through a helper that writes
to the canonical source AND propagates to the display copy.

| Data | Canonical source | Display copy | Propagation |
|------|-----------------|--------------|-------------|
| Deploy target | infrastructure_manifest.json | vision.json | Finalize copies manifest → vision (overwrite, not fill) |
| Milestones | task_ledger.json | state.json.milestones | Loaded at foundation-eval, re-read at generating-change-spec |
| Discipline status | seeding-state.json | state.json.seedingProgress | markDisciplineComplete writes both atomically |
| Project size | seed_spec/sizing.json | seeding-state.json.project_size | Classifier writes both |

**Files to modify:**
- `dashboard/src/bridge/seeding-finalize.ts` — change propagateInfrastructureFromManifest to overwrite, not fill
- `src/launcher/rouge-loop.js` — re-read task_ledger at more transition points (partially done)
- `dashboard/src/bridge/seeding-state.ts` — ensure atomic dual-write for discipline status

**Effort:** ~1.5 hours

---

## Structural Issue 3: XS Tier Dependency Holes

**Problem:** Five disciplines are skipped for XS projects. The artifacts they produce
are assumed to exist by downstream code. Nobody fills the gaps.

| Skipped discipline | Missing artifact | Who needs it | Impact |
|-------------------|------------------|--------------|--------|
| Infrastructure | infrastructure_manifest.json | foundation-stories.js, provision-infrastructure.js, seeding-finalize.ts | Foundation can't generate stories, provisioner has no target |
| Design | design/pass-*.yaml, screen-spec.md | 02e-evaluation.md (design lens), 01-building.md (visual reference) | Builder has no visual spec, evaluator can't check design |
| Legal-privacy | legal/*.md | seeding-finalize.ts (optional), ship-promote | Product ships with no T&Cs |
| Competition | seed_spec/competition.md | 04-analyzing.md (competitive context) | Analyzer has no competitive reference |
| Marketing | marketing/*.md | ship-promote (landing page) | No landing page at ship |

**Fix: Tier-appropriate artifact stubs**

When the classifier runs and skips disciplines, it should write MINIMAL STUB
artifacts for each skipped discipline so downstream consumers don't crash:

```javascript
// In auto-classifier.ts, after classification:
if (projectSize === 'XS') {
  // Write minimal infrastructure manifest
  writeStub('infrastructure_manifest.json', {
    deploy: { target: inferDeployTarget(brainstormingText) },
    database: null,
    auth: null,
    integrations: [],
    stub: true,
    stub_reason: 'XS project, infrastructure discipline skipped',
  })
  // Write minimal design stub
  writeStub('design/design-brief.md', 
    '# Design Brief (auto-generated for XS)\n\nNo design discipline ran. ' +
    'Builder should use brainstorming visual notes for guidance.\n')
  // Legal: no stub needed (finalize doesn't require it)
  // Competition: no stub needed (analyzer handles absence)
  // Marketing: no stub needed (ship-promote handles absence)
}
```

The `stub: true` flag lets downstream code know this is auto-generated, not
human-reviewed. The build loop can reference it but the evaluator should
not judge design quality against a stub.

**Files to modify:**
- `dashboard/src/bridge/auto-classifier.ts` — write stubs after classification
- `src/launcher/foundation-stories.js` — handle `stub: true` in manifest
- `src/prompts/loop/01-building.md` — note that design stubs mean "use brainstorming notes"

**Effort:** ~1.5 hours

---

## Structural Issue 4: product_standard.json Ghost Artifact

**Problem:** seeding-finalize.ts requires product_standard.json (≥200 bytes) but no
discipline prompt defines its schema or instructs Claude to write it. Every project
depends on the orchestrator spontaneously generating this file.

**Evidence:** highlow doesn't have one. Finalization will block.

**Fix: Generate deterministically from library defaults**

product_standard.json is supposed to contain quality heuristics inherited from
the library. This isn't creative work — it's a merge of global defaults + domain
overrides. Generate it mechanically:

```javascript
// In seeding-finalize.ts, before artifact validation:
if (!existsSync(join(projectDir, 'product_standard.json'))) {
  const defaults = readJson(join(ROUGE_ROOT, 'library/global/quality-heuristics.json'))
  const vision = readJson(join(projectDir, 'vision.json'))
  const domain = vision?.complexity_profile?.primary || 'web-app'
  const domainOverrides = readJson(join(ROUGE_ROOT, `library/domains/${domain}/overrides.json`))
  const standard = { ...defaults, ...domainOverrides, generated: true }
  writeJsonAtomic(join(projectDir, 'product_standard.json'), standard)
}
```

Remove product_standard.json from the "must exist with ≥200 bytes" check. If it
exists, use it. If not, generate from library defaults.

**Files to modify:**
- `dashboard/src/bridge/seeding-finalize.ts` — generate if missing, remove from required check
- `library/global/quality-heuristics.json` — ensure this exists (it does)

**Effort:** ~30 minutes

---

## Structural Issue 5: Dashboard UI State Bugs

**Problem:** 13 bugs in how the dashboard renders different project states.

**Priority fixes (from audit-dashboard-ui-states.md):**

### HIGH:
1. **Home page seedingProgress mapping** — `page.tsx:23-68` never maps seedingProgress
   from bridge scanner. Fix: add seedingProgress to mapBridgeProjects().
2. **Escalation drawer picks wrong escalation** — uses `escalations[0]` not first pending.
   Fix: filter to `escalations.find(e => e.status === 'pending')`.
3. **Progress counter hardcoded to 8** — bridge-mapper defaults totalCount to 8.
   Fix: use `applicable_disciplines.length` or count non-skipped disciplines.

### MEDIUM:
4. **Stepper/chat discipline ordering mismatch** — sizing and taste swapped between views.
   Fix: both should read from same DISCIPLINE_SEQUENCE constant.
5. **State inconsistency** — state.json says ready but seeding-state says incomplete.
   Fix: finalize must update seeding-state.json.seeding_complete when promoting to ready.

**Files to modify:**
- `dashboard/src/app/page.tsx` — map seedingProgress
- `dashboard/src/app/projects/[name]/page.tsx` — filter pending escalations
- `dashboard/src/lib/bridge-mapper.ts` — dynamic totalCount
- `dashboard/src/components/discipline-stepper.tsx` — verify ordering
- `dashboard/src/components/chat-panel.tsx` — verify ordering matches stepper

**Effort:** ~1.5 hours

---

## Structural Issue 6: Classifier Boundaries

**Problem:** entity_count=2 tips a single-page card game to S-tier. The max-of-all-signals
approach means one borderline signal overrides four clear XS signals.

**Fix: Majority vote with weighted override**

Replace `maxTier` with a voting system:
1. Each signal votes for a tier
2. Majority wins (3/5 signals say XS → project is XS)
3. Exception: if ANY signal is L or XL, escalate to at least M (genuinely complex projects
   shouldn't be under-scoped even if most signals are low)

```javascript
function classifyByVote(perSignal) {
  const votes = Object.values(perSignal)
  const counts = {}
  for (const tier of votes) counts[tier] = (counts[tier] || 0) + 1
  
  // If any signal is L/XL, floor at M
  if (votes.some(t => ['L', 'XL'].includes(t))) {
    return maxTier('M', majorityTier(counts))
  }
  return majorityTier(counts)
}
```

Also adjust entity_count boundary: `[2, 5, 8, 14]` so 2 entities stays XS.

**Files to modify:**
- `dashboard/src/bridge/auto-classifier.ts` — majority vote + boundary adjustment
- `src/launcher/project-sizer.js` — keep in sync

**Effort:** ~30 minutes

---

## Implementation Order (dependency-aware)

| Phase | Issue | Effort | Blocks |
|-------|-------|--------|--------|
| 1 | Issue 6: Classifier boundaries | 30 min | Everything (wrong tier cascades) |
| 2 | Issue 4: product_standard.json | 30 min | Finalization |
| 3 | Issue 3: XS tier stubs | 1.5 hrs | Foundation stories, build loop |
| 4 | Issue 2: Canonical sources | 1.5 hrs | Consistent data |
| 5 | Issue 1: Artifact schema validation | 2 hrs | Quality gate |
| 6 | Issue 5: Dashboard UI bugs | 1.5 hrs | User experience |

**Total estimated: ~7.5 hours**

Phase 1-2 unblock highlow immediately. Phase 3-4 fix structural gaps for all
tiers. Phase 5-6 add quality gates and fix the dashboard.

---

## Test Plan

After each phase:
1. Run `cd dashboard && npm test` (490 tests)
2. Run `npm test` from repo root
3. Delete highlow, re-seed, verify:
   - XS project: classifier says XS, 4 disciplines run, stubs written, build starts
   - S project: 7 disciplines run, manifest written, foundation stories generated
4. Check dashboard renders correctly for seeding + building states

---

## Acceptance Criteria for "Structural Remediation Complete"

1. Every artifact has a schema. discipline-artifacts.ts validates structure, not just existence.
2. Each data type has ONE canonical source. No conflicting copies.
3. XS projects have stub artifacts for skipped disciplines. No downstream crashes.
4. product_standard.json generated mechanically. No ghost artifacts.
5. Dashboard renders correctly for all 10 scenarios in the UI audit.
6. Classifier uses majority vote. entity_count=2 stays XS.
7. highlow seeds, builds, and evaluates end-to-end without manual intervention.
