# Artifact Dependency Chain Audit

**Date:** 2026-05-03
**Scope:** All seeding discipline artifacts, their producers, consumers, and tier-gating gaps.
**Method:** Static analysis of all 9 discipline prompts, orchestrator prompt, foundation/build prompts, seeding-finalize.ts, foundation-stories.js, discipline-artifacts.ts, tier-registry.ts, discipline-registry.js, context-assembly.js, deploy-to-staging.js, provision-infrastructure.js, rouge-loop.js, and preamble-injector.js.

---

## 1. Per-Discipline Artifact Map

### 1.1 BRAINSTORMING (tier: XS)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Design document | `seed_spec/brainstorming.md` | Markdown | Problem, User, Emotional North Star, Feature Areas, Temporal Arc, Scope Summary, **Classifier Signals** (entity_count, integration_count, role_count, journey_count, screen_count) |

**Consumes:**
- Human's initial idea (from Slack trigger)
- Prior brainstorming output (on loop-back)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| SIZING (`03b-sizing.md`) | `## Classifier Signals` block (5 integer counts) | CLI exits non-zero; SIZING loops back to BRAINSTORMING |
| TASTE (`03-taste.md`) | Full brainstorming output for premise challenge | Falls back to raw idea statement; flags reduced context |
| COMPETITION (`02-competition.md`) | Idea statement from brainstorming output | Falls back to original Slack trigger |
| SPEC (`04-spec.md`) | Feature areas, user journeys, scope summary | Cannot decompose into milestones/stories |
| MARKETING (`07-marketing.md`) | Product vision, target persona, the hook | Loops back to BRAINSTORMING |
| `discipline-artifacts.ts` | File existence + size >= 500 bytes | `[DISCIPLINE_COMPLETE: brainstorming]` rejected |

---

### 1.2 COMPETITION (tier: M)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Competition brief | `seed_spec/competition.md` | Markdown | Market density, Competitor table, Design Patterns, Gap Analysis, Differentiation Angle, Advisory Verdict, Reference Products |
| Reference products | written to `cycle_context.json` | JSON | `reference_products[]` with name, url, dimensions |
| Screenshots | `/tmp/rouge-seed/competition/*.png` | PNG | Competitor site screenshots |

**Consumes:**
- Brainstorming output (or original idea)
- `cycle_context.json` for prior discipline outputs

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| TASTE (`03-taste.md`) | `competition_output` for premise cross-reference | Proceeds without competition context; flags it |
| SPEC (`04-spec.md`) | Competitive intelligence for feature design | No competitive design patterns available |
| DESIGN (`05-design.md`) | Competitive design browsing reference | No reference products for evaluator |
| `context-assembly.js` | `reference_products` from `cycle_context.json` | `milestoneContext.reference_products` is empty array |
| `discipline-artifacts.ts` | File existence >= 500 bytes | `[DISCIPLINE_COMPLETE: competition]` rejected |

---

### 1.3 TASTE (tier: XS)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Taste verdict | `seed_spec/taste.md` | Markdown wrapping JSON | verdict (pass/kill), mode, confidence, sharpened_brief, graveyard_entry, loop_back_triggers |

**Consumes:**
- Brainstorming output (required)
- Competition output (optional, may be null)
- Previous taste verdict (on re-invocation)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| SIZING (`03b-sizing.md`) | Taste must PASS before sizing runs | Sizing cannot proceed |
| SPEC (`04-spec.md`) | Sharpened brief (scope boundaries, persona, killer edge) | Spec works without it but loses scope constraints |
| MARKETING (`07-marketing.md`) | Approved scope, positioning | Loops back to TASTE |
| Orchestrator (`00-swarm-orchestrator.md`) | Verdict determines whether to continue or kill | If KILL, writes graveyard entry and exits |
| `discipline-artifacts.ts` | File existence >= 300 bytes | `[DISCIPLINE_COMPLETE: taste]` rejected |

---

### 1.4 SIZING (tier: XS)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Sizing data | `seed_spec/sizing.json` | JSON | `schema_version`, `project_size` (XS/S/M/L/XL), `signals`, `decided_by`, optional `human_override` |

