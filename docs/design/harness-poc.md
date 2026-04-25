# Harness PoC (P5.9)

**Status:** PoC landed 2026-04-25. Not in production yet — opt-in via the
`harness:probe` CLI for validation; no phase wired to use it by default.

## Why a harness PoC

Rouge's only Claude-invocation surface today is `claude -p` spawned as a
subprocess from `rouge-loop.js`:

```js
const child = spawn('claude', [
  '-p', promptInstruction,
  '--dangerously-skip-permissions',
  '--model', model,
  '--max-turns', '200',
  '--output-format', 'stream-json',
  '--verbose',
  ...
]);
```

That works well for tool-using phases (build, fix, deploy) where the
Claude Code agentic loop is the value — Read / Edit / Bash / TodoWrite
all come for free, sandboxed correctly. But it blocks features that
only the SDK exposes:

| Feature | Blocked by `claude -p`? | Impact |
|---|---|---|
| **Prompt caching** (cache_control on system blocks) | Yes — no flag for it | Every cycle re-pays full input cost on the system prompt. ~80-90% savings on the cached portion. |
| **Structured output** (forced tool-call schema) | Yes — no flag for it | Today's prompts ask for JSON in their output and we regex-extract. Fails silently on malformed responses. |
| **Citations API** | Yes — not surfaced via stream-json | Judge prompts can't get cited evidence spans for free. |
| **Batch API** (50% off, async) | Yes — `claude -p` is sync | Bulk eval-calibration / retro analysis can't run cheaper async. |
| **MCP servers per-spawn** | Yes — MCPs come from global `.claude/settings.json` | Can't inject project-specific MCPs. |
| **Multi-Claude orchestration** | Partial — would need parallel subprocesses | One subprocess at a time. |
| **Cost forecasting** | Partial — token counts only at result time | Can't estimate before running. |

The "21% of the roadmap blocked on harness" figure comes from these
seven items.

## What this PoC ships

A drop-in **single-shot SDK adapter** for non-tool-using phases. Concretely:

- `src/launcher/harness/sdk-adapter.js` — `runPhaseViaSdk({prompt, system,
  schema, ...})` returning `{result, response, usage}`. ~200 lines.
- `test/launcher/harness/sdk-adapter.test.js` — 29 unit tests with a
  mocked `messages.create`. CI-safe (no real API key needed).
- `rouge harness probe` CLI — one-time human-runnable end-to-end probe
  against the real API. ~$0.01 cost, validates cache_control + structured
  output work in production.

Two of the seven blocked features are demonstrated end-to-end:

1. **Prompt caching** — system prompts are wrapped in
   `[{type: 'text', text, cache_control: {type: 'ephemeral'}}]` by
   default. The `harness probe` CLI prints `cache_creation_input_tokens`
   and `cache_read_input_tokens` so the operator can see the cache
   working across two invocations within the 5-minute TTL.

2. **Structured output** — when callers pass `schema:`, the adapter
   builds a tool definition with that schema as `input_schema` and
   forces it via `tool_choice: {type: 'tool', name: ...}`. The model's
   response always contains a `tool_use` block whose `.input` is the
   structured payload. Replaces today's regex-based JSON extraction
   with schema-validated parsing.

## What this PoC doesn't ship

Out of scope for this PR — explicitly. Each is its own sub-PoC if/when
the value justifies it.

- **Tool-using phase migration** — build / fix / deploy / qa-fixing
  rely on the Claude Code agentic loop with sandboxed Read/Edit/Bash.
  The Claude Agent SDK is the right path for those when needed; not
  attempted here. Today's `claude -p` continues to handle them.
- **MCP servers per-spawn** — needs the Agent SDK or a wrapper that
  injects MCP config. Separate PoC.
- **Batch API** — fundamentally async; needs a queue + completion
  webhook + result-merge step. Separate PoC.
- **Citations API** — depends on document-attachment in messages.
  Trivial extension to the adapter when needed (just pass
  `documents:`); not in this PoC.
- **Cost forecasting** — `messages.count_tokens` (separate endpoint)
  gives pre-flight token counts. Not wired in this PoC.

## How to migrate a phase to the SDK adapter

Two prerequisites for any phase to be SDK-eligible:

