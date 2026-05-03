# Deterministic vs Prompt-Based Validation Architecture

**Problem:** Rouge has been patching prompts to enforce validation, but prompts can't guarantee enforcement. We need a clear separation between generative (AI) and enforcement (code) layers.

---

## The Principle

| Layer | Responsibility | Examples |
|-------|---------------|----------|
| **Prompts (generative)** | Decide WHEN something is ready, emit markers | Orchestrator emits SEEDING_COMPLETE when it thinks all disciplines ran |
| **Bridge/Launcher (deterministic)** | Validate markers, enforce rules, reject invalid | Bridge checks disciplines_complete matches tier requirements |

**Anti-pattern:** Asking AI to validate its own output via prompt instructions.

**Correct pattern:** AI emits marker → code validates → code rejects if wrong → AI sees rejection → AI fixes.

---

## Seeding Completion — Proper Implementation

### Current Broken Flow

```
Orchestrator (prompt)
  ↓ thinks all disciplines ran
  ↓ emits SEEDING_COMPLETE
Bridge (seed-handler.ts)
  ↓ parses marker
  ↓ calls finalizeSeeding() (checks artifacts only)
  ↓ ACCEPTS even with 1/7 disciplines complete
  ↓ promotes to ready
Foundation starts with empty task_ledger
```

### Fixed Flow

```
Orchestrator (prompt)
  ↓ thinks all disciplines ran (may be wrong)
  ↓ emits SEEDING_COMPLETE
Bridge (seed-handler.ts)
  ↓ parses marker
  ↓ validateTierCompletion() ← DETERMINISTIC CHECK
  │   • read sizing.json → tier
  │   • read seeding-state.json → disciplines_complete
  │   • check disciplines_complete contains all applicable for tier
  │   • if not: return {ok: false, missing: [...]}
  ↓
  │ [validation failed]
  ├─→ REJECT marker
  │   append system note to chat
  │   append pending correction (Claude sees it next turn)
  │   DON'T call markSeedingComplete
  │   orchestrator loops back to missing disciplines
  │
  │ [validation passed]
  └─→ call finalizeSeeding() (artifact check)
      call markSeedingComplete()
      promote to ready
```

### Implementation

**File:** `dashboard/src/bridge/seed-handler.ts`

**Add helper function** (after imports, before handlers):

