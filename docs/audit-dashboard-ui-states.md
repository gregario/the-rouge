# Dashboard UI State Rendering Audit

**Date:** 2026-05-03
**Scope:** Does the dashboard correctly render the right UI for every combination of project tier x build state?
**Method:** Code reading only, no runtime testing.

---

## Summary

**Total bugs found: 13**
**Severity breakdown:** 3 high, 5 medium, 5 low

### Worst 3 bugs

1. **[BUG-1] Home page does not pass `seedingProgress` to project cards for bridge projects** (HIGH) -- The bridge summary mapper on the home page never maps `seedingProgress` from the scanner, so the project card's discipline progress bar never renders for seeding projects fetched via the bridge. The card shows an empty progress area.

2. **[BUG-5] `totalCount` defaults to 8 when missing, but applicable disciplines vary by tier** (MEDIUM-HIGH) -- The bridge-mapper defaults `totalCount` to 8 when the field is missing from raw state. XS projects have 4 applicable disciplines, S projects have 7. This causes the project card's segmented bar (and any progress percentage) to show e.g. "4 / 8" for a completed XS project instead of "4 / 4".

3. **[BUG-7] ActionBar escalation prop reads `escalations[0]` regardless of pending/resolved status** (HIGH) -- The project page passes `project.escalations[0]` to ActionBar, but the filtered `pendingEscalations` array (used for the inline cards) may be empty while `escalations[0]` is resolved. This causes the "Respond to Escalation" button and the EscalationDrawer to reference a resolved escalation when no pending ones exist, or to reference the wrong escalation if `escalations[0]` is resolved but `escalations[1]` is pending.

### Completely broken scenarios

No scenario is *completely* broken (renders nothing / crashes). Scenarios 1 and 10 have the most issues where the user sees misleading data.

---

## Scenario-by-Scenario Trace

---

### Scenario 1: XS project in seeding (brainstorming in progress)

