# Audit: Seeding Prompt-to-Disk Contracts

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-05-03
**Scope:** Do seeding prompts produce the artifacts the bridge expects? Does the bridge validate them? What breaks when artifacts are malformed, missing, or wrong?
**Evidence project:** `~/.rouge/projects/highlow` (S-tier, in-progress seeding)

---

## Executive Summary

**Total contract violations found: 14**

**Worst 3:**

1. **vision.json schema mismatch (V-01)** — The orchestrator prompt tells Claude to write `vision.json` with flat string fields (`persona`, `product_name`, `one_liner`, `killer_edge`). The JSON schema (`schemas/vision.json`) requires `persona` to be an object `{ who, context }` and requires `feature_areas[]` with nested `user_journeys`. Highlow's actual vision.json uses the prompt's flat-string shape and would fail schema validation. Nobody validates vision.json against the schema. The finalize step only checks byte count (>= 200 bytes).

2. **product_standard.json is required by finalize but no prompt writes it (V-02)** — `seeding-finalize.ts` line 358 checks `fileLooksReal(join(projectDir, 'product_standard.json'))` and adds it to `missingArtifacts` if absent. The orchestrator prompt mentions it at line 297 ("inherited global + domain + project overrides") but no discipline prompt defines its schema or instructs Claude to write it. Highlow has no `product_standard.json`. This means every seeding session will fail finalization unless the orchestrator hallucinates the file into existence, and the S2 correction note won't explain what the file should contain.

3. **task_ledger.json vs milestones.json schema drift (V-03)** — `milestones.json` has fields like `po_checks`, `user_journeys`, `feature_area`, `notes` that the task-ledger-v3 schema does not define. The orchestrator prompt writes both files from the same data, but the task_ledger also carries extra top-level fields (`project`, `seeded_at`, `seeded_by`, `human_approved`) plus per-story fields (`description`, `env_limitations`, `fix_story`) absent from milestones.json. Foundation story generation reads task_ledger and injects stories with a different shape (no `po_checks`, no `user_journeys`, no `description`, no `env_limitations`, no `fix_story`). The build loop reads task_ledger.json — it will encounter a mix of story shapes within the same milestone array.

**Artifacts most likely to cause build failures:**
- `product_standard.json` (missing entirely, blocks finalization)
- `infrastructure_manifest.json` (missing for tier-skipped projects, but foundation story generator and propagateInfrastructureFromManifest silently return empty objects — failure is silent, not crash)
- `vision.json` (schema mismatch means any code that validates against the schema will reject it)

---

## Per-Discipline Audit

### 1. BRAINSTORMING

#### What the prompt says to write
- **Path:** `seed_spec/brainstorming.md` (line 144, explicit)
- **Format:** Structured markdown with sections: The Problem, The User, Emotional North Star, 10-Star Experience, Feature Areas, Temporal Arc, Open Questions, Scope Summary, Classifier Signals
- **Example:** Full markdown template provided in prompt (lines 150-226)

#### What discipline-artifacts.ts checks
- `seed_spec/brainstorming.md` >= 500 bytes (primary)
- `seed_spec/brainstorming-design-doc.md` >= 500 bytes (alternative)
- `docs/brainstorming.md` >= 500 bytes (alternative)
- Any ONE match wins

#### What the real artifact looks like (highlow)
- `seed_spec/brainstorming.md` exists, well-formed markdown, matches prompt structure
- Contains Classifier Signals section as required by SIZING

#### Failure modes
- **Missing entirely:** Bridge rejects `[DISCIPLINE_COMPLETE: brainstorming]`. Agent gets correction note. Seeding stalls at brainstorming.
- **Empty/small:** < 500 bytes rejected. Same as missing.
- **Missing Classifier Signals:** Auto-classifier fails, stashes correction to add the signals block. SIZING never completes. Seeding stalls.
- **No structural validation:** Bridge does not parse the markdown for required sections. A 500-byte file of Lorem Ipsum would pass.

#### Violations
- **V-04 (LOW):** No structural validation of markdown content. The Classifier Signals section is critical for SIZING but the bridge only checks byte count, not section presence. The auto-classifier catches this downstream, but the error path is indirect.

---

### 2. COMPETITION

