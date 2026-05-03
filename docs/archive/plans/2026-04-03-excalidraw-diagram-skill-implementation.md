# Excalidraw Diagram Skill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an `excalidraw-diagram` skill in The Rouge that generates professional Excalidraw diagrams via Python scripts with a built-in visual review loop.

**Architecture:** Copy renderer tooling from AI-Factory, copy design rules, create the skill prompt with two phases (generate Python script + review PNG). Prove it works by regenerating the V2 process map.

**Tech Stack:** Python 3.11+, Playwright, Excalidraw JSON format, uv package manager

---

### Task 1: Copy renderer tooling to The Rouge

**Files:**
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams/render_excalidraw.py`
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams/render_template.html`
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams/pyproject.toml`

**Step 1: Create the tools/diagrams directory**

```bash
mkdir -p /Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams
```

**Step 2: Copy the renderer files**

```bash
cp /Users/gregario/Projects/ClaudeCode/AI-Factory/stacks/substack/tools/render_excalidraw.py \
   /Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams/

cp /Users/gregario/Projects/ClaudeCode/AI-Factory/stacks/substack/tools/render_template.html \
   /Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams/
```

**Step 3: Create a minimal pyproject.toml**

The AI-Factory version has extra deps for Mermaid conversion. We only need Playwright:

```toml
[project]
name = "rouge-diagrams"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "playwright>=1.40.0",
]
```

**Step 4: Verify the renderer works**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge/tools/diagrams
uv sync
uv run playwright install chromium
uv run python render_excalidraw.py /Users/gregario/Projects/ClaudeCode/The-Rouge/docs/diagrams/karpathy-loop.excalidraw --output /tmp/test-render.png --scale 2
```

Expected: PNG file at `/tmp/test-render.png` matching the existing `karpathy-loop.png`.

**Step 5: Commit**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
git add tools/diagrams/
git commit -m "feat: add Excalidraw diagram renderer tooling

Copied from AI-Factory/stacks/substack/tools. Playwright-based
renderer that converts .excalidraw JSON to high-quality PNG."
```

---

### Task 2: Copy design rules to The Rouge

**Files:**
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/design/diagram-design-rules.md`

**Step 1: Copy the design rules**

```bash
cp /Users/gregario/Projects/ClaudeCode/AI-Factory/stacks/substack/diagram-design-rules.md \
   /Users/gregario/Projects/ClaudeCode/The-Rouge/docs/design/diagram-design-rules.md
```

**Step 2: Commit**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
git add docs/design/diagram-design-rules.md
git commit -m "docs: add diagram design rules (8px grid, sizing, arrows, colours)

Copied from AI-Factory/stacks/substack. Rulebook for generating
professional-grade Excalidraw diagrams programmatically."
```

---

### Task 3: Create the excalidraw-diagram skill

**Files:**
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/.claude/skills/excalidraw-diagram/SKILL.md`

**Step 1: Write the skill prompt**

The skill must cover:
- Phase 1: How to write a Python generator script (referencing design rules + build-karpathy-loop.py as the pattern)
- Phase 2: How to review the rendered PNG against the design rules checklist and iterate

Read these files for context before writing the skill:
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/design/diagram-design-rules.md` — the full rulebook
- `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/diagrams/build-karpathy-loop.py` — the canonical generator pattern (read the FULL file, every helper function)
- `/Users/gregario/Projects/ClaudeCode/AI-Factory/stacks/substack/diagrams.md` — pipeline overview and style guide

Write the skill to `/Users/gregario/Projects/ClaudeCode/The-Rouge/.claude/skills/excalidraw-diagram/SKILL.md` with this structure:

```markdown
---
name: excalidraw-diagram
description: Use when creating or updating Excalidraw diagrams — writes a Python generator script following design rules, renders to PNG, reviews visually, and iterates fixes
---

# Excalidraw Diagram

Generate professional Excalidraw diagrams via Python generator scripts with visual review.

**Before anything:** Read these files in order:
1. `docs/design/diagram-design-rules.md` — the design rulebook
2. `docs/diagrams/build-karpathy-loop.py` — the canonical generator pattern

## Phase 1: Generate

[Instructions for writing the Python generator script...]
[Must reference: 8px grid, make_rect/make_diamond/make_arrow helpers, colour palette, sizing rules, arrow routing, text comfort]
[Must specify: save .excalidraw, render to .png via tools/diagrams/render_excalidraw.py]

## Phase 2: Review + Iterate

[Instructions for reading the PNG and checking against design rules...]
[The full checklist from the design doc]
[Max 3 iterations, then flag for human]