**Data flow:** `state.json.current_state = "seeding"`, `seedingProgress.currentDiscipline = "brainstorming"`, `seedingProgress.applicableDisciplines` is undefined (classifier hasn't run yet -- it runs after brainstorming completes).

#### Stepper

- **Expected:** Only "Brainstorming" visible (pre-classification).
- **Actual:** Correct. `discipline-stepper.tsx:126-128` -- when `applicableDisciplines` is undefined, `visibleDisciplines = ['brainstorming']`. Only brainstorming shows. Status is derived at line 169: `currentDiscipline === 'brainstorming'` and `rawStatus === 'pending'` => `'in-progress'`. Spinning icon renders.

#### Chat panel

- **Expected:** Chat grouped under "Brainstorming" discipline section with messages.
- **Actual:** Correct. `chat-panel.tsx:127-128` -- when `applicableDisciplines` is undefined, falls back to `DEFAULT_DISCIPLINE_SEQUENCE`. Messages tagged with `_discipline: 'brainstorming'` group under the first section. Auto-expanded via `useEffect` at line 143.

#### Home page card

- **Expected:** Card in "Specs" table row (state is 'seeding', caught by `specStates`). Discipline progress bar visible.
- **Actual:** **[BUG-1]** The card does NOT show discipline progress from the bridge. The home page's `mapBridgeProjects()` (page.tsx:23-68) never maps `seedingProgress` from the scanner response. The `seedingProgress` field is absent on the returned `ProjectSummary`, so `project-card.tsx:174` (`isSeeding && project.seedingProgress`) is falsy. The card renders with an empty progress area.
  - **File:line:** `/dashboard/src/app/page.tsx:23-68` -- `seedingProgress` is not extracted from the bridge response `p`.
  - **Note:** The `ProjectSummary` type (types.ts:226) *does* define `seedingProgress?: SeedingProgress`, and the scanner likely returns the data. But the mapping function omits it.

**Additionally:** XS seeding projects appear in the "Specs" section (the SpecsTable), not as a card. The SpecsTable renders a `SpecDepthPill` which for any seeding project returns `'brainstorm'` regardless of how far along disciplines are.

- **[BUG-2] (LOW)** `spec-depth-pill.tsx:30-34` -- `depthForProject` returns `'brainstorm'` for all seeding projects, ignoring discipline progress. A project with 6/7 disciplines complete still shows "brainstorm". The code has a TODO comment acknowledging this.
  - **File:line:** `/dashboard/src/components/spec-depth-pill.tsx:30-34`

---

### Scenario 2: XS project, brainstorming complete, classifier just ran

**Data flow:** After brainstorming completes, the auto-classifier writes `sizing.json` with `project_size: "XS"`. The bridge's `mergeSeedingProgress()` calls `readProjectSize()` and `listApplicableDisciplines('XS')` which returns `['brainstorming', 'taste', 'sizing', 'spec']` (the 4 XS disciplines).

The `seedingProgress.applicableDisciplines` is now set. `currentDiscipline` advances to `'sizing'` (auto-completed by classifier) then to `'taste'`.

#### Does stepper update to show 4 applicable disciplines?

- **Expected:** Stepper shows brainstorming (complete), sizing (complete/auto), taste (in-progress), spec (pending). Total 4 visible.
- **Actual:** Correct. `discipline-stepper.tsx:126-128` -- `applicableDisciplines = ['brainstorming', 'taste', 'sizing', 'spec']`. `visibleDisciplines` filters `DISCIPLINE_ORDER` by this list.

**[BUG-3] (MEDIUM)** Stepper's `DISCIPLINE_ORDER` at line 8-18 defines the sequence as: `brainstorming, sizing, taste, competition, spec, infrastructure, design, legal-privacy, marketing`. But `DISCIPLINE_SEQUENCE` in `bridge/types.ts:263` defines: `brainstorming, sizing, taste, competition, spec, infrastructure, design, legal-privacy, marketing`. These happen to match. However, `DISCIPLINE_TIERS` in `tier-registry.ts:23-33` lists them in insertion order: `brainstorming, competition, taste, sizing, spec, infrastructure, design, legal-privacy, marketing`. `listApplicableDisciplines` returns them in insertion order of `DISCIPLINE_TIERS`, which is: `brainstorming, taste, sizing, spec` for XS (competition is M+). The stepper filters `DISCIPLINE_ORDER` by `applicableDisciplines.includes()`, preserving `DISCIPLINE_ORDER`'s sequence: `brainstorming, sizing, taste, spec`. So the stepper shows `brainstorming -> sizing -> taste -> spec`.

Meanwhile, the chat panel at `chat-panel.tsx:127` uses `applicableDisciplines` directly as the ordering. The applicable list from `listApplicableDisciplines` returns `['brainstorming', 'competition' (filtered out for XS), 'taste', 'sizing', 'spec']` -> wait, for XS, competition is M+ so filtered out. The actual return is `['brainstorming', 'taste', 'sizing', 'spec']` (insertion order of DISCIPLINE_TIERS where tier <= XS). So chat panel orders: `brainstorming, taste, sizing, spec`.

Stepper orders: `brainstorming, sizing, taste, spec` (DISCIPLINE_ORDER filtered).
Chat panel orders: `brainstorming, taste, sizing, spec` (applicableDisciplines from tier-registry).

**The discipline order disagrees between stepper and chat panel.** The stepper shows `brainstorming -> sizing -> taste -> spec` but the chat sections appear as `brainstorming -> taste -> sizing -> spec`.

- **File:line:** `/dashboard/src/components/discipline-stepper.tsx:8-18` (DISCIPLINE_ORDER) vs `/dashboard/src/bridge/tier-registry.ts:23-33` (DISCIPLINE_TIERS insertion order used by `listApplicableDisciplines`).

#### Do skipped disciplines show in stepper?

- **Expected:** Skipped disciplines (competition, infrastructure, design, legal-privacy, marketing) should NOT appear in the stepper for XS. A summary count appears at the bottom.
- **Actual:** Correct. `discipline-stepper.tsx:130-132` calculates `skippedCount = DISCIPLINE_ORDER.length - applicableDisciplines.length = 9 - 4 = 5`. Line 232-239 renders "5 disciplines skipped (XS project)".

---

### Scenario 3: XS project, seeding complete, ready to build

**Data flow:** `state.json.current_state = "ready"`. All applicable disciplines complete. `seedingProgress` populated. Milestones populated from spec decomposition (1 milestone for XS).

#### Action bar

- **Expected:** "Start Build" button visible.
- **Actual:** Correct. `action-bar.tsx:373-379` -- `state === 'ready'` && `!buildRunning` renders the Start Build button.

#### Milestone timeline

- **Expected:** 1 milestone visible (for XS projects, spec creates a single milestone).
- **Actual:** Depends on whether `state.json.milestones` is populated. If populated, `project.milestones.length > 0` is true, and the milestone card renders (page.tsx:373). If empty (e.g. seeding finalization race), `mergeMilestonesFromLedger` pulls from `task_ledger.json`. **Correct behavior either way.**

#### Foundation for XS

- **Expected:** XS projects may or may not have a Foundation milestone -- this is determined by the spec decomposition.
- **Actual:** The `ProvisioningChecklist` only renders when the selected milestone's title equals `"Foundation"` AND `project.foundation?.provisioning_steps` has entries (page.tsx:384-389). For XS projects without a Foundation milestone, this correctly doesn't render. No bug here.

#### Build tab state

- **Expected:** Build tab disabled (state is 'ready' and not building).
- **Actual:** Correct. `page.tsx:327` -- `buildDisabled = isSeeding || (project.state === 'ready' && !buildRunning)` = true. Default tab is 'spec'.

---

### Scenario 4: S project in seeding

**Data flow:** S-tier applicable disciplines: `brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy` (7 disciplines -- competition and marketing are M+).

#### Stepper shows 7 disciplines?

- **Expected:** 7 disciplines visible.
- **Actual:** Correct after classification. Pre-classification (during brainstorming), only brainstorming shows. Post-classification, `applicableDisciplines` has 7 entries. Stepper filters by them.

**[BUG-4] (LOW)** Order mismatch carries over from BUG-3. Stepper shows S disciplines in `DISCIPLINE_ORDER`: `brainstorming, sizing, taste, spec, infrastructure, design, legal-privacy`. Chat panel shows them in `DISCIPLINE_TIERS` insertion order: `brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy`. Sizing and taste are swapped between the two.

#### Infrastructure/Design/Legal visible and pending?

- **Expected:** Yes, visible with 'pending' status.
- **Actual:** Correct. The mapper's `mapSeedingProgress` narrows each discipline against `SEEDING_DISCIPLINES` and each status against `DISCIPLINE_STATUSES`. Valid disciplines in the S tier all appear.

---

### Scenario 5: S project, seeding complete but SEEDING_COMPLETE rejected

**Data flow:** Claude emits `[SEEDING_COMPLETE]` but the finalization check in `seeding-finalize.ts` rejects it (e.g., missing artifact). `seeding-state.json` has `seeding_complete: null`, `pending_correction` is set. `state.json.current_state` remains `"seeding"`.

#### What does user see?

- **Expected:** Seeding UI continues. The pending correction is delivered to Claude on the next turn. User sees the chat panel with the current discipline still active.
- **Actual:** Correct at the UI layer. The `pending_correction` field is handled by the seed handler on the next message send, not rendered in the UI. The stepper and chat continue showing the current discipline as in-progress.

#### `pending_correction` visible?

- **Expected:** Not directly visible to the user (it's an internal mechanism).
- **Actual:** Correct -- no component reads `pending_correction`. However, if a `system_note` chat message was appended during the rejection (by `appendPendingCorrection`'s caller or the repair pass), it would appear in the chat.

**[BUG-5] (MEDIUM-HIGH)** If the rejection happens on the last applicable discipline but not all disciplines are actually complete, the `totalCount` in `seedingProgress` may be stale. The mapper at `bridge-mapper.ts:136` defaults `totalCount: raw.totalCount ?? 8`. For an S project with 7 applicable disciplines, if the launcher wrote `totalCount: 8` (the pre-classification count), the progress indicator shows "6/8" instead of "6/7". This is a data source issue rather than a rendering bug, but the mapper's fallback of 8 compounds it.

- **File:line:** `/dashboard/src/lib/bridge-mapper.ts:136`

---

### Scenario 6: Project in foundation state

**Data flow:** `state.json.current_state = "foundation"` (legacy) or `"story-building"` with `current_milestone = "Foundation"` (V3).

#### Current focus card

- **Expected:** Shows "Building foundation" with phase gloss.
- **Actual:**
  - Legacy `foundation` state: `current-focus-card.tsx:116` -- `hasStoryContext = Boolean(currentStoryName && (state === 'story-building' || state === 'foundation'))`. If a `currentStoryName` is set, the story name shows. Otherwise falls back to `currentMilestoneName` or phase gloss. `phaseLabel('foundation')` = "Building foundation". Correct.
  - V3 `story-building` state with Foundation milestone: Same path, but `phaseLabel('story-building')` = "Building this story". The hero shows the story name if available. Correct for V3.

#### Provisioning checklist

- **Expected:** Renders when the selected milestone is "Foundation" and `foundation.provisioning_steps` has entries.
- **Actual:** `page.tsx:384-389` -- Checks `selMs?.name === 'Foundation'` (using the milestone title, which the mapper sets from `m.name` at `bridge-mapper.ts:197`). Then checks `project.foundation?.provisioning_steps`. Note: the mapper passes through `state.foundation` as-is at line 354.

**[BUG-6] (MEDIUM)** The milestone title match uses string equality `=== 'Foundation'`. The mapper copies `m.name` verbatim from state.json. If the launcher writes the milestone name as `"Foundation & First-Run Setup"` or any variation, the match fails silently and the provisioning checklist never renders for the Foundation milestone.

- **File:line:** `/dashboard/src/app/projects/[name]/page.tsx:385`

#### Milestone timeline shows Foundation milestone?

- **Expected:** Yes, with 'in-progress' status.
- **Actual:** Correct. The mapper at `bridge-mapper.ts:286-288` checks if `m.name === state.current_milestone && isBuilding` to promote pending to in-progress. The timeline renders it with a spinning Loader2 icon.

---

### Scenario 7: Project in story-building state

#### Current story visible?

- **Expected:** Current story name shown in the hero card.
- **Actual:** Correct. The page fetches `storyContext` from the bridge and passes `storyContext?.story?.name` to `CurrentFocusCard` as `currentStoryName`. The card renders it at line 142-149.

#### Milestone timeline interactive?

- **Expected:** In-progress and promoted milestones are clickable. Pending milestones are not.
- **Actual:** Correct. `milestone-timeline.tsx:113` -- `isClickable = milestone.status !== 'pending'`.

#### Story list shows status?

- **Expected:** Current story shows 'in-progress', completed stories show 'done'.
- **Actual:** Correct. The mapper at `bridge-mapper.ts:279-284` overrides the active story's status to 'in-progress' if it was 'pending'. StoryList renders with status badges.

---

### Scenario 8: Project in escalation

#### Escalation card visible?

- **Expected:** Pending escalation cards render above the tabs.
- **Actual:** Correct. `page.tsx:319-321` filters to pending escalations. Lines 503-518 render `EscalationResponse` for each pending one.

#### Response form works?

- **Expected:** User can type guidance, click Send/Resume/Dismiss/Manual Fix/Abort/Hand Off.
- **Actual:** Correct. `escalation-response.tsx` POSTs to `/api/projects/[name]/resolve-escalation`.

#### After response: does UI update?

- **Expected:** Card disappears, "processing your guidance" banner shows for 6s.
- **Actual:** Correct. `handleEscalationResolved` calls `refetch()` which updates `project`. `pendingEscalations` re-filters, now empty. Lines 521-536 render the justResolvedAt banner.

**[BUG-7] (HIGH)** The ActionBar at `page.tsx:564` receives `escalation={project.escalations[0]}`. This is NOT filtered by pending status. If `escalations[0]` is resolved and `escalations[1]` is pending, the ActionBar passes the wrong escalation to the `EscalationDrawer`. Worse, if all escalations are resolved but `project.state` hasn't transitioned away from 'escalation' yet (race with refetch), the ActionBar still shows the "Respond to Escalation" button pointing at a resolved escalation.

- **File:line:** `/dashboard/src/app/projects/[name]/page.tsx:564`
- **Fix direction:** Should be `escalation={pendingEscalations[0]}` instead of `project.escalations[0]`.

**[BUG-8] (LOW)** The ActionBar's "Respond to Escalation" button (action-bar.tsx:160-170) opens the legacy `EscalationDrawer`. But the main page now renders inline `EscalationResponse` cards above the tabs (page.tsx:503-518). The button opens a drawer that duplicates (and may conflict with) the inline cards. The button and drawer are vestigial -- the inline cards are the canonical resolution surface.

- **File:line:** `/dashboard/src/components/action-bar.tsx:160-170`

---

### Scenario 9: Seeding state.json vs seeding-state.json inconsistency

#### What if state.json says ready but seeding-state.json says seeding_complete: null?

- **Expected:** The project should either be in seeding (with remaining work) or ready (with seeding complete).
- **Actual:** The dashboard reads `state.json.current_state` as the canonical state. If it says `"ready"`, the project renders as ready regardless of `seeding-state.json`. The `mergeSeedingProgress` in `project-details.ts` enriches seedingProgress from seeding-state.json, but it only adds data -- it doesn't change the project state. So the project shows as "Ready to build" with possibly incomplete seeding progress data.

**[BUG-9] (MEDIUM)** If `state.json.current_state = "ready"` but seeding-state.json shows incomplete disciplines, the SpecTabContent at `spec-tab-content.tsx:49-53` calculates `stage` as follows: `seedingProgress` is set (from the merge), `hasAnySpecContent` depends on whether vision.json/milestones exist. If spec artifacts don't exist yet, `stage = 'creating'`, which renders the full seeding chat UI (stepper + chat panel) even though the project claims to be "ready". The user sees a "Ready to build" badge but the spec tab shows the seeding chat interface as if seeding is still in progress.

- **File:line:** `/dashboard/src/components/spec-tab-content.tsx:49-53`
- **Note:** The state-repair module (`state-repair.ts`) handles the reverse case (seeding with all disciplines complete). It does NOT handle ready with incomplete seeding.

#### What if applicable_disciplines is null in seeding-state but state.json.seedingProgress has disciplines?

- **Expected:** Disciplines render from wherever the data exists.
- **Actual:** The `mergeSeedingProgress` in `project-details.ts:64-78` enriches existing seedingProgress with tier data when `!existing.applicableDisciplines && applicable`. So if `state.json.seedingProgress` exists but lacks `applicableDisciplines`, the merge adds it from `sizing.json`. If `sizing.json` also doesn't exist, `applicableDisciplines` stays undefined, and the stepper shows only brainstorming (the pre-classification fallback). This is correct defensive behavior.

#### What if disciplines in stepper don't match disciplines in chat panel?

- **Actual:** See BUG-3 above. The ordering differs because the stepper uses its own `DISCIPLINE_ORDER` constant while the chat panel uses `applicableDisciplines` (which comes from `DISCIPLINE_TIERS` insertion order in tier-registry.ts).

---

### Scenario 10: Empty/missing data

#### What if milestones array is empty?

- **Expected:** Build tab shows no milestones, but doesn't crash.
- **Actual:** Correct. `page.tsx:373` -- `project.milestones.length > 0` gate prevents rendering the milestone card. The build tab shows only the CurrentFocusCard, cost bar, and diagnostics. No crash.

However, `mergeMilestonesFromLedger` in `project-details.ts:29-53` fills from `task_ledger.json` if available. So an empty milestones array in state.json is usually enriched before reaching the client.

**[BUG-10] (LOW)** When milestones are empty AND task_ledger.json doesn't exist (or also has empty milestones), the Build tab renders only the CurrentFocusCard and cost bar. There's no empty-state message like "No milestones yet" to explain why the area is blank. The user sees a mostly empty Build tab with no explanation.

- **File:line:** `/dashboard/src/app/projects/[name]/page.tsx:373-401` -- no fallback empty state.

#### What if seedingProgress is undefined?

- **Expected:** Seeding-related UI doesn't render; spec tab shows legacy SpecView or appropriate fallback.
- **Actual:** Correct. The mapper returns `seedingProgress: undefined` when raw data is missing (`bridge-mapper.ts:111-112`). `spec-tab-content.tsx:49` classifies this as `stage = 'legacy'` and renders plain SpecView. ProjectCard at `project-card.tsx:174` doesn't render the discipline progress bar. No crash.

#### What if foundation is null?

- **Expected:** No provisioning checklist renders; no crash.
- **Actual:** Correct. `page.tsx:386` checks `project.foundation?.provisioning_steps` which is falsy when foundation is null/undefined. State-repair at `state-repair.ts:76-91` also fixes the `foundation: null` with `current_state: 'foundation'` case by writing `{ status: 'pending' }`.

---

## Additional Bugs Found

**[BUG-11] (MEDIUM)** The home page's `mapBridgeProjects` function at `page.tsx:37` casts `state` with `(p.state as ProjectState) ?? 'ready'`. If the scanner returns an invalid or missing state, this silently casts to `'ready'`, placing the project in the Specs section. No `narrowEnum` validation like the detail mapper uses. A project in an unknown state looks like it's "ready to build" on the home page.

- **File:line:** `/dashboard/src/app/page.tsx:37`

**[BUG-12] (MEDIUM)** The `computeProgress` function in `bridge-mapper.ts:238-248` calculates progress as story completion percentage. For a project in seeding (no milestones, no stories), progress is 0. The home page's `mapBridgeProjects` at `page.tsx:35` uses `Number(p.progress ?? 0)`. But the project card's `ProgressRing` renders `0%` progress for all seeding projects, which is technically correct but visually misleading -- seeding projects have their own notion of progress (discipline completion) that isn't reflected in the ring. The card shows `0%` even when 6/7 disciplines are done.

- **File:line:** `/dashboard/src/components/project-card.tsx:152` -- ProgressRing always renders, even for seeding projects where 0% is misleading.
- **Note:** The card does render a separate discipline segmented bar (lines 174-188) but only if `seedingProgress` is present -- see BUG-1 for why it's missing on bridge-sourced cards.

**[BUG-13] (LOW)** The `MilestoneTimeline` component at `milestone-timeline.tsx:113` sets `isClickable = milestone.status !== 'pending'`. But the `under-review` and `fixing` statuses are only overlaid by the bridge-mapper for the *current* milestone. A milestone that was previously reviewed and had fixes applied might have its status set back to `in-progress` or `promoted` by the launcher -- but if the launcher wrote it as `pending` (race condition during phase transition), the timeline shows it as unclickable even though it has stories. This is an edge case but could briefly confuse users during phase transitions.

- **File:line:** `/dashboard/src/components/milestone-timeline.tsx:113`

---

## Bug Summary Table

| ID | Severity | Scenario | Component | Description |
|--------|----------|----------|-----------|-------------|
| BUG-1 | HIGH | 1 | page.tsx (home) | Bridge mapper for home page never maps `seedingProgress` -- discipline bars missing on all bridge-sourced seeding cards |
| BUG-2 | LOW | 1 | spec-depth-pill.tsx | SpecDepthPill always shows "brainstorm" for seeding projects, ignoring actual discipline progress |
| BUG-3 | MEDIUM | 2 | discipline-stepper.tsx + chat-panel.tsx | Discipline ordering disagrees between stepper (DISCIPLINE_ORDER) and chat panel (applicableDisciplines from tier-registry insertion order) |
| BUG-4 | LOW | 4 | Same as BUG-3 | Same ordering mismatch manifests for S-tier projects |
| BUG-5 | MEDIUM-HIGH | 5 | bridge-mapper.ts | `totalCount` defaults to 8 when missing -- wrong for XS (4) and S (7) projects |
| BUG-6 | MEDIUM | 6 | page.tsx (project) | Foundation milestone name match is exact string `=== 'Foundation'` -- any variation breaks provisioning checklist |
| BUG-7 | HIGH | 8 | page.tsx (project) | ActionBar receives `escalations[0]` not filtered by pending status -- wrong escalation passed to drawer |
| BUG-8 | LOW | 8 | action-bar.tsx | Vestigial "Respond to Escalation" button + EscalationDrawer duplicates the inline EscalationResponse cards |
| BUG-9 | MEDIUM | 9 | spec-tab-content.tsx | Ready state + incomplete seedingProgress = spec tab renders seeding chat UI instead of SpecView |
| BUG-10 | LOW | 10 | page.tsx (project) | No empty-state message when milestones array is empty on the Build tab |
| BUG-11 | MEDIUM | N/A | page.tsx (home) | Home page casts unknown project states to 'ready' without validation, unlike the detail page mapper |
| BUG-12 | MEDIUM | 1 | project-card.tsx | Progress ring shows 0% for seeding projects (story-based progress) -- misleading when disciplines are partially complete |
| BUG-13 | LOW | 7 | milestone-timeline.tsx | Pending milestones with stories (race condition) are unclickable even when they have content |

---

## Files Examined

- `/dashboard/src/app/page.tsx` -- Home page
- `/dashboard/src/app/projects/[name]/page.tsx` -- Project detail page
- `/dashboard/src/app/api/projects/[name]/route.ts` -- Project detail API
- `/dashboard/src/lib/bridge-mapper.ts` -- State-to-ProjectDetail mapper
- `/dashboard/src/lib/project-details.ts` -- Server-side data enrichment
- `/dashboard/src/lib/types.ts` -- TypeScript type definitions
- `/dashboard/src/lib/validate-enum.ts` -- Enum narrowing utilities
- `/dashboard/src/lib/phase-labels.ts` -- Phase display labels
- `/dashboard/src/components/discipline-stepper.tsx` -- Seeding discipline stepper
- `/dashboard/src/components/milestone-timeline.tsx` -- Milestone timeline
- `/dashboard/src/components/story-list.tsx` -- Story list within milestones
- `/dashboard/src/components/current-focus-card.tsx` -- Hero card
- `/dashboard/src/components/action-bar.tsx` -- Bottom action bar
- `/dashboard/src/components/state-badge.tsx` -- State badge component
- `/dashboard/src/components/specs-table.tsx` -- Specs table on home page
- `/dashboard/src/components/provisioning-checklist.tsx` -- Infrastructure checklist
- `/dashboard/src/components/chat-panel.tsx` -- Seeding chat panel
- `/dashboard/src/components/spec-tab-content.tsx` -- Spec tab orchestrator
- `/dashboard/src/components/project-card.tsx` -- Project card on home page
- `/dashboard/src/components/project-header.tsx` -- Project header
- `/dashboard/src/components/project-tabs.tsx` -- Tab container
- `/dashboard/src/components/spec-depth-pill.tsx` -- Spec depth indicator
- `/dashboard/src/components/escalation-response.tsx` -- Escalation response panel
- `/dashboard/src/bridge/tier-registry.ts` -- Tier-discipline mappings
- `/dashboard/src/bridge/types.ts` -- Bridge type definitions
- `/dashboard/src/bridge/seeding-state.ts` -- Seeding state reader/writer
- `/dashboard/src/bridge/state-repair.ts` -- Auto-repair for corrupt states