#### What the prompt says to write
- **Path:** `seed_spec/competition.md` (line 39, explicit)
- **Format:** Structured markdown with Market Landscape, Competitors table, Design Patterns, Gap Analysis, Differentiation Angle, Advisory Verdict, Reference Products, Screenshots
- Also mentions writing `reference_products` JSON block, but doesn't specify a separate file path

#### What discipline-artifacts.ts checks
- `seed_spec/competition.md` >= 500 bytes (primary)
- `seed_spec/competition_brief.md` >= 500 bytes (alternative)
- `docs/competition.md` >= 500 bytes (alternative)
- `docs/competition_brief.md` >= 500 bytes (alternative)

#### What the real artifact looks like (highlow)
- Competition was auto-skipped (S-tier project, competition is M-tier). No artifact exists.

#### Failure modes
- **Skipped by tier gate:** Handled correctly. Bridge marks as complete via auto-skip.
- **Missing at M+ tier:** Bridge rejects completion marker. Agent retries.
- **reference_products JSON never consumed:** The prompt says to write a JSON block for `cycle_context.json` merging, but no bridge code reads `seed_spec/competition.md` to extract and merge the JSON. The reference products are stranded in markdown.

#### Violations
- **V-05 (MEDIUM):** The `reference_products` structured data block described in the prompt (lines 306-316) is never extracted from the markdown by any bridge or launcher code. It exists only as a fenced code block inside a markdown file. If the evaluator or any downstream consumer needs reference products for pairwise comparison, they have no structured source.

---

### 3. TASTE

#### What the prompt says to write
- **Path:** `seed_spec/taste.md` (line 283, explicit)
- **Format:** Markdown wrapping a fenced JSON code block with fields: discipline, verdict, mode, confidence, sharpened_brief, graveyard_entry, loop_back_triggers, human_questions_asked, re_invocation_count, notes

#### What discipline-artifacts.ts checks
- `seed_spec/taste.md` >= 300 bytes (primary)
- `seed_spec/taste_verdict.md` >= 300 bytes (alternative)
- `docs/taste.md` >= 300 bytes (alternative)
- `docs/taste_verdict.md` >= 300 bytes (alternative)

#### What the real artifact looks like (highlow)
- `seed_spec/taste.md` exists, contains both narrative markdown and fenced JSON block
- JSON block matches the prompt's specified structure
- Uses `verdict: "pass"` (lowercase) — prompt shows `"pass" | "kill"` (lowercase), consistent

#### Failure modes
- **Missing entirely:** Rejected, seeding stalls at taste.
- **JSON block malformed:** No code parses the JSON from taste.md. It's only consumed by the orchestrator prompt reading it as context. A malformed JSON block would confuse the LLM but not crash any code.
- **Verdict is KILL but no graveyard entry:** The orchestrator prompt says to write to `docs/drafts/ideas-graveyard.md`, but no bridge code checks for this or handles the kill path structurally. The kill verdict is entirely LLM-mediated.

#### Violations
- **V-06 (LOW):** The fenced JSON block in taste.md is never parsed by bridge code. The bridge relies solely on byte count. If taste produces a KILL verdict, the seeding exit path is entirely dependent on the LLM following the orchestrator prompt's instructions. No programmatic enforcement of the kill-means-exit invariant.

---

### 4. SIZING

#### What the prompt says to write
- **Path:** `seed_spec/sizing.json` (written by `rouge size-project` CLI, not by the LLM)
- **Schema:** `schemas/sizing-v1.json` — requires `schema_version`, `project_size`, `signals`, `reasoning`, `classifier_version`, `decided_at`
- **Required fields in signals:** `entity_count`, `integration_count`, `role_count`, `journey_count`, `screen_count` (all integers)

#### What discipline-artifacts.ts checks
- `seed_spec/sizing.json` >= 50 bytes

#### What the real artifact looks like (highlow)
- Valid JSON with all required fields present
- Uses `classified_at` instead of `decided_at` (schema says `decided_at`, artifact says `classified_at`)
- Has `signal_source` and `human_override` fields not in the required set but present

