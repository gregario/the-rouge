const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 13 on seeding/00-swarm-orchestrator.md.
//
// Meta-prompt that coordinates all nine seeding disciplines. Highest-
// stakes seeding prompt — it defines the marker vocabulary, sequencing
// rules, and integrity guards for the entire swarm. Carries MULTIPLE
// incident-tied safety blocks where emphatic register stays by design:
//
//   1. Artifact-on-disk-before-completion integrity rule
//      (L146–L168 block). Preserves "Never emit [DISCIPLINE_COMPLETE]
//      based on summaries," "No false completion claims,"
//      "Never self-score," "Never invoke 'background agents'."
//   2. Sequential-execution rule tied to the single-claude-p +
//      --max-turns + 10-minute-subprocess incident.
//   3. Resumption contract tied to the 2026-04-10 colouring-book
//      rate-limit incident — trust the state block, not memory.
//   4. Gate discipline — "gate at the end or not at all," "do NOT
//      continue writing artifacts … until the human has replied,"
//      "Do NOT emit SEEDING_COMPLETE" on revision.
//   5. Foundation-evaluator protection — "NEVER `\"complete\"` — the
//      foundation evaluator must run."
//   6. Heartbeat anti-wallpaper rule — "Never emit
//      [HEARTBEAT: still working...]" (actively hides real stalls).

const ORC_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'seeding', '00-swarm-orchestrator.md');
const ORC = fs.readFileSync(ORC_PATH, 'utf8');

