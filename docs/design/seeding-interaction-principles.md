# Seeding interaction principles

**Status**: proposed (2026-04-18). Draft to align on before rewriting discipline prompts.

Each seeding discipline is a conversation with the human, not a technical process the human watches. These principles shape how prompts stage interaction so the human is asked to decide when their judgment is load-bearing, and stays out of the way when it isn't.

The practical symptom that triggered this doc: the SPEC discipline in colour-contrast emitted **29 chat messages** for one discipline — most of them technical metadata ("FA3 spec: 23 ACs, 3 journeys"), two auto-continuation prompts, and a final gate the user had to answer after ~15 minutes of file-level telemetry. The decision ("is this the right decomposition?") landed last, after all the expensive work was already done.

## Principles

### 1. Stage gates at decision boundaries, not file boundaries

Hard gates fire when the human needs to make a call the autonomous path can't make safely. Not when Rouge has finished writing a file. A file landing on disk is an artifact of work; a decision point is a fork in the road. Only forks deserve gates.

### 2. Make the big decisions cheap

The biggest decision in a discipline should happen **before** the expensive work. If Rouge can spend 10 minutes writing eight detailed specs that the human might reject in favour of a different decomposition, something is staged wrong. Elevate the shape question; fill in detail after it's locked.

### 3. At most two visible gates per discipline, ideally one

Each gate is an interruption. Two is the ceiling for a discipline that fits into a 10-20 minute seeding conversation. One is better. If the discipline seems to need three, two of them are really the same decision dressed up differently.

### 4. Structured output belongs in tabs, not chat

Chat is conversational — narrative, questions, answers. The detailed spec / infrastructure manifest / design YAMLs are structured artifacts; they live in their tab. Chat messages about those artifacts should be one-line narrative with a pointer to the tab for detail. A chat bubble per file written reduces signal to noise.

### 5. Autonomous decisions are disclosed, not discussed

When Rouge makes a call on its own (tier assignment, file path layout, NFR within a band), that's a `[DECISION:]` the user can scroll back to audit — but it's a quiet marker, not a prompt for a response. If Rouge is unsure enough to need the human's input, promote it to `[GATE:]`. There's no middle ground.

### 6. Heartbeats communicate progress, not ceremony

A heartbeat that says "Ending turn — next turn writes FA7" is mechanical filler. A heartbeat that says "Writing specs — 4 of 8 done" is a progress signal. Drop the former; keep the latter. Auto-continuation prompts ("Budget reached — send any message to continue") are filler in the same bucket; the handler should auto-continue quietly when mid-discipline.

### 7. Match the abstraction of the output to the abstraction of the decision

If the gate is "is this decomposition right?", surface milestone names and one-line intents — not AC counts and tier assignments. If the gate is "is this positioning right?", surface the one-line pitch — not the full landing-page copy. The human reads what they need to decide; the tab holds the rest.

## Open questions

These are real tensions this doc can't resolve alone — they need explicit calls before the discipline rewrites land.

### Q1. Does "shape" (complexity profile) belong in spec or infrastructure?

The SPEC discipline currently owns a complexity-profile gate (`single-page` / `multi-route` / `stateful` / `api-first` / `full-stack`). INFRASTRUCTURE is the next discipline and consumes that profile to pick deploy target, DB, etc.

Three options:
- **A.** Keep shape in spec. Spec defines the technical envelope; infrastructure fills it in. Argument: profile is a product-shape decision, not an infra one — it affects what the spec itself looks like.
- **B.** Move shape into infrastructure. Spec sticks to *what to build*; infrastructure owns *how to build it*. Argument: human is asked about the same decision twice today (shape in spec, hosting in infra) — collapse.
- **C.** Keep in spec but drop the explicit gate. Let Rouge infer from the spec + ask only if ambiguous. Argument: if the vision is clear, the profile is usually obvious.

### Q2. How much visibility during quiet deep work?

Principle 4 says deep work should be quiet. But going fully silent for 10 minutes while Rouge writes 8 FA specs feels wrong — the human loses signal on whether anything is stuck.

Options:
- **A.** One heartbeat per ~3 FAs: "Writing specs — 4 of 8 done." Nothing else. User sees slow progress, doesn't get pinged on every file.
- **B.** A dashboard-side progress indicator (bar or similar) that reads from the `[WROTE:]` stream, with chat staying quiet. Chat gets the rollup at the end. Best-of-both.
- **C.** Stream autonomous decisions as quiet markers (collapsed by default, expand to see the log). Chat gets the rollup; audit trail is one click away.

### Q3. What about the disciplines where "deep work" is genuinely thin?

BRAINSTORMING and TASTE are mostly conversational — short bursts of questions and choices, no long autonomous stretches. SPEC and DESIGN are the bulk disciplines. INFRASTRUCTURE is medium. MARKETING is thin.

Principle 3 (at most two gates) applies uniformly — but the shape of the beats between gates differs by discipline. A discipline audit doc (next deliverable) maps each one explicitly.

## What this doc does NOT decide

- Specific gate wording per discipline.
- Exactly which markers move from chat to tab.
- Whether to merge any disciplines (the Q1 shape question is adjacent to this).

Those land in the discipline audit + the prompt rewrites that follow.