```typescript
/**
 * Validate that all applicable disciplines for the project tier have
 * completed before allowing SEEDING_COMPLETE.
 *
 * P0-SEEDING-001 FIX: Deterministic enforcement layer. The orchestrator
 * prompt can hallucinate discipline completion (claims 7/7 when only 1/7
 * ran). This function provides mechanical validation that can't be
 * hallucinated away.
 *
 * Returns ok: true if all required disciplines completed, or ok: false
 * with details of what's missing.
 */
function validateTierCompletion(projectDir: string): 
  | { ok: true } 
  | { ok: false; reason: string; tier: string; required: string[]; completed: string[]; missing: string[] } 
{
  const sizingPath = join(projectDir, 'seed_spec/sizing.json')
  if (!existsSync(sizingPath)) {
    // No sizing.json yet — can't validate tier. Allow SEEDING_COMPLETE.
    // Edge case: pre-tier-gating projects, or if sizing is somehow missing.
    // The artifact check in finalizeSeeding will catch missing sizing.json.
    return { ok: true }
  }

  let sizing: any
  try {
    sizing = JSON.parse(readFileSync(sizingPath, 'utf-8'))
  } catch {
    return { ok: true } // malformed, artifact check will catch it
  }

  const projectSize = sizing.project_size
  if (!projectSize || !['XS', 'S', 'M', 'L', 'XL'].includes(projectSize)) {
    return { ok: true } // invalid size, artifact check handles it
  }

  const seedingStatePath = join(projectDir, 'seeding-state.json')
  if (!existsSync(seedingStatePath)) {
    // No state file — bizarre but let it through, other checks will fail
    return { ok: true }
  }

  let seedingState: any
  try {
    seedingState = JSON.parse(readFileSync(seedingStatePath, 'utf-8'))
  } catch {
    return { ok: true }
  }

  const completed = seedingState.disciplines_complete || []

  // Inline tier mapping (must match discipline-registry.js in launcher)
  const DISCIPLINE_TIERS: Record<string, string> = {
    brainstorming: 'XS',
    competition: 'M',
    taste: 'XS',
    sizing: 'XS',
    spec: 'XS',
    infrastructure: 'S',
    design: 'S',
    'legal-privacy': 'S',
    marketing: 'M',
  }
  const TIER_ORDER = ['XS', 'S', 'M', 'L', 'XL']
  const sizeIndex = TIER_ORDER.indexOf(projectSize)

  const applicable = Object.entries(DISCIPLINE_TIERS)
    .filter(([_, tier]) => TIER_ORDER.indexOf(tier) <= sizeIndex)
    .map(([discipline]) => discipline)

  const completedSet = new Set(completed)
  const missing = applicable.filter(d => !completedSet.has(d))

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Only ${completed.length}/${applicable.length} required disciplines completed for ${projectSize}-tier project`,
      tier: projectSize,
      required: applicable,
      completed,
      missing,
    }
  }

  return { ok: true }
}
```

**Update SEEDING_COMPLETE handler** (lines 746-754):

```typescript
// Check for SEEDING_COMPLETE
let readyTransition = false
let missingArtifacts: string[] | undefined
if (markers.seedingComplete) {
  // P0-SEEDING-001 FIX: Validate tier completion BEFORE artifact check.
  // The orchestrator can hallucinate that disciplines completed when they
  // haven't. This deterministic check enforces the state machine rule.
  const disciplineCheck = validateTierCompletion(projectDir)
  if (!disciplineCheck.ok) {
    // REJECT the marker. Append two notes: one for the user (human-facing
    // chat), one for Claude (pending correction on next turn).
    appendChatMessage(projectDir, {
      id: genId(),
      role: 'rouge',
      content: 
        `SEEDING_COMPLETE rejected — ${disciplineCheck.reason}.\n\n` +
        `Required disciplines: ${disciplineCheck.required.join(', ')}\n` +
        `Currently complete: ${disciplineCheck.completed.join(', ')}\n` +
        `Missing: ${disciplineCheck.missing.join(', ')}\n\n` +
        `The orchestrator must run these disciplines before seeding can finalize. Continuing to next discipline...`,
      timestamp: new Date().toISOString(),
      kind: 'system_note',
    })
    appendPendingCorrection(projectDir,
      `[SYSTEM NOTE] SEEDING_COMPLETE was rejected because not all required disciplines for a ${disciplineCheck.tier}-tier project have completed. ` +
      `Required: ${disciplineCheck.required.join(', ')}. ` +
      `Currently complete: ${disciplineCheck.completed.join(', ')}. ` +
      `Missing: ${disciplineCheck.missing.join(', ')}. ` +
      `You must run the missing disciplines and emit their completion markers before emitting SEEDING_COMPLETE again. ` +
      `Continue the seeding process by entering the first missing discipline.`
    )
    // DON'T call finalizeSeeding or markSeedingComplete
  } else {
    // Discipline check passed — now validate artifacts
    const finalizeResult = await finalizeSeeding(projectDir)
    if (finalizeResult.ok) {
      markSeedingComplete(projectDir)
      readyTransition = true
    } else {
      missingArtifacts = finalizeResult.missingArtifacts
    }
  }
}
```

---

## Other Validation That Should Be Deterministic

### Budget Cap (ALREADY CORRECT)
- **Prompt:** Phases generate content
- **Launcher:** Deterministic budget check before each phase (rouge-loop.js:2098-2148)
- **Correct:** Code enforces cap, prompts can't bypass

### Story Dependencies (ALREADY CORRECT)
- **Prompt:** story-building generates code
- **Launcher:** Deterministic check that depends_on stories are done (rouge-loop.js:1309)
- **Correct:** Dependency check is code, not prompt instruction

### Milestone Lock (ALREADY CORRECT)
- **Prompt:** analyzing recommends promote
- **Launcher:** Deterministic check against checkpoint ledger (rouge-loop.js:1496)
- **Correct:** Lock is enforced in code

### Spin Detection (ALREADY CORRECT)
- **Prompt:** story-building attempts fixes
- **Launcher:** Deterministic fingerprint comparison (rouge-loop.js:1196-1218)
- **Correct:** Spin is detected mechanically, not via prompt self-assessment

---

## Rollout

1. Implement validateTierCompletion() in seed-handler.ts
2. Update SEEDING_COMPLETE handler to call it
3. Remove the prompt-layer validation from 00-swarm-orchestrator.md (revert my earlier change)
4. Test with fresh XS project
5. Verify rejection note appears when only 1/4 disciplines complete
6. Verify orchestrator loops back to missing disciplines

**Estimated time:** 1 hour