**Consumes:**
- `seed_spec/brainstorming.md` (Classifier Signals block)
- `seed_spec/taste_verdict.md` (must have passed)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| SPEC (`04-spec.md`) | `project_size` to determine FA count and AC depth | **Defaults to M** if missing/malformed (explicit fallback) |
| Orchestrator (`00-swarm-orchestrator.md`) | `project_size` to determine which disciplines to skip | **All disciplines run** (no tier gating) |
| `tier-registry.ts` | `project_size` for tier validation | Returns `ok: true` (can't validate, legacy fallback) |
| `seeding-finalize.ts` | `project_size` via `validateTierCompletion()` | **Validation skipped entirely** (legacy compat path) |
| `foundation-stories.js` / `seeding-finalize.ts` | `project_size` for foundation story count | **Defaults to M** (generates 7+ stories for an XS project) |

---

### 1.5 SPEC (tier: XS)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Milestones/stories | `seed_spec/milestones.json` | JSON | `milestones[]` with `name`, `stories[]` (each: `id`, `name`, `status`, `acceptance_criteria[]`, `depends_on[]`, `affected_entities[]`, `affected_screens[]`) |
| Per-FA spec files | `openspec/changes/<slug>/areas/*.md` | Markdown | Journeys, ACs, data model, error states, interaction patterns, security, edge cases |
| Complexity profile | Written to `vision.json` | JSON | `complexity_profile.primary`, `complexity_profile.secondary` |
| Integration manifest | Written to seed spec output | JSON | Required services list |
| Services list | Written to `vision.json.infrastructure.services` | JSON | Array of service names |
| Infrastructure fields | `vision.json.infrastructure` | JSON | `needs_database`, `needs_auth`, `needs_payments`, `deployment_target`, `services` |

**Consumes:**
- `seed_spec/sizing.json` (project_size)
- Brainstorming output (feature areas)
- Taste verdict (scope boundaries)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| INFRASTRUCTURE (`08-infrastructure.md`) | Feature areas, technical requirements, data models | Cannot resolve infrastructure decisions |
| DESIGN (`05-design.md`) | Feature areas with acceptance criteria and journeys | Cannot produce sitemap, journey maps, component mapping |
| LEGAL-PRIVACY (`06-legal-privacy.md`) | Spec output for data handling analysis | Cannot assess PII collection or regulated domains |
| MARKETING (`07-marketing.md`) | Feature areas, tool/feature count | Loops back to SPEC |
| Orchestrator on approval | Milestones/stories become `task_ledger.json` | **Build loop has no work to do** |
| `seeding-finalize.ts` | `seed_spec/milestones.json` existence | Finalization fails |
| `01-building.md` | `active_spec` from `cycle_context.json` | Fatal error: no context |
| `context-assembly.js` | `decomposition_strategy`, `active_spec` | Story context has empty spec |
| `discipline-artifacts.ts` | File existence >= 500 bytes | `[DISCIPLINE_COMPLETE: spec]` rejected |

---

### 1.6 INFRASTRUCTURE (tier: S)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Infrastructure manifest | `infrastructure_manifest.json` | JSON | `database` (type, provider, client), `deploy` (target, staging_env), `auth` (strategy, provider), `data_sources[]`, `incompatibilities_resolved[]`, `depends_on_projects[]` |

**Consumes:**
- SPEC output (feature areas, technical requirements)
- `library/integrations/tier-2/` and `tier-3/` (integration catalogue)
- `~/.rouge/registry.json` (project registry)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| DESIGN (`05-design.md`) | Infra constraints (e.g., no WebGL if headless deploy) | Design may specify incompatible patterns |
| `seeding-finalize.ts` | Reads manifest for `propagateInfrastructureFromManifest()` | **vision.json.infrastructure stays empty** -- deployment_target not propagated |
| `foundation-stories.js` | `database.provider`, `auth.strategy`, `integrations[]`, `deploy.target` | **Foundation stories generated with empty/default values** -- wrong story count |
| `00-foundation-building.md` | `foundation_spec.integration_manifest` from `cycle_context.json` | Cannot build integration scaffolds |
| `01-building.md` | `infrastructure_manifest.json` for provider, deploy target, database config | Falls back to vision.json; may mis-detect platform |
| `deploy-to-staging.js` | `vision.json.infrastructure.deployment_target` (propagated from manifest) | **Deploy refuses to proceed** (returns null, logs clear error) |
| `provision-infrastructure.js` | `infrastructure_manifest.json` for wrangler.toml, Supabase setup | Cannot provision infrastructure |
| `rouge-loop.js` | `infrastructure_manifest.json` for db-migrate actions | DB actions fail silently |
| `discipline-artifacts.ts` | File existence >= 200 bytes (strict, no fallback paths) | `[DISCIPLINE_COMPLETE: infrastructure]` rejected |

---

### 1.7 DESIGN (tier: S)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| UX architecture | `design/pass-1-ux-architecture.yaml` | YAML | Sitemap, journey maps, information hierarchy, task flows, pass_1_scores |
| Component design | `design/pass-2-component-design.yaml` | YAML | Screen-component mapping, five-state design, chart specs, icon specs, pass_2_scores |
| Visual design | `design/pass-3-visual-design.yaml` | YAML | Style tokens (colors, typography, spacing, borders, shadows), interaction spec, screen mockups, slop audit, pass_3_scores |
| Combined design | `design/design.yaml` | YAML | All three passes + quality_summary + po_checks + estimates |

**Consumes:**
- SPEC output (feature areas, acceptance criteria, user journeys)
- Infrastructure constraints

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| MARKETING (`07-marketing.md`) | Design tokens (colors, typography, spacing) for landing page scaffold | Loops back to DESIGN |
| `00-foundation-building.md` | Design tokens for UI shell, theme primitives | Foundation builds without design tokens -- inconsistent visual language |
| `01-building.md` | Five-state design, component mapping, interaction patterns | Builder has no design guidance; builds generic UI |
| Evaluation phases | PO checks, quality scores, slop audit results | Evaluator has no design quality bar |
| `discipline-artifacts.ts` | All three pass files >= 300 bytes each, OR combined >= 2000 bytes | `[DISCIPLINE_COMPLETE: design]` rejected |

---

### 1.8 LEGAL-PRIVACY (tier: S)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Terms & Conditions | `legal/terms.md` | Markdown | Service description, account terms, acceptable use, IP, payment, disclaimers, liability, termination, governing law |
| Privacy Policy | `legal/privacy.md` | Markdown | Collection, purpose, storage, access, retention, rights, cookies, children, transfers, contact |
| Cookie Policy | `legal/cookies.md` (conditional) | Markdown | Cookie table, essential/optional, third-party cookies |
| Legal status object | Passed to orchestrator | JSON | `gc_review_done`, `trademark_status`, `ip_risk`, `regulated_domain_flags`, `files_written[]` |

**Consumes:**
- SPEC output (data handling, technical requirements)
- COMPETITION output (trademark context)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| Orchestrator | `regulated_domain_flags`, `blocking_issues` | Cannot detect regulated domains pre-finalization |
| MARKETING (`07-marketing.md`) | Disclosure requirements, regulatory flags | Marketing may produce non-compliant copy |
| `discipline-artifacts.ts` | `legal/` directory with >= 1 file | `[DISCIPLINE_COMPLETE: legal-privacy]` rejected |
| `seeding-finalize.ts` | Not directly checked (checked via tier validation only) | No direct impact on finalization artifact check |

---

### 1.9 MARKETING (tier: M)

**Produces:**
| Artifact | Path | Format | Key Fields |
|----------|------|--------|------------|
| Landing page copy | `marketing/landing-page-copy.md` | Markdown | Hero, Problem, Solution, Features, Social Proof, Pricing, FAQ, Footer CTA |
| Landing page scaffold | `marketing/landing-page.html` | HTML | Semantic HTML5 with CSS custom properties referencing design tokens |
| Product Hunt launch copy | `marketing/product-hunt-launch.md` | Markdown | Title, tagline, description, maker comment, suggested visuals |
| README | `README.md` (project root) | Markdown | Badges, title, install, quickstart, features, config, API, contributing, license |

**Consumes:**
- BRAINSTORMING (vision, persona, hook)
- TASTE (positioning, scope)
- SPEC (feature areas)
- DESIGN (design tokens)
- LEGAL-PRIVACY (disclosure requirements)

**Downstream consumers:**
| Consumer | What it reads | What breaks if missing |
|----------|---------------|----------------------|
| `discipline-artifacts.ts` | `marketing/` directory with >= 1 file | `[DISCIPLINE_COMPLETE: marketing]` rejected |
| Build loop | README.md if present | No impact on build loop |

---

## 2. Cross-Cutting Artifacts (Not Discipline-Specific)

### 2.1 vision.json

**Writers:**
| Writer | Fields Written | When |
|--------|---------------|------|
| SPEC (`04-spec.md`) | `complexity_profile`, `infrastructure.needs_database`, `infrastructure.needs_auth`, `infrastructure.needs_payments`, `infrastructure.deployment_target`, `infrastructure.services` | During Beat 2 (complexity profile) and integration manifest |
| Orchestrator (`00-swarm-orchestrator.md`) | Full vision document on human approval | After H-final-approval gate |
| `seeding-finalize.ts` | `infrastructure.deployment_target`, `infrastructure.needs_database`, `infrastructure.needs_auth` | During `propagateInfrastructureFromManifest()` -- **only fills missing fields** |

**Readers:**
| Reader | Fields Read | Impact if Missing |
|--------|------------|-------------------|
| `deploy-to-staging.js` | `infrastructure.deployment_target` | **Deploy refuses to proceed** (null return, clear error) |
| `01-building.md` | `complexity_profile` for profile detection | Falls back to stack inference |
| `rouge-loop.js` | `infrastructure` for provisioning decisions | Provisioner warns and stalls |
| `context-assembly.js` | `vision` object for story/milestone context | Context views have empty vision |
| `seeding-finalize.ts` | Existence + >= 200 bytes | **Finalization fails** |

**GAP-V1 (CRITICAL):** Multiple writers for `infrastructure` fields. SPEC writes `deployment_target` to `vision.json.infrastructure`. INFRASTRUCTURE writes it to `infrastructure_manifest.json.deploy.target`. `seeding-finalize.ts` propagates from manifest to vision **only if vision's field is missing**. If SPEC already wrote a different value, the manifest's value is silently ignored. No conflict detection exists.

### 2.2 product_standard.json

**Writers:**
| Writer | When |
|--------|------|
| Orchestrator (`00-swarm-orchestrator.md`) | On human approval, writes inherited global + domain + project overrides |

**Readers:**
| Reader | Fields Read | Impact if Missing |
|--------|------------|-------------------|
| `01-building.md` | Quality bar (global, domain, project standards) | Builder has no quality bar |
| Evaluation phases | Quality standards for scoring | Evaluator has no standard to hold the build to |
| `context-assembly.js` | `product_standard` from `cycle_context.json` | Story context has empty product_standard |
| `seeding-finalize.ts` | Existence + >= 200 bytes | **Finalization fails** |

### 2.3 task_ledger.json

**Writers:**
| Writer | When |
|--------|------|
| Orchestrator (`00-swarm-orchestrator.md`) | On human approval -- milestones + stories from seed_spec |
| `seeding-finalize.ts` | Prepends Foundation milestone (from `generateFoundationStories()`) |
| `generating-change-spec` phase | Only phase with write permission (adds fix stories) |

**Readers:**
| Reader | What it reads | Impact if Missing |
|--------|---------------|-------------------|
| `rouge-loop.js` | `milestones[]` with `stories[]` -- loaded into `state.milestones` | **Build loop has no milestones** -- escalation |
| `00-foundation-building.md` | Stories list for scope-creep test | Cannot detect scope creep |
| `01-building.md` | Story spec (via `story_context.json`) | Fatal error |
| `seeding-finalize.ts` | Existence check | **Finalization fails** |

### 2.4 cycle_context.json

**Writers:** Every phase writes to this (append-only for factory_decisions). The orchestrator writes the initial context on seeding completion.

**Readers:** Every loop phase reads from this. `context-assembly.js` reads it to build focused views.

### 2.5 .rouge/state.json

**Writers:** Orchestrator on approval (sets `current_state: "ready"`, `foundation.status: "pending"`). `seeding-finalize.ts` also promotes to ready. Launcher owns all subsequent transitions.

---

## 3. Tier Dependency Matrix

### Tier Registries (Authoritative)

| Discipline | `discipline-registry.js` | `tier-registry.ts` | `00-swarm-orchestrator.md` |
|------------|--------------------------|---------------------|---------------------------|
| brainstorming | XS | XS | XS |
| competition | M | M | M |
| taste | XS | XS | XS |
| sizing | XS | XS | XS |
| spec | XS | XS | XS |
| infrastructure | S | S | S |
| design | S | S | S |
| legal-privacy | S | S | S |
| marketing | M | M | M |

All three sources are in sync.

### 3.1 XS Tier (e.g., calculator)

**Disciplines that RUN:** brainstorming, taste, sizing, spec
**Disciplines SKIPPED:** competition, infrastructure, design, legal-privacy, marketing

| Artifact | Produced? | Consumers That Break | Gap-Filler |
|----------|-----------|---------------------|------------|
| `seed_spec/brainstorming.md` | YES | -- | -- |
| `seed_spec/taste.md` | YES | -- | -- |
| `seed_spec/sizing.json` | YES | -- | -- |
| `seed_spec/milestones.json` | YES | -- | -- |
| `seed_spec/competition.md` | **NO** | TASTE (optional cross-reference), evaluator (no reference_products) | TASTE proceeds without; evaluator has no pairwise comparison targets |
| `infrastructure_manifest.json` | **NO** | **seeding-finalize.ts** (propagateInfra is no-op), **foundation-stories.js** (defaults to M), **deploy-to-staging.js** (needs deployment_target from vision.json), **00-foundation-building.md** (no integration_manifest) | **SPEC writes deployment_target directly to vision.json** -- this is the only path |
| `design/` (3 YAML passes) | **NO** | **MARKETING** (would loop-back but marketing also skipped), **foundation-building** (no design tokens), **01-building.md** (no design guidance) | **No gap-filler.** Builder constructs UI without any design specification. |
| `legal/` directory | **NO** | MARKETING (disclosure requirements, but marketing also skipped) | No gap-filler needed (XS products typically don't need legal boilerplate) |
| `marketing/` directory | **NO** | None critical | No gap-filler needed |
| `vision.json` | Partial | SPEC writes `infrastructure.*` and `complexity_profile`; orchestrator writes the rest on approval | **GAP-X1:** If orchestrator doesn't fully populate vision.json, fields stay empty |
| `product_standard.json` | YES (orchestrator) | -- | -- |
| `task_ledger.json` | YES (orchestrator) | -- | -- |

### 3.2 S Tier (e.g., todo app)

**Disciplines that RUN:** brainstorming, taste, sizing, spec, infrastructure, design, legal-privacy
**Disciplines SKIPPED:** competition, marketing

| Artifact | Produced? | Consumers That Break | Gap-Filler |
|----------|-----------|---------------------|------------|
| `seed_spec/competition.md` | **NO** | TASTE (optional), evaluator (no reference_products) | Same as XS |
| `marketing/` directory | **NO** | None critical | No gap-filler needed |
| `infrastructure_manifest.json` | YES | -- | -- |
| `design/` (3 YAML passes) | YES | -- | -- |
| `legal/` directory | YES | -- | -- |
| All other seeding artifacts | YES | -- | -- |

### 3.3 M Tier (e.g., full SaaS product)

**Disciplines that RUN:** All 9
**Disciplines SKIPPED:** None

All artifacts produced. No gaps at M tier.

---

## 4. Specific Gap Investigation

### 4.1 XS gap: infrastructure_manifest.json

**Who writes it:** INFRASTRUCTURE discipline (`08-infrastructure.md`), which is tier S.

**Who reads it:**
1. `seeding-finalize.ts` -- `propagateInfrastructureFromManifest()` copies `deploy.target` to `vision.json.infrastructure.deployment_target`. **If manifest is absent, this function returns immediately (no-op).**
2. `foundation-stories.js` / `seeding-finalize.ts` -- reads `database.provider`, `auth.strategy`, `integrations[]`, `deploy.target` to generate tier-appropriate foundation stories. **If absent, reads empty object `{}` and defaults `size` to `'M'`.**
3. `deploy-to-staging.js` -- reads `vision.json.infrastructure.deployment_target` (the propagated value). **If this is null, deploy refuses.**
4. `rouge-loop.js` -- reads manifest for `db-migrate` pending actions.
5. `00-foundation-building.md` -- reads `foundation_spec.integration_manifest` from `cycle_context.json`.
6. `01-building.md` -- reads `infrastructure_manifest.json` directly for provider, deploy target, database config.

**What happens when infrastructure is skipped (XS):**
- **SPEC writes `deployment_target` directly to `vision.json.infrastructure`** (line 610-620 of `04-spec.md`). This is the only path that populates `deployment_target` for XS projects.
- `propagateInfrastructureFromManifest()` in `seeding-finalize.ts` is a no-op.
- `foundation-stories.js` reads empty manifest, defaults to `size='M'` from sizing.json. **BUG (GAP-I1):** If `sizing.json` returns `project_size: 'XS'`, foundation-stories correctly gates stories. But it reads `manifest.database.provider` etc. from the absent manifest, so the foundation stories are generated without infrastructure awareness: no database story name includes the provider, no auth story includes the strategy. This is cosmetic, not functional -- the tier gate itself works.
- `01-building.md` reads `infrastructure_manifest.json` directly. For XS it won't exist. The prompt falls back to `vision.json` for deploy target (Step 2.5, Input 2). **This fallback works** because SPEC populated `vision.json.infrastructure`.
- `deploy-to-staging.js` calls `detectDeployTarget()` which reads `vision.json.infrastructure.deployment_target`. **This works** if SPEC wrote it. **Breaks if SPEC didn't write it** (e.g., `api-first` or `single-page` profile where SPEC deferred the decision).

**GAP-I2 (MEDIUM):** For XS projects where SPEC's complexity profile is `single-page` and the deployment target is deferred ("leave it unset only if you genuinely cannot decide yet"), `vision.json.infrastructure.deployment_target` may be null. `deploy-to-staging.js` will refuse to deploy. No fallback exists for XS projects because the infrastructure discipline that would have resolved this was skipped.

### 4.2 XS gap: design artifacts

**Who writes them:** DESIGN discipline (`05-design.md`), which is tier S.

**Does the build loop need them?**
- `01-building.md` Step 2.5 detects the complexity profile. It reads `vision.json.complexity_profile` first (written by SPEC). It does NOT require design artifacts for profile detection.
- `01-building.md` uses design tokens for building UI. Without design artifacts, the builder has no: sitemap, journey maps, component mapping, five-state design, visual tokens, interaction specs.
- `00-foundation-building.md` reads design tokens for "Shared UI Components" (app shell, theme tokens). Without design, foundation builds a generic shell.

**GAP-D1 (MEDIUM):** XS projects have no design artifacts. The builder constructs UI purely from SPEC's acceptance criteria and user journeys. There is no visual design system, no five-state coverage, no slop audit. For an XS project (calculator, single-page tool), this is probably acceptable -- the scope is small enough that visual consistency is achievable without explicit design tokens. However, the evaluation phases reference design PO checks that don't exist, so the evaluator has no design quality bar for XS projects.

### 4.3 XS gap: legal artifacts

**Who writes them:** LEGAL-PRIVACY discipline (`06-legal-privacy.md`), which is tier S.

**Does finalization require them?**
- `seeding-finalize.ts` does NOT directly check for `legal/` directory. It checks via `validateTierCompletion()`, which validates that all **applicable** disciplines completed. For XS, legal-privacy is not applicable, so its absence is valid.
- `discipline-artifacts.ts` checks `legal/` directory only when the discipline claims completion.
- No downstream build phase hard-requires legal artifacts.

**GAP-L1 (LOW):** No gap. Legal artifacts are correctly gated by tier. XS projects skip legal, and no consumer breaks.

### 4.4 S gap: competition/marketing

**Do build phases reference competition.md or marketing artifacts?**
- `01-building.md` does NOT read `seed_spec/competition.md` directly. It reads `cycle_context.json` which may contain `reference_products` -- these come from COMPETITION. For S projects, `reference_products` will be empty.
- `context-assembly.js` reads `reference_products` from `cycle_context.json` and passes to milestone context. If empty, the evaluator has no pairwise comparison targets.
- No build phase reads marketing artifacts.
- The evaluation orchestrator uses `reference_products` for pairwise quality comparison (browsing competitor sites during evaluation). Without them, evaluation is self-referential.

**GAP-C1 (LOW):** S-tier projects have no reference products for pairwise evaluation. The evaluator assesses quality against the spec only, not against competitors. This is by design for S-tier but worth noting.

### 4.5 vision.json: who writes infrastructure?

**Multiple writers:**
1. **SPEC** (`04-spec.md`): writes `complexity_profile`, `infrastructure.needs_database`, `needs_auth`, `needs_payments`, `deployment_target`, `services` (line 573-620).
2. **INFRASTRUCTURE** (`08-infrastructure.md`): writes to `infrastructure_manifest.json`, NOT directly to `vision.json`. The discipline explicitly says "Write `infrastructure_manifest.json` to the project root."
3. **Orchestrator** (`00-swarm-orchestrator.md`): writes full `vision.json` on human approval (line 293).
4. **`seeding-finalize.ts`**: `propagateInfrastructureFromManifest()` copies `deploy.target` from manifest to `vision.json.infrastructure.deployment_target` **only if the vision field is missing** (line 289).

**Conflict scenario:**
1. SPEC runs first, writes `deployment_target: "vercel"` to `vision.json.infrastructure`.
2. INFRASTRUCTURE runs later, determines the correct target is `cloudflare-workers`, writes to `infrastructure_manifest.json.deploy.target`.
3. `seeding-finalize.ts` runs `propagateInfrastructureFromManifest()`. Checks `vision.json.infrastructure.deployment_target` -- it's already `"vercel"` (from SPEC). **Does not overwrite.** The manifest's `"cloudflare-workers"` is silently ignored.
4. `deploy-to-staging.js` reads `vision.json.infrastructure.deployment_target` = `"vercel"`. Deploys to Vercel despite infrastructure analysis choosing Cloudflare.

**GAP-V1 (CRITICAL):** SPEC writes `deployment_target` to `vision.json` before INFRASTRUCTURE runs. INFRASTRUCTURE's corrected value in the manifest is only propagated to vision if the vision field is empty. No conflict detection, no overwrite. The infrastructure discipline's resolution is silently lost.

**Additional note:** The orchestrator's final approval step writes the entire `vision.json`. If the orchestrator re-writes `infrastructure` from scratch without reading INFRASTRUCTURE's manifest, the manifest values are lost entirely. If the orchestrator preserves what SPEC wrote, the same stale-value problem from the conflict scenario applies.

### 4.6 product_standard.json: who writes it?

**Writer:** Only the orchestrator, on human approval (line 296 of `00-swarm-orchestrator.md`).

**Is it required for build?** YES.
- `seeding-finalize.ts` checks existence + >= 200 bytes. **Finalization fails** if missing.
- `context-assembly.js` reads it for story/milestone context.
- Build and evaluation phases use it as the quality bar.

**GAP-P1 (LOW):** No gap identified. The orchestrator writes it on approval, and finalization validates it. However, the orchestrator prompt only mentions writing it in the final approval step (line 296). If the orchestrator fails to write it (e.g., crash during approval), finalization catches the absence.

### 4.7 task_ledger.json: milestones and stories

**Who writes milestones?** The orchestrator on human approval (line 293): "Write the SAME milestones structure you're about to write to state.json."

**Who writes stories?** The orchestrator (same step). Each story has `id`, `name`, `status: "pending"`, `depends_on`, `affected_entities`, `affected_screens`.

**Milestone format compatibility:**
- The orchestrator writes milestones based on `seed_spec/milestones.json`.
- `seeding-finalize.ts` then reads `task_ledger.json`, checks for a Foundation milestone, and prepends one if absent.
- `rouge-loop.js` (line 1064) loads `task_ledger.json.milestones` into `state.milestones`.

**GAP-T1 (MEDIUM):** The milestone format in task_ledger.json is defined by the orchestrator prompt but not validated by a JSON schema at finalization time. `seeding-finalize.ts` checks existence only, not structure. If the orchestrator writes milestones with a different structure than `rouge-loop.js` expects (e.g., missing `stories[]` array on a milestone), the loop will escalate with a confusing error message at line 1227-1242: "no milestones in state.milestones or task_ledger.json."

**GAP-T2 (MEDIUM):** Foundation story generation in `seeding-finalize.ts` and `foundation-stories.js` reads `infrastructure_manifest.json` for database/auth/integration details. For XS projects where the manifest doesn't exist, the generation still runs (reads empty `{}`). The tier check correctly limits stories to scaffold + deploy for XS. However, **the foundation stories reference `vision.entities` for entity count** (line 71 in seeding-finalize.ts). `vision.json` may not have an `entities` array (SPEC doesn't explicitly write one -- it writes `infrastructure.services` and `complexity_profile`, not `entities`). The entity count defaults to 0, which is correct for database story naming but misleading.

---

## 5. Full Dependency Matrix

### Artifacts produced by each discipline and their critical downstream consumers

```
BRAINSTORMING (XS)
  seed_spec/brainstorming.md
    -> SIZING (reads Classifier Signals) [REQUIRED]
    -> TASTE (reads for premise challenge) [REQUIRED]
    -> SPEC (reads feature areas) [REQUIRED]
    -> MARKETING (reads vision/persona) [REQUIRED at M]

COMPETITION (M)
  seed_spec/competition.md
    -> TASTE (optional cross-reference) [OPTIONAL]
    -> SPEC (competitive intelligence) [OPTIONAL]
    -> Evaluator (reference_products for pairwise comparison) [NICE-TO-HAVE]

TASTE (XS)
  seed_spec/taste.md
    -> SIZING (must PASS before sizing runs) [GATE]
    -> SPEC (scope boundaries) [INFORMATIONAL]

SIZING (XS)
  seed_spec/sizing.json
    -> SPEC (FA count, AC depth) [REQUIRED, defaults to M if missing]
    -> Orchestrator (tier gating) [REQUIRED, all disciplines run if missing]
    -> seeding-finalize.ts (tier validation) [REQUIRED, skips validation if missing]
    -> foundation-stories.js (story count) [REQUIRED, defaults to M if missing]

SPEC (XS)
  seed_spec/milestones.json
    -> Orchestrator -> task_ledger.json [REQUIRED]
    -> seeding-finalize.ts (existence check) [REQUIRED]
  vision.json (infrastructure.*, complexity_profile)
    -> deploy-to-staging.js [REQUIRED for deploy]
    -> 01-building.md (profile detection) [REQUIRED, has fallback]

INFRASTRUCTURE (S)
  infrastructure_manifest.json
    -> seeding-finalize.ts (propagate to vision.json) [REQUIRED for S+ deploy]
    -> foundation-stories.js (story details) [INFORMATIONAL]
    -> 00-foundation-building.md (build instructions) [REQUIRED for S+ foundation]
    -> deploy-to-staging.js (via vision.json propagation) [REQUIRED for deploy]

DESIGN (S)
  design/*.yaml (3 passes)
    -> MARKETING (design tokens for scaffold) [REQUIRED at M]
    -> 00-foundation-building.md (UI shell tokens) [INFORMATIONAL]
    -> Evaluator (design PO checks) [REQUIRED for design quality eval]

LEGAL-PRIVACY (S)
  legal/*.md
    -> MARKETING (disclosure requirements) [INFORMATIONAL at M]
    -> No hard downstream dependencies

MARKETING (M)
  marketing/*.md, README.md
    -> No hard downstream dependencies
```

---

## 6. Gap Summary

### Total gaps found: 9

| ID | Severity | Gap Description | Affected Tiers |
|----|----------|----------------|----------------|
| GAP-V1 | **CRITICAL** | SPEC writes `deployment_target` to `vision.json` before INFRASTRUCTURE runs. INFRASTRUCTURE writes the corrected value to `infrastructure_manifest.json`. `seeding-finalize.ts` only propagates if vision field is empty, so INFRASTRUCTURE's decision is silently lost. | S, M, L, XL |
| GAP-I2 | **MEDIUM** | XS projects where SPEC defers `deployment_target` (leaves it null in `vision.json`) have no infrastructure discipline to resolve it. `deploy-to-staging.js` refuses to deploy. No fallback exists. | XS |
| GAP-D1 | **MEDIUM** | XS projects have no design artifacts. Builder constructs UI from spec ACs only. Evaluator has no design PO checks. Evaluation is design-blind. | XS |
| GAP-T1 | **MEDIUM** | `task_ledger.json` structure is not validated by schema at finalization. Malformed milestones cause cryptic build-loop errors. | All |
| GAP-T2 | **MEDIUM** | Foundation story generation reads `vision.entities` for entity count, but SPEC never writes an `entities` array to vision.json. Entity count always defaults to 0. | S, M, L, XL |
| GAP-I1 | **LOW** | When `infrastructure_manifest.json` is absent (XS), foundation-stories reads empty `{}`. Foundation stories are generated without provider names in descriptions (cosmetic). | XS |
| GAP-C1 | **LOW** | S-tier projects have no reference products for pairwise evaluation. Evaluator assesses quality against spec only. | S |
| GAP-L1 | **LOW** | No gap. Legal artifacts correctly gated by tier. | -- |
| GAP-P1 | **LOW** | `product_standard.json` is only written by the orchestrator in the final approval step. If the orchestrator crashes during approval, finalization catches the absence. No intermediate checkpoint. | All |
| GAP-X1 | **LOW** | If orchestrator doesn't fully populate `vision.json` on approval, fields may be missing. Finalization checks byte size only, not field completeness. | All |

---

## 7. The 3 Worst Gaps

### 1. GAP-V1 (CRITICAL): Infrastructure discipline's deployment_target silently overridden

**What happens:** SPEC runs at XS tier and writes `deployment_target` to `vision.json`. Later, INFRASTRUCTURE runs at S+ tier and determines a *different* deploy target is correct (e.g., SPEC guessed `vercel`, infrastructure analysis chose `cloudflare-workers`). The infrastructure discipline writes to `infrastructure_manifest.json`, not `vision.json`. `seeding-finalize.ts` tries to propagate from manifest to vision, but only fills **missing** fields -- since SPEC already wrote a value, the propagation is a no-op. The build loop reads the stale SPEC value from vision.json and deploys to the wrong platform.

**Root cause:** Two sources of truth for `deployment_target` with a non-destructive (fill-only) merge strategy.

**Impact:** Wrong deployment platform. Build may succeed but target fundamentally wrong. Foundation and build loop provision wrong infrastructure. Potentially unrecoverable without manual intervention.

### 2. GAP-I2 (MEDIUM): XS projects with deferred deployment_target cannot deploy

**What happens:** SPEC's prompt says "Leave it unset only if you genuinely cannot decide yet -- the INFRASTRUCTURE discipline will confirm or override it." But for XS projects, the INFRASTRUCTURE discipline is skipped entirely. If SPEC didn't write `deployment_target` to `vision.json`, no one ever will. `deploy-to-staging.js` calls `detectDeployTarget()`, gets `null`, and refuses to deploy.

**Root cause:** SPEC's instruction assumes INFRASTRUCTURE will always run as a backstop. Tier gating breaks this assumption.

**Impact:** XS projects that don't have an obvious deployment target stall at first deploy with no clear path forward.

### 3. GAP-D1 (MEDIUM): XS projects have zero design specification for the builder

**What happens:** The design discipline is S-tier. XS projects skip it entirely. The builder (`01-building.md`) has no sitemap, no component mapping, no five-state design, no visual tokens, no interaction specs. It builds UI purely from SPEC acceptance criteria. The evaluator has no design PO checks to score against.

**Root cause:** Design is tier-gated at S, but SPEC's output does not include a minimal design specification as a substitute. The assumption is that XS products are simple enough to not need design -- but even a calculator has states (empty, populated, error) and visual choices.

**Impact:** XS product visual quality is unguided and unevaluated. The quality loop has a design-shaped hole for the simplest tier of products.