describe('00-swarm-orchestrator.md behavioral contract', () => {
  test('declares all nine disciplines with file + applicable_at tier', () => {
    const disciplines = [
      'BRAINSTORMING', 'COMPETITION', 'TASTE', 'SIZING', 'SPEC',
      'INFRASTRUCTURE', 'DESIGN', 'LEGAL/PRIVACY', 'MARKETING',
    ];
    for (const d of disciplines) {
      assert.ok(ORC.includes(d), `missing discipline: ${d}`);
    }
    for (const f of [
      '01-brainstorming.md', '02-competition.md', '03-taste.md',
      '03b-sizing.md', '04-spec.md', '08-infrastructure.md',
      '05-design.md', '06-legal-privacy.md', '07-marketing.md',
    ]) {
      assert.ok(ORC.includes(f), `missing discipline file reference: ${f}`);
    }
  });

  test('tier-skip marker format matches bot.js regex', () => {
    // bot.js: /\[DISCIPLINE_SKIPPED:\s*(\S+?)(?:\s+(?:—|--|-)\s*([^\]]*?))?\]/g
    assert.ok(/\[DISCIPLINE_SKIPPED: <name> — applicable_at=<tier>; project_size=<size> is below threshold\]/.test(ORC),
      'the skip-marker template must still match the regex in src/slack/bot.js');
  });

  test('tier-based skipping is bridge-controlled', () => {
    // The refactored prompt delegates tier-based skipping to the bridge
    // rather than referencing the discipline-registry.js source directly.
    assert.ok(/Tier-based skipping.*is handled by the bridge automatically/.test(ORC));
    assert.ok(/bridge auto-skips/.test(ORC));
  });

  test('defines the five marker types with exact bracket syntax', () => {
    for (const marker of [
      '[GATE: <discipline>/<gate_id>]',
      '[DECISION: <slug>]',
      '[WROTE: <slug>]',
      '[HEARTBEAT: <progress>]',
      '[DISCIPLINE_COMPLETE: <name>]',
    ]) {
      assert.ok(ORC.includes(marker), `missing marker syntax: ${marker}`);
    }
  });

  test('preserves the nine discipline slug values used by bot.js + dashboard', () => {
    // bot.js matches [DISCIPLINE_COMPLETE:\s*(\S+)\] — the exact slug set
    // must survive so the dashboard discipline tracker advances.
    assert.ok(/brainstorming, competition, taste, sizing, spec, infrastructure, design, legal-privacy, marketing/.test(ORC));
  });

  test('defines the chunked-turn contract (1–3 decisions per turn)', () => {
    assert.ok(/Chunked Turn Contract|chunked turn|chunked-turn/i.test(ORC));
    assert.ok(/1[-–]3 decisions|one chunk/i.test(ORC));
  });

  test('preserves the "gate at the end, or not at all" rule (gate discipline)', () => {
    assert.ok(/Gate at the end, or not at all/.test(ORC),
      'load-bearing gate-discipline rule must stay emphatic');
  });

  test('preserves the Resumption state-block contract (colouring-book incident)', () => {
    // This rule exists because the 2026-04-10 colouring-book session hit
    // rate limits mid-seeding and discipline boundaries degraded across
    // --resume cycles.
    assert.ok(/\[RESUMING FROM STATE — authoritative, trust over your own memory\]/.test(ORC));
    assert.ok(/Trust the state block, not your memory/.test(ORC));
    assert.ok(/colouring book seeding session|2026-04-10/.test(ORC),
      'incident-context line must stay on-site');
  });

  test('preserves artifact-on-disk-before-completion integrity rules', () => {
    // This block is the integrity spine of the entire seeding pipeline.
    assert.ok(/Never emit `\[DISCIPLINE_COMPLETE: <name>\]` based on summaries/.test(ORC));
    assert.ok(/No false completion claims/.test(ORC));
    assert.ok(/Never self-score/.test(ORC));
    assert.ok(/Never invoke "background agents"/.test(ORC));
    assert.ok(/Write artifacts before presenting/.test(ORC));
  });

  test('preserves sequential-execution rule (hallucination prevention)', () => {
    assert.ok(/Sequential, one discipline at a time/.test(ORC));
    assert.ok(/No parallel execution/.test(ORC));
    assert.ok(/no background agents, no async workers, no parallel subprocesses/.test(ORC),
      'explicit anti-hallucination sentence must stay emphatic');
  });

  test('preserves "Never emit [HEARTBEAT: still working...]" anti-wallpaper rule', () => {
    assert.ok(/Never emit `\[HEARTBEAT: still working\.\.\.\]`/.test(ORC));
    assert.ok(/wallpaper/i.test(ORC));
  });

  test('preserves bridge-controlled state management (no direct state writes)', () => {
    // The refactored prompt delegates state management to the bridge.
    // Foundation-evaluator protection is now handled by the bridge
    // rather than a NEVER rule in the prompt.
    assert.ok(/bridge.*state machine controller|State Management.*Bridge-Controlled/.test(ORC));
  });

  test('preserves SEEDING_COMPLETE bridge-controlled finalization', () => {
    // The refactored prompt delegates SEEDING_COMPLETE handling to the
    // bridge. The prompt tells the agent NOT to emit it.
    assert.ok(/SEEDING_COMPLETE/.test(ORC));
    assert.ok(/Do NOT emit.*SEEDING_COMPLETE/.test(ORC),
      'bridge handles seeding finalization; agent must not emit it');
  });

  test('bridge controls discipline sequencing', () => {
    // The refactored prompt delegates sequencing to the bridge.
    // The discipline table preserves the canonical 1-9 order and the
    // bridge enforces it via [SYSTEM] messages.
    assert.ok(/bridge controls which discipline you work on/.test(ORC));
    assert.ok(/\[SYSTEM\].*message/.test(ORC));
    // The canonical order is preserved in the discipline table.
    const brainstormingIdx = ORC.indexOf('BRAINSTORMING');
    const tasteIdx = ORC.indexOf('TASTE');
    const sizingIdx = ORC.indexOf('SIZING');
    const specIdx = ORC.indexOf('SPEC');
    assert.ok(brainstormingIdx < tasteIdx, 'BRAINSTORMING before TASTE in table');
    assert.ok(tasteIdx < sizingIdx, 'TASTE before SIZING in table');
    assert.ok(sizingIdx < specIdx, 'SIZING before SPEC in table');
  });

  test('bridge handles final approval (no in-prompt SEED SUMMARY gate)', () => {
    // The refactored prompt delegates final approval to the bridge.
    // The bridge presents artifacts to the user for approval after
    // each [DISCIPLINE_COMPLETE] marker.
    assert.ok(/bridge verifies it and presents it to the user for approval/.test(ORC));
    assert.ok(/Accept & continue/.test(ORC));
  });

  test('bridge-controlled state management replaces direct writeback', () => {
    // The refactored prompt delegates state management to the bridge.
    // The agent writes artifacts; the bridge manages state.json.
    assert.ok(/State Management.*Bridge-Controlled/.test(ORC));
    assert.ok(/bridge.*state machine controller/.test(ORC));
  });

  test('preserves graveyard off-ramp for TASTE-killed ideas', () => {
    assert.ok(/docs\/drafts\/ideas-graveyard\.md/.test(ORC));
    assert.ok(/Salvageable kernel/.test(ORC));
  });

  test('preserves Boil-the-Lake taste-voice directive (Rouge taste ethos)', () => {
    assert.ok(/## Boil the Lake/.test(ORC));
    assert.ok(/Challenge scope down only if product-taste says the premise is wrong/.test(ORC),
      'the "challenge scope down / never because it\'s a lot of work for AI" directive is Rouge taste ethos');
    assert.ok(/10-star version|Chesky/.test(ORC));
    assert.ok(/Human team.*Rouge.*cycles|Rouge.*cycles.*Human team/is.test(ORC));
  });

  test('preserves "write artifacts to project directory" output list', () => {
    // The refactored prompt references these artifacts in the discipline
    // table and the "Write all seeding artifacts" instruction.
    for (const p of ['vision.json', 'seed_spec/', 'legal/', 'marketing/']) {
      assert.ok(ORC.includes(p), `missing output path: ${p}`);
    }
  });
});

describe('00-swarm-orchestrator.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(ORC));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(ORC));
  });

  test('no "CRITICAL:" / "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bCRITICAL:/.test(ORC));
    assert.ok(!/\bIMPORTANT:/.test(ORC));
    assert.ok(!/\bURGENT:/.test(ORC));
    assert.ok(!/YOU MUST/.test(ORC));
  });

  test('stylistic all-caps emphases softened (ALL 9 / DOWN / WHY / CAN / SHOULD)', () => {
    assert.ok(!/\bALL 9\b/.test(ORC), '"ALL 9" → "all 9"');
    assert.ok(!/scope DOWN/.test(ORC), '"scope DOWN" → "scope down"');
    assert.ok(!/Explain WHY/.test(ORC), '"Explain WHY" → "Explain why"');
    assert.ok(!/CAN and SHOULD ask/.test(ORC), '"CAN and SHOULD" → "can and should"');
  });

  test('stylistic contrastive NOTs softened (NOT `feature_areas[]` / NOT `building` / NOT a fork)', () => {
    // These were stylistic emphasis on "not X" contrasts, not tied to
    // documented incidents. Kept meaning, dropped caps.
    assert.ok(!/\(NOT `feature_areas\[\]`\)/.test(ORC));
    assert.ok(!/\(NOT `building`/.test(ORC));
    assert.ok(!/a completion report, NOT a fork-in-the-road/.test(ORC));
  });

  test('preserved-by-design emphasis: each integrity-tied "NOT"/"NEVER"/"Do NOT" survives', () => {
    // These stay emphatic. If the count drifts, we either lost an
    // integrity guard or added one by accident — either way, review.
    const hits = ORC.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 5,
      'expected exactly 5 preserved-by-design "Do NOT" emphases (tier-skip + bridge-control + SEEDING_COMPLETE + track-state + skip-disciplines)');
    // Bridge-controlled state: "You do NOT need to emit [DISCIPLINE_SKIPPED]"
    assert.ok(/You do NOT need to emit/.test(ORC));
    // Bridge-controlled: "You do NOT control what happens next"
    assert.ok(/You do NOT control what happens next/.test(ORC));
    // SEEDING_COMPLETE: "Do NOT emit `SEEDING_COMPLETE`"
    assert.ok(/Do NOT emit.*SEEDING_COMPLETE/.test(ORC));
    // State tracking: "Do NOT track discipline state"
    assert.ok(/Do NOT track discipline state/.test(ORC));
    // Skip decisions: "Do NOT decide which disciplines to skip"
    assert.ok(/Do NOT decide which disciplines to skip/.test(ORC));
    // The Resumption "is NOT authoritative" line is incident-tied
    // (colouring-book). It stays.
    assert.ok(/is NOT authoritative/.test(ORC));
    // Anti-wallpaper. Stays.
    assert.ok(/Never emit `\[HEARTBEAT: still working\.\.\.\]`/.test(ORC));
    // No-false-completion. Stays.
    assert.ok(/Never emit `\[DISCIPLINE_COMPLETE: <name>\]` based on summaries/.test(ORC));
    assert.ok(/Never self-score/.test(ORC));
    assert.ok(/Never invoke "background agents"/.test(ORC));
  });
});