1. **It doesn't use Claude Code's tools** — no Read, Edit, Bash,
   TodoWrite, etc. inside its prompt. Pure context-in / structured-out.
2. **Its output is JSON-shaped** — defined by a schema we can express.

The candidates today (in increasing migration order, smallest blast
radius first):

| Phase | Output | Why it's a good first migration |
|---|---|---|
| `10-final-review.md` | `final_review_report` | Single JSON object with 11 fields. No tool use needed. Simplest phase to migrate. |
| `06-vision-check.md` | `vision_check_results` | Same shape — read context, emit verdict. |
| `09-cycle-retrospective.md` | `structured_retro` + `amendments_proposed` | More fields but still pure context-in. |
| `02e-evaluation.md` | `evaluation_report` (huge) | Heaviest. Best caching savings (the system block is enormous). |

For each phase, the migration sketch:

```js
const { runPhaseViaSdk } = require('./harness/sdk-adapter.js');
const phaseSchema = require('../../schemas/final-review-report.json');

const out = await runPhaseViaSdk({
  prompt: cycleContextSummary,            // the user message
  system: fs.readFileSync(promptPath, 'utf8'),  // the prompt file → cached
  schema: phaseSchema,
  toolName: 'emit_final_review_report',
  model: 'claude-opus-4-7',  // judge phases stay on Opus
});
// out.result is the structured payload, ready to write to cycle_context.json
```

The launcher's existing phase-events writer can be replaced by a simple
`response.usage` log; the dashboard would lose the streaming-token feed
for SDK-driven phases (acceptable for short prompts that complete in
seconds rather than minutes).

## Migration gating

Don't migrate a phase to the SDK adapter unless:

- Its tests assert the output shape (so a wire-format change is caught)
- Its prompt was modernized in P1.19 (so the system block is well-shaped
  for caching — see the modernization pattern's "Scope Boundary" plus
  rubric structure)
- A flag exists to flip back to `claude -p` if something breaks (rollout
  safety)

## Cost model

Caching wins are biggest on phases with large stable system prompts.
For Rouge's modernized prompts:

| Phase | System size (chars) | Estimated input tokens | Per-cycle cache savings (Opus 4.7 input @ $5/MTok) |
|---|---|---|---|
| `02e-evaluation.md` | ~25k | ~6500 | ~$0.026/cycle when re-run within TTL |
| `10-final-review.md` | ~7k | ~1800 | ~$0.007/cycle |
| `09-cycle-retrospective.md` | ~12k | ~3000 | ~$0.012/cycle |

Across 1000 cycles per month, the caching savings on 02e alone is ~$26/mo
— small in absolute dollars but ~80% reduction on the cached portion of
the bill. The bigger win is structured output: today's regex-extraction
failures cost a full re-run when the JSON parser hits a malformed
response. Schema-forced output eliminates that failure mode entirely.

## Validating the PoC

Run the probe CLI against a real API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node src/launcher/rouge-cli.js harness probe
```

Expected output: structured `final_review_report`-shaped JSON, plus
usage metrics with `cache_creation_input_tokens > 0` on the first call.
Run a second time within 5 minutes to see `cache_read_input_tokens > 0`
on the second call (cache HIT). Cost: ~$0.01 per run.

## Next steps

When ready to expand:

1. **Migrate `10-final-review` first** — smallest phase, simplest
   schema, lowest blast radius. Add a `harness: 'sdk' | 'cli'` config
   in `rouge.config.json` per phase, default `cli`. Flip `final-review`
   to `sdk`. Run a few real cycles. Compare token spend with vs without.
2. **Migrate the rest of the judge prompts** — once final-review proves
   stable, do `06-vision-check`, `09-cycle-retrospective`, `02e-evaluation`
   in that order. The judgment layer doesn't use tools.
3. **Wire MCP loading via Agent SDK** — separate sub-PoC. Tool-using
   phases (build, fix, deploy) need this when MCPs become valuable
   enough to justify the complexity.
4. **Wire the Batch API** — separate sub-PoC. Eval-calibration is the
   first natural candidate (it's already async-friendly).
5. **Cost forecasting** — small extension; call `messages.count_tokens`
   before running to estimate the bill.

Each step should ship behind its own flag so rollback is one config
change, not a code rollback.