## Anti-Patterns
- Never write raw Excalidraw JSON directly (always via Python generator)
- Never guess coordinates (compute mathematically on 8px grid)
- Never skip the visual review phase
- Never exceed 10 boxes per diagram (split into multiple)
```

The skill body should be complete and self-contained — an engineer with zero context should be able to invoke it and produce a professional diagram. Include the specific helper function signatures from `build-karpathy-loop.py` (make_rect, make_diamond, make_arrow with their parameters). Include the exact render command. Include the full review checklist.

**Step 2: Commit**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
git add .claude/skills/excalidraw-diagram/
git commit -m "feat: add excalidraw-diagram skill — generate + review pipeline

Two-phase skill: Phase 1 writes Python generator following design rules
and build-karpathy-loop.py pattern. Phase 2 reviews rendered PNG against
design checklist and iterates up to 3x."
```

---

### Task 4: Regenerate the V2 process map using the new skill

**Files:**
- Create: `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/diagrams/build-v2-process-map.py`
- Overwrite: `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/diagrams/v2-process-map.excalidraw`
- Overwrite: `/Users/gregario/Projects/ClaudeCode/The-Rouge/docs/diagrams/v2-process-map.png`

This task proves the skill works end-to-end.

**Step 1: Invoke the skill**

Use the excalidraw-diagram skill to generate a V2 process map. The brief:

- **What it shows:** The Rouge's V2 pipeline from seeding through completion
- **Nodes and roles:**
  - Seeding (process, hero size) — "SEEDING\n7 disciplines"
  - Foundation Build (process) + Foundation Eval (process) with FAIL retry loop
  - Story Building (process, hero size) with "next story" loop — enclosed in dashed "Story Loop" group
  - Deploy Staging (process, standard size)
  - Milestone Evaluation (process, hero size) — "Test Integrity\nCode Review\nProduct Walk\nEvaluation"
  - QA Verdict (decision diamond)
  - Milestone Fix (warning) with loop back to Evaluation
  - Analyzing (warning) — "Root cause\nImprovement routing"
  - Change Spec Generation (process) 
  - Escalation (decision) — "feedback.json"
  - Vision Check (success)
  - Shipping (process) — "version bump\nPR + deploy"
  - Final Review (process) — "customer walkthrough"
  - Complete (success)
- **Key arrows:**
  - Seeding → Foundation Build → Foundation Eval
  - Foundation Eval → Foundation Build (FAIL, dashed red)
  - Foundation Eval → Story Building (PASS)
  - Story Building → Story Building (next story, loop)
  - Story Building → Deploy Staging (batch complete)
  - Deploy Staging → Milestone Evaluation
  - Milestone Evaluation → QA Verdict
  - QA Verdict → Milestone Fix (FAIL) → Milestone Evaluation
  - QA Verdict → Analyzing (PASS)
  - Analyzing → Story Building (promote + next milestone)
  - Analyzing → Change Spec Gen (deepen/broaden) → Story Building
  - Analyzing → Foundation Build (insert-foundation)
  - Analyzing → Escalation (notify-human)
  - Analyzing → Vision Check (all milestones done)
  - Vision Check → Shipping (aligned)
  - Vision Check → Escalation (diverging)
  - Shipping → Final Review
  - Final Review → Complete (ship)
  - Final Review → Change Spec Gen (refine)
  - Final Review → Escalation (major-rework)
- **Side annotations:**
  - Key artifacts column (right): state.json, cycle_context.json, vision.json, global_improvements.json, journey.json, feedback.json
  - Improvement flow (left): improvement_items[] routing

**Step 2: Follow the skill's Phase 1** — write the Python generator

**Step 3: Run the generator and render**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
python3 docs/diagrams/build-v2-process-map.py
cd tools/diagrams && uv run python render_excalidraw.py ../../docs/diagrams/v2-process-map.excalidraw --output ../../docs/diagrams/v2-process-map.png --scale 2
```

**Step 4: Follow the skill's Phase 2** — review the PNG, iterate if needed

**Step 5: Commit**

```bash
cd /Users/gregario/Projects/ClaudeCode/The-Rouge
git add docs/diagrams/build-v2-process-map.py docs/diagrams/v2-process-map.excalidraw docs/diagrams/v2-process-map.png
git commit -m "feat: regenerate V2 process map via Python generator

Replaces LLM-generated JSON with mathematically computed layout.
Uses build-karpathy-loop.py pattern with 8px grid alignment."
```

---

## Verification

After all tasks:

1. **Renderer works:** `uv run python render_excalidraw.py` produces PNGs from `.excalidraw` files
2. **Skill exists:** `.claude/skills/excalidraw-diagram/SKILL.md` is complete and self-contained
3. **Design rules exist:** `docs/design/diagram-design-rules.md` is in the Rouge repo
4. **V2 process map regenerated:** New PNG has correct arrow directions, proper spacing, legible text
5. **Reference generator preserved:** `build-karpathy-loop.py` unchanged, still works