#### Failure modes
- **Missing entirely:** Auto-classifier failed or brainstorming lacks signals. Correction note stashed.
- **Malformed JSON:** `readProjectSize()` in tier-registry.ts catches parse errors, returns null. `validateTierCompletion` then returns `{ ok: true }` (can't validate without tier), letting finalization proceed without tier validation.
- **Missing project_size field:** Same as malformed — returns null, skips tier validation.
- **Wrong tier value (e.g., "medium" instead of "M"):** `TIER_ORDER.includes(size)` returns false, null returned, tier validation skipped.

#### Violations
- **V-07 (MEDIUM):** The actual artifact uses field name `classified_at` but the schema requires `decided_at`. The auto-classifier writes `classified_at`. Schema validation would reject this, but nobody validates against the schema. Also `decided_by` in the artifact is `"auto-classifier"` but the schema enum says `["classifier", "human-override"]` — `"auto-classifier"` is not a valid value.
- **V-08 (MEDIUM):** When `readProjectSize()` returns null (malformed sizing.json), `validateTierCompletion` returns `{ ok: true }`. This means a corrupted sizing.json silently bypasses ALL tier validation — a project with only brainstorming done could finalize if sizing.json is garbage.

---

### 5. SPEC

#### What the prompt says to write
- **Path:** `seed_spec/milestones.json` (line 147, explicit)
- **Schema (from prompt):** `{ "milestones": [{ "name": ..., "stories": [{ "id": ..., "name": ..., "status": "pending", "acceptance_criteria": [...], "depends_on": [...] }] }] }`
- Also uses OpenSpec CLI to write per-area spec files under `openspec/changes/`

#### What discipline-artifacts.ts checks
- `seed_spec/milestones.json` >= 500 bytes (primary)
- `seed_spec/spec.md` >= 500 bytes (alternative)
- `docs/spec.md` >= 500 bytes (alternative)

#### What the real artifact looks like (highlow)
- `seed_spec/milestones.json` exists with full structure
- Contains fields beyond what the prompt specifies: `feature_areas`, `po_checks`, `user_journeys`, `notes` per story
- Contains `depends_on_milestones` at milestone level (not in the prompt's inline schema)
- Acceptance criteria are full text (not just IDs) — matches the orchestrator's requirement

#### Failure modes
- **Missing entirely:** Rejected. Seeding stalls at spec.
- **Malformed JSON:** Bridge only checks byte count, not JSON validity. A 500-byte non-JSON file would pass artifact verification. `finalizeSeeding` checks for task_ledger.json existence (not milestones.json directly). Foundation story generation reads task_ledger.json, not milestones.json — so a malformed milestones.json doesn't crash finalization, but the build loop might read stale/wrong data.
- **Empty stories array:** Byte count check would still pass if milestones have names and metadata. Foundation stories get prepended regardless. Build loop would have a Foundation milestone with stories but feature milestones with no stories.
- **Missing acceptance_criteria:** Not caught. task-ledger-v3.json schema does not require `acceptance_criteria` — it's optional. A story with `acceptance_criteria: []` is schema-valid.

#### Violations
- **V-03 (HIGH, counted above):** milestones.json and task_ledger.json have divergent schemas. See executive summary.
- **V-09 (MEDIUM):** No JSON parse validation on milestones.json. A 500-byte text file named `milestones.json` passes the bridge check.

---

### 6. INFRASTRUCTURE

#### What the prompt says to write
- **Path:** `infrastructure_manifest.json` in project root (line 109, explicit)
- **Schema (from prompt):** `{ database: { type, provider, client, reason }, deploy: { target, staging_env, production_env }, auth: { strategy, provider }, data_sources: [], incompatibilities_resolved: [], depends_on_projects: [] }`

#### What discipline-artifacts.ts checks
- `infrastructure_manifest.json` >= 200 bytes
- **Strict — no alternative paths.** Comment in code: "Infrastructure stays strict because `infrastructure_manifest.json` is consumed by the launcher at build time — the path is load-bearing."

#### What the real artifact looks like (highlow)
- **Does not exist.** Infrastructure discipline has been prompted but not completed (seeding-state shows `current_discipline: "infrastructure"`, not in disciplines_complete).
- For S-tier: infrastructure is applicable, so it must complete.

#### Failure modes
- **Missing entirely (tier-skipped):** For XS projects, infrastructure is skipped. `propagateInfrastructureFromManifest` checks `existsSync(manifestPath)` and returns early — safe. `generateFoundationStories` reads the manifest with try/catch, gets `{}` — generates only scaffold + deploy stories. Foundation stories are correct for XS (no database, no auth when manifest is empty).
- **Missing at S+ (not skipped, just failed):** Bridge rejects `[DISCIPLINE_COMPLETE: infrastructure]`. Seeding stalls. The pending_correction in highlow's seeding-state shows exactly this scenario playing out.
- **Present but malformed JSON:** `propagateInfrastructureFromManifest` catches parse error, returns early. Foundation stories get empty manifest, generate minimal stories. Silent data loss — deploy target is never propagated to vision.json.
- **Present but missing deploy.target:** `propagateInfrastructureFromManifest` checks `if (!target || typeof target !== 'string') return` — skips propagation. Foundation deploy story shows "auto" instead of real target. Build loop's provisioner will hit "No deployment_target" warning.
- **Present but wrong field names:** If `database.provider` is missing but `database.type` exists, the foundation generator skips the database story even though a database is needed.

#### Violations
- **V-10 (MEDIUM):** No JSON structural validation. The bridge checks file existence and byte count only. A 200-byte JSON with `{ "foo": "bar" }` passes. Foundation story generation silently produces wrong stories. `propagateInfrastructureFromManifest` silently returns without propagating.

---

### 7. DESIGN

#### What the prompt says to write
- **Paths (explicit):**
  - `design/pass-1-ux-architecture.yaml`
  - `design/pass-2-component-design.yaml`
  - `design/pass-3-visual-design.yaml`
  - `design/design.yaml` (combined rollup)
- **Format:** YAML with structured quality scores per pass

#### What discipline-artifacts.ts checks
- **Primary:** All three pass files exist, each >= 300 bytes (hyphenated names)
- **Alternative 1:** All three pass files with underscores (pass_1_ux_architecture.yaml etc.)
- **Alternative 2:** `design/design.yaml` >= 2000 bytes (single rollup)
- **Fallback alternatives:** `seed_spec/design.md`, `seed_spec/design_artifact.md`, `seed_spec/design_artifact.yaml`, `docs/design.md` — all >= 2000 bytes

#### What the real artifact looks like (highlow)
- **Does not exist.** No `design/` directory. Design is applicable at S-tier but hasn't run yet.

#### Failure modes
- **Missing at S+ (not completed):** Bridge rejects completion marker. Seeding stalls.
- **Only Pass 1 written (observed in Praise session):** The `kind: 'files'` check requires ALL three pass files. Partial completion correctly rejected.
- **Wrong file names (underscores instead of hyphens):** Handled — second alternative in the spec covers this.
- **YAML parse errors:** No YAML parsing. Bridge only checks existence and byte count. A 300-byte text file named `pass-1-ux-architecture.yaml` would pass.
- **slop_detected: true in YAML:** Prompt says this is "a hard block on [DISCIPLINE_COMPLETE]." But the bridge has no enforcement — it doesn't parse YAML, so slop_detected is only enforced by the LLM following the prompt. A sloppy design passes the bridge.

#### Violations
- **V-11 (MEDIUM):** `slop_detected: true` is described as a hard block in the design prompt (line 93) but is never enforced by bridge code. Enforcement is entirely LLM-honor-system.
- **V-12 (LOW):** No YAML parse validation. Bridge cannot distinguish valid YAML from random text meeting the byte threshold.

---

### 8. LEGAL-PRIVACY

#### What the prompt says to write
- **Paths:** `legal/terms.md`, `legal/privacy.md`, optionally `legal/cookies.md`
- **Also outputs:** A JSON status object to the orchestrator (in chat, not on disk)

#### What discipline-artifacts.ts checks
- `legal/` directory with >= 1 file (primary)
- `seed_spec/legal.md` >= 300 bytes (alternative)
- `docs/legal.md` >= 300 bytes (alternative)

#### What the real artifact looks like (highlow)
- **Does not exist.** Legal-privacy hasn't run yet (S-tier, applicable but pending).

#### Failure modes
- **Missing at S+:** Bridge rejects completion. Seeding stalls.
- **Directory exists but files are empty:** `readdirSync().filter(f => !f.startsWith('.'))` counts non-hidden files. An empty `terms.md` (0 bytes) still counts as a file. The `minFiles: 1` check passes even with empty files.
- **JSON status object never on disk:** The status object (trademark_status, ip_risk, regulated_domain_flags, blocking_issues) exists only in the Claude chat response. No bridge code parses or persists it. Downstream consumers that need `blocking_issues` or `regulated_domain_flags` have no structured source.

#### Violations
- **V-13 (MEDIUM):** The `kind: 'dir'` check with `minFiles: 1` accepts empty files. Creating `legal/.gitkeep` (or even touching `legal/terms.md` without content) would pass the artifact check. The `fileLooksReal` 200-byte floor used elsewhere is NOT applied to directory entries.

---

### 9. MARKETING

#### What the prompt says to write
- **Paths:**
  - `marketing/landing-page-copy.md`
  - `marketing/landing-page.html`
  - `marketing/product-hunt-launch.md`
  - `README.md` (project root)

#### What discipline-artifacts.ts checks
- `marketing/` directory with >= 1 file (primary)
- `seed_spec/marketing.md` >= 300 bytes (alternative)
- `docs/marketing.md` >= 300 bytes (alternative)

#### What the real artifact looks like (highlow)
- **Does not exist.** Marketing auto-skipped (S-tier, marketing is M-tier).

#### Failure modes
- Same as legal-privacy: `kind: 'dir'` with `minFiles: 1` accepts empty files.
- **README.md not checked:** The prompt writes `README.md` to project root, but the artifact verifier only checks the `marketing/` directory. A session that wrote all marketing/ files but forgot README.md would pass. Conversely, writing only README.md would fail (it's not in `marketing/`).

#### Violations
- Same empty-file issue as legal-privacy (V-13 applies here too).

---

## Cross-Cutting Findings

### F-01: task_ledger.json vs milestones.json — Who is Source of Truth?

**milestones.json** (`seed_spec/milestones.json`):
- Written by SPEC discipline during seeding
- Contains: `po_checks`, `user_journeys`, `feature_area`, `notes` per story
- Contains: `feature_areas` at milestone level
- Verified by bridge artifact check (>= 500 bytes)
- NOT read by finalization or foundation story generation

**task_ledger.json** (project root):
- Written by orchestrator after human approval (step 5 of orchestrator prompt)
- Contains additional top-level fields: `project`, `seeded_at`, `seeded_by`, `human_approved`
- Contains additional per-story fields: `description`, `env_limitations`, `fix_story`
- Read by foundation story generation (indirectly — finalize reads it to inject Foundation milestone)
- Read by rouge-loop.js during build
- Checked by finalize: `existsSync(join(projectDir, 'task_ledger.json'))` — existence only, no structural validation

**The schemas diverge.** The task-ledger-v3 schema requires only `id`, `name`, `status` per story. The actual task_ledger.json has many more fields. milestones.json has yet different extra fields. When foundation stories are injected (by `finalizeSeeding`), they follow the `FoundationStory` interface: `id, name, status, foundation, acceptance_criteria, depends_on`. They lack: `description`, `env_limitations`, `fix_story`, `po_checks`, `user_journeys`, `feature_area`, `notes`, `affected_entities`, `affected_screens`.

**Impact:** The build loop encounters two story shapes in the same milestones array — feature stories with the full set of fields, and foundation stories with a minimal set. Any code that reads `story.po_checks` or `story.description` from a foundation story will get `undefined`.

### F-02: vision.json — Multiple Writers, No Merge Strategy

**Who writes to vision.json:**
1. **Orchestrator prompt** (step 5): Writes the full file after human approval
2. **SPEC prompt** (line 573): Writes `complexity_profile` and `infrastructure.services`
3. **`propagateInfrastructureFromManifest`** in seeding-finalize.ts: Writes `infrastructure.deployment_target`, `infrastructure.needs_database`, `infrastructure.needs_auth` (only fills missing fields)

**Merge strategy:** Last-write-wins for the orchestrator's initial write. `propagateInfrastructureFromManifest` does field-level merge (only fills missing fields). SPEC's write is last-write-wins for the fields it touches.

**Schema mismatch (V-01):**
- Schema requires `persona` as `{ who: string, context: string }` — an object
- Orchestrator and actual artifact use `persona` as a flat string
- Schema requires `feature_areas[]` with nested `user_journeys[]` — complex structure
- Actual artifact has `scope: { in: [], out: [], deferred: [] }` instead
- Schema does not define `product_name`, `one_liner` (top level), `killer_edge`, `emotional_north_star` as standalone strings, but the actual artifact has them
- Schema requires `name` at top level; actual artifact uses `product_name`

**Impact:** Any code that validates vision.json against `schemas/vision.json` will reject every real artifact. This likely means nothing validates against it — the schema is aspirational/outdated.

### F-03: product_standard.json — Ghost Artifact

**Who writes it:** Nobody explicitly. The orchestrator prompt mentions it at line 297 ("inherited global + domain + project overrides") but no discipline prompt has instructions for generating it. No schema exists in `schemas/` for it.

**Who reads it:** `seeding-finalize.ts` line 358 checks `fileLooksReal(join(projectDir, 'product_standard.json'))`. If absent, it's added to `missingArtifacts` and finalization fails.

**Highlow has no product_standard.json.** Neither do most projects, likely.

**Impact:** EVERY seeding session must rely on the orchestrator LLM spontaneously generating this file (based on the one mention in step 5 of the orchestrator prompt). If it doesn't, finalization fails with a cryptic `missingArtifacts: ['product_standard.json']` error. The LLM correction path doesn't explain what the file should contain because no prompt defines its schema.

### F-04: infrastructure_manifest.json — Silent Degradation for Skipped Projects

For XS projects, infrastructure is skipped. The manifest never gets written. Downstream consumers handle this silently:
- `propagateInfrastructureFromManifest`: returns early
- `generateFoundationStories`: uses `{}` as manifest, generates only scaffold + deploy
- Foundation deploy story shows target "auto" (from `manifest.deploy?.target || 'auto'`)

This is mostly correct behavior, but the "auto" deploy target string is never interpreted anywhere — it's a display label that doesn't match any valid deployment target enum value. If any code downstream tries to match the deploy target against valid values, it won't find "auto".

### F-05: Design Artifacts and the Build Loop

The build loop's evaluator is expected to read design artifacts for PO checks and quality evaluation. The design prompt writes YAML files with structured scores, component mappings, style tokens, and PO-checkable outputs. But:

1. **No YAML parser in the bridge.** The bridge only checks byte count.
2. **No consumer of design YAML is visible in the codebase.** The evaluator prompts presumably read these files as context, but there's no programmatic parsing of design scores or PO checks from the YAML.
3. **If design YAML is malformed,** the only consequence is that the evaluator LLM receives garbled context. No crash, no structured error.

---

## What Happens When Artifacts Are...

### Missing Entirely (discipline crashed mid-write)

| Artifact | Behavior |
|----------|----------|
| Any discipline artifact | Bridge rejects `[DISCIPLINE_COMPLETE]` marker. Correction note stashed. Agent retries on next turn. Seeding stalls at that discipline until artifact appears. |
| task_ledger.json | Finalization adds to missingArtifacts list. SEEDING_COMPLETE rejected. |
| vision.json | Finalization adds to missingArtifacts (byte check fails). SEEDING_COMPLETE rejected. |
| product_standard.json | Finalization adds to missingArtifacts. SEEDING_COMPLETE rejected. **No prompt tells Claude how to fix this.** |
| infrastructure_manifest.json | At S+: discipline completion blocked. At XS: skipped, downstream uses empty defaults. |

### Present But Empty (0 bytes)

| Artifact | Behavior |
|----------|----------|
| File-checked artifacts | Byte count check fails (0 < minBytes). Same as missing. |
| Dir-checked artifacts (legal/, marketing/) | If the directory exists but all files are 0 bytes: `readdirSync` counts them, `minFiles: 1` passes. **V-13: empty files accepted.** |
| vision.json | `fileLooksReal` check: 0 < 200. Rejected. |
| product_standard.json | `fileLooksReal` check: 0 < 200. Rejected. |

### Present But Malformed JSON

| Artifact | Behavior |
|----------|----------|
| sizing.json | `readProjectSize` catches parse error, returns null. `validateTierCompletion` returns `{ ok: true }`. **V-08: tier validation bypassed.** |
| milestones.json | Bridge checks only byte count. Malformed JSON passes artifact check. |
| task_ledger.json | Finalization's `existsSync` check passes. Foundation story injection's `JSON.parse` throws, caught by catch block. Foundation stories NOT injected. State promoted to ready without Foundation milestone. **Build loop starts without foundation phase.** |
| vision.json | `fileLooksReal` checks byte count only. Passes if >= 200 bytes. `propagateInfrastructureFromManifest` catches parse error, skips propagation. Vision stays malformed. |
| infrastructure_manifest.json | Foundation story generator catches parse error, uses `{}`. Minimal stories generated. |

### Present But Missing Required Fields

| Artifact | Missing field | Behavior |
|----------|--------------|----------|
| task_ledger.json | No `milestones` array | Foundation injection reads `ledger.milestones`, gets undefined. `Array.isArray(undefined)` is false. `milestones` set to `[]`. `hasFoundation` is false (vacuously). Foundation prepended to empty array. task_ledger ends up with only Foundation milestone, no feature milestones. |
| sizing.json | No `project_size` | `readProjectSize` returns null. Tier validation bypassed (V-08). |
| infrastructure_manifest.json | No `deploy.target` | `propagateInfrastructureFromManifest` returns early. No target propagated. Foundation deploy story shows "auto". |
| infrastructure_manifest.json | No `database.provider` | Foundation skips database story even if database is needed. |
| vision.json | No `infrastructure` | `propagateInfrastructureFromManifest` creates `infrastructure: {}`, fills deployment_target from manifest. Works correctly. |

### Present But Wrong Field Names

| Artifact | Wrong name | Expected name | Behavior |
|----------|-----------|--------------|----------|
| sizing.json | `classified_at` | `decided_at` (schema) | No consumer reads `decided_at`. No impact today. Schema validation would reject. |
| sizing.json | `decided_by: "auto-classifier"` | `decided_by: "classifier"` (schema enum) | No consumer validates the enum. No impact today. |
| milestones.json | `acceptance_criteria` vs `acceptanceCriteria` | Both are `acceptance_criteria` in practice | No mismatch observed. Prompt and actual artifact both use snake_case. |
| vision.json | `product_name` | `name` (schema) | Schema requires `name`. Actual uses `product_name`. No consumer validates. |

---

## Specific Cross-Artifact Checks

### 1. task_ledger.json vs milestones.json — Same Schema?

**No.** They share a core shape (milestones array with stories) but diverge significantly:

| Field | milestones.json | task_ledger.json | task-ledger-v3 schema |
|-------|----------------|-----------------|----------------------|
| Top-level `project` | absent | present | not defined |
| Top-level `seeded_at` | absent | present | not defined |
| Top-level `seeded_by` | absent | present | not defined |
| Top-level `human_approved` | absent | present | not defined |
| Milestone `description` | absent | present | not defined |
| Milestone `feature_areas` | present | absent | not defined |
| Milestone `depends_on_milestones` | present | absent | not defined |
| Story `description` | absent | present | not defined |
| Story `po_checks` | present | absent | not defined |
| Story `user_journeys` | present | absent | not defined |
| Story `feature_area` | present | absent | not defined |
| Story `notes` | present | absent | not defined |
| Story `env_limitations` | absent | present | not defined |
| Story `fix_story` | absent | present | not defined |
| Story `affected_entities` | present | present | not defined |
| Story `affected_screens` | present | present | not defined |

**Should they be the same?** The orchestrator prompt says to write "the SAME milestones structure" to both. The actual artifacts show they are NOT the same — the orchestrator adds metadata to task_ledger.json that isn't in milestones.json.

**Who is source of truth?** task_ledger.json. The build loop reads it. milestones.json is only checked by the bridge artifact verifier (byte count) and is never read again after seeding.

### 2. vision.json — Merge Strategy

- SPEC writes `complexity_profile` and `infrastructure` fields
- Orchestrator writes the full file (potentially overwriting SPEC's writes)
- `propagateInfrastructureFromManifest` does non-destructive field-fill only

**Risk:** If SPEC writes vision.json first, then the orchestrator rewrites the entire file, SPEC's `complexity_profile` and `infrastructure.services` could be lost. The orchestrator prompt instructs Claude to write vision.json as a complete file (not a merge), so this is a last-write-wins race.

**Mitigation:** In practice, SPEC runs before the orchestrator's final write, and the orchestrator has SPEC's output in context, so it typically includes the profile. But this is LLM-honor-system, not code-enforced.

### 3. product_standard.json

**Who writes it:** No discipline prompt specifies it. The orchestrator prompt mentions it once.
**What's in it:** Unknown. No schema. No example. No test.
**Who validates it:** `fileLooksReal` (>= 200 bytes).
**Who reads it:** Unknown from the files audited. Presumably the evaluator reads it as context.
**Impact:** Ghost artifact that blocks finalization without any structured definition.

### 4. infrastructure_manifest.json — Existence for Highlow

Highlow is S-tier. Infrastructure is applicable. The manifest should exist but doesn't yet (infrastructure discipline in progress). If infrastructure completes successfully, the manifest will exist and `propagateInfrastructureFromManifest` will mirror values to vision.json. If it doesn't, finalization will fail on the tier validation check (infrastructure not in disciplines_complete).

For this S-tier project: it needs infrastructure to exist. The current state is correct — seeding is stalled waiting for infrastructure to complete.

### 5. design/ artifacts and the build loop

The build loop prompts (not audited in detail here) are expected to read the design YAML for style tokens, component mappings, and PO checks. The design prompt writes highly structured YAML with specific field names (e.g., `style_tokens.colors.primary`, `screen_component_mapping[].regions[].shadcn_base`). If the build loop prompts read these files as context, the field names must match exactly. But since there's no programmatic YAML parsing — just LLM context injection — minor structural variations are absorbed by the LLM. The risk is not crashes but degraded quality (wrong color tokens, missed component mappings).

---

## Violation Summary Table

| ID | Severity | Artifact | Description |
|----|----------|----------|-------------|
| V-01 | HIGH | vision.json | Schema requires `persona` as object and `feature_areas[]`; actual uses flat strings and `scope`. `product_name` vs `name`. |
| V-02 | HIGH | product_standard.json | Required by finalize, not written by any prompt. Ghost artifact blocks finalization. |
| V-03 | HIGH | task_ledger.json / milestones.json | Divergent schemas. Foundation stories injected with minimal shape into ledger containing full-shape feature stories. |
| V-04 | LOW | brainstorming.md | No structural validation of markdown content (Classifier Signals section). |
| V-05 | MEDIUM | competition.md | reference_products JSON block never extracted or consumed by any code. |
| V-06 | LOW | taste.md | Fenced JSON never parsed by bridge. Kill verdict exit path is LLM-only. |
| V-07 | MEDIUM | sizing.json | `classified_at` vs `decided_at`, `auto-classifier` vs `classifier` — field name and enum value mismatches with schema. |
| V-08 | MEDIUM | sizing.json | Malformed sizing.json silently bypasses all tier validation (returns `ok: true`). |
| V-09 | MEDIUM | milestones.json | No JSON parse validation. Any 500-byte file passes. |
| V-10 | MEDIUM | infrastructure_manifest.json | No structural validation. Invalid JSON with >= 200 bytes passes. Downstream consumers silently degrade. |
| V-11 | MEDIUM | design/*.yaml | `slop_detected: true` hard-block described in prompt but not enforced by bridge code. |
| V-12 | LOW | design/*.yaml | No YAML parse validation. Random text meeting byte threshold passes. |
| V-13 | MEDIUM | legal/, marketing/ | `kind: 'dir'` with `minFiles: 1` accepts directories with empty (0-byte) files. No per-file byte floor. |
| V-14 | LOW | vision.json | Multiple writers (SPEC, orchestrator, propagateInfrastructureFromManifest) with no merge protocol. Last-write-wins for orchestrator; field-fill for propagate. SPEC's writes can be overwritten. |

**By severity:**
- HIGH: 3 (V-01, V-02, V-03)
- MEDIUM: 7 (V-05, V-07, V-08, V-09, V-10, V-11, V-13)
- LOW: 4 (V-04, V-06, V-12, V-14)

---

## Recommendations (Not Fixes — Observations Only)

1. `product_standard.json` is a blocker in every seeding session that lacks an attentive orchestrator LLM. Either a discipline prompt must define what goes in it, or finalize must stop requiring it.

2. The vision.json schema is stale relative to what prompts and artifacts actually produce. Either the schema should be updated to match reality, or the artifact should be made to match the schema.

3. The task-ledger-v3 schema is a subset of what actually gets written. Foundation stories and feature stories have different shapes in the same array. Any typed consumer will need to handle both.

4. The `kind: 'dir'` artifact check for legal/ and marketing/ should apply a per-file byte floor, not just count files.

5. Malformed sizing.json silently skipping tier validation is a significant safety gap — a single corrupted file disables all tier-gating enforcement.
