const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// P1.19 PR 8 on 01-building.md.
//
// Highest-stakes generation prompt in the loop — the factory's main
// builder, invoked for every story. Carries THREE load-bearing safety
// blocks where emphatic register ("CRITICAL", "NEVER", "Do NOT") is
// intentionally preserved because each is tied to a specific
// destroyed-production or integrity incident. Modernization softens
// stylistic emphasis elsewhere while keeping the three blocks intact:
//
//   1. ISOLATION RULES (destroyed mtgordle — force-push / resource adoption)
//   2. Capability Avoidance / target-capability-mismatch ("Do NOT substitute",
//      "Do NOT add /api/* routes" on static-export targets)
//   3. "Do NOT delete failing tests. That is fraud." (integrity rule)

const BUILD_PATH = path.join(__dirname, '..', '..', 'src', 'prompts', 'loop', '01-building.md');
const BUILD = fs.readFileSync(BUILD_PATH, 'utf8');

describe('01-building.md behavioral contract', () => {
  test('writes story_result (the field the launcher advances state on)', () => {
    assert.ok(BUILD.includes('story_result'), 'missing story_result — the launcher reads this');
  });

  test('story_result carries every field the launcher reads', () => {
    // rouge-loop.js reads result.outcome / files_changed / env_limitations /
    // classification / blocked_by / escalation.{tier,classification,summary}.
    for (const field of ['outcome', 'files_changed', 'tests_added', 'tests_passing', 'env_limitations', 'classification', 'blocked_by', 'escalation']) {
      assert.ok(BUILD.includes(field), `missing story_result field: ${field}`);
    }
  });

  test('outcome enum is pass | fail | blocked (the three the launcher branches on)', () => {
    // rouge-loop.js: outcome === 'pass' / 'blocked' / 'fail' each take a
    // different state-transition path. Drifting the enum breaks routing.
    assert.ok(/`pass`|"pass"/.test(BUILD));
    assert.ok(/`fail`|"fail"/.test(BUILD));
    assert.ok(/`blocked`|"blocked"/.test(BUILD));
  });

  test('writes the full output bundle expected by the orchestrator', () => {
    for (const field of ['deployment_url', 'implemented', 'skipped', 'divergences', 'factory_decisions', 'factory_questions']) {
      assert.ok(BUILD.includes(field), `missing required output field: ${field}`);
    }
  });

  test('reads story_context.json with the full input shape', () => {
    assert.ok(BUILD.includes('story_context.json'));
    // context-assembly.js populates these — the prompt must name them
    // explicitly so subagents build from the right slice.
    for (const field of ['story.spec', 'story.fix_memory', 'story.attempt_number', 'foundation', 'related_stories', 'milestone_learnings', 'library_heuristics']) {
      assert.ok(BUILD.includes(field), `missing story_context input field: ${field}`);
    }
  });

  test('preserves TDD red-green-refactor rhythm', () => {
    assert.ok(/red.*green.*refactor|Red.*Green.*Refactor/i.test(BUILD));
    assert.ok(/### Red: Write the Failing Test First/.test(BUILD));
    assert.ok(/### Green: Write Minimal Code to Pass/.test(BUILD));
    assert.ok(/### Refactor: Clean Up While Green/.test(BUILD));
  });

  test('preserves four subagent-status handling verbs', () => {
    for (const status of ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']) {
      assert.ok(BUILD.includes(status), `missing subagent status: ${status}`);
    }
  });

  test('preserves two-stage review (spec compliance + code quality)', () => {
    assert.ok(/Stage 1.*Spec Compliance|Spec Compliance.*Stage 1/is.test(BUILD));
    assert.ok(/Stage 2.*Code Quality|Code Quality.*Stage 2/is.test(BUILD));
  });

  test('preserves pending-action.json intent path + deploy-staging params', () => {
    // rouge-loop.js reads pending-action.json and dispatches to handlers —
    // the prompt must keep naming the action + the result file.
    assert.ok(BUILD.includes('pending-action.json'));
    assert.ok(BUILD.includes('action-result.json'));
    assert.ok(/"action":\s*"deploy-staging"/.test(BUILD));
  });

  test('preserves Tier-0 self-diagnosis classifications (feeds fix_memory)', () => {
    // If the taxonomy changes, fix_memory becomes uninterpretable across
    // cycles and triage.js loses its infrastructure-gap signal.
    for (const cls of ['implementation-bug', 'design-problem', 'infrastructure-gap', 'environment-limitation', 'prompt-limitation']) {
      assert.ok(BUILD.includes(cls), `missing Tier-0 classification: ${cls}`);
    }
  });

  test('preserves ISOLATION RULES block (destroyed-mtgordle context, load-bearing safety)', () => {
    // Emphatic register is preserved by design — these rules exist because
    // a force-push destroyed a shipped product's infrastructure.
    assert.ok(/## CRITICAL: ISOLATION RULES \(NEVER VIOLATE\)/.test(BUILD),
      'ISOLATION RULES heading stays emphatic');
    assert.ok(/destroyed a shipped product's infrastructure|destroyed mtgordle's history/i.test(BUILD),
      'incident context stays on-site with the rules');
    assert.ok(/NEVER read files outside this project directory/.test(BUILD));
    assert.ok(/NEVER adopt existing Vercel, Supabase, or GitHub resources/.test(BUILD));
    assert.ok(/ALWAYS create NEW infrastructure/.test(BUILD));
    assert.ok(/NEVER run `git push --force`/.test(BUILD));
  });

  test('preserves "Do NOT delete failing tests. That is fraud." integrity rule', () => {
    assert.ok(/Do NOT delete failing tests.*That is fraud/.test(BUILD),
      'test-deletion integrity rule stays emphatic');
  });

  test('preserves Capability Avoidance rules (Do NOT substitute / static-export target-capability-mismatch)', () => {
    // "Do NOT substitute" (integration-escalation path) is the same class
    // of rule as foundation-building's HARD BLOCK / Capability Avoidance
    // Problem — silent-degradation prevention. Keep emphatic.
    assert.ok(/Do NOT substitute/.test(BUILD),
      'anti-substitution rule stays emphatic — Capability Avoidance class');
    // Static-export target-capability-mismatch: building a server route on
    // a static-export target produces a silently-broken artefact.
    assert.ok(/Do NOT add `\/api\/\*` routes/.test(BUILD),
      'static-export capability-mismatch rule stays emphatic');
    assert.ok(/target-capability-mismatch/.test(BUILD));
  });

  test('preserves staging-only / production-out-of-scope guarantee', () => {
    // Load-bearing: the Builder is the Factory, not the Shipper.
    assert.ok(/Never deploy to production/.test(BUILD));
    assert.ok(/Staging only|staging only/.test(BUILD));
    assert.ok(/You are the Factory, not the Shipper/.test(BUILD));
  });

  test('preserves factory_decisions APPEND-ONLY invariant', () => {
    // Append-only is a data-integrity invariant that spans cycles — if the
    // builder overwrites, prior decisions are lost and the Analyzer's
    // root-cause analysis breaks.
    assert.ok(/APPEND ONLY|Append new factory_decisions|ALWAYS APPEND|always append|never overwrite/i.test(BUILD),
      'append-only invariant must be stated');
  });

  test('preserves spin-detection alignment: one story per invocation', () => {
    // Spin detector in safety.js reads story_results; building more than
    // one story per invocation breaks its granularity.
    assert.ok(/ONE STORY per invocation|one story per invocation/i.test(BUILD));
  });

  test('keeps anti-patterns list as a named-failure-modes list (legitimately negative)', () => {
    assert.ok(/## Anti-Patterns/.test(BUILD));
    for (const ap of ["I'll add tests later", 'good enough for now', 'skip the refactor', 'Mega-commits', 'Deploying to production']) {
      assert.ok(BUILD.includes(ap), `missing anti-pattern: ${ap}`);
    }
  });
});

describe('01-building.md Opus 4.7 modernization', () => {
  test('no "think step by step" scaffolding', () => {
    assert.ok(!/think step by step/i.test(BUILD));
  });

  test('no "reason carefully" scaffolding', () => {
    assert.ok(!/reason carefully/i.test(BUILD));
  });

  test('no "IMPORTANT:" / "URGENT:" / "YOU MUST" emphatic prefixes', () => {
    assert.ok(!/\bIMPORTANT:/.test(BUILD), 'IMPORTANT: removed');
    assert.ok(!/\bURGENT:/.test(BUILD), 'URGENT: removed');
    assert.ok(!/YOU MUST/.test(BUILD), 'YOU MUST removed');
  });

  test('no "CRITICAL:" prefix outside the preserved ISOLATION RULES heading', () => {
    // Count occurrences — only one survives, and it's the heading on line 7.
    const hits = BUILD.match(/\bCRITICAL:/g) || [];
    assert.equal(hits.length, 1, 'CRITICAL: should only appear in the ISOLATION RULES heading');
    assert.ok(/## CRITICAL: ISOLATION RULES/.test(BUILD));
  });

  test('stylistic "do NOT" emphasis softened — only preserved-by-design instances remain', () => {
    // Four expected survivors, all tied to specific incidents or rules:
    //   1. ISOLATION RULE 2 ("do NOT link to it" — destroyed mtgordle)
    //   2. integration-escalation ("Do NOT substitute" — Capability Avoidance)
    //   3. static-export ("Do NOT add /api/* routes" — target-capability-mismatch)
    //   4. integrity rule ("Do NOT delete failing tests. That is fraud.")
    // Case-sensitive: match only emphatic "do NOT" / "Do NOT" / "DO NOT"
    // (uppercase NOT); ordinary prose "do not" is fine and not counted.
    const hits = BUILD.match(/\b[dD]o NOT\b/g) || [];
    assert.equal(hits.length, 4, `expected exactly 4 preserved-by-design "do NOT" emphases, found ${hits.length}`);
  });

  test('branch-creation "Do NOT" reframed to positive directive', () => {
    assert.ok(!/Do NOT create a new branch/.test(BUILD),
      'branch instruction should be softened');
    assert.ok(/launcher has already checked out/.test(BUILD));
  });

  test('Supabase-default line reframed to provider-agnostic', () => {
    assert.ok(!/Do NOT assume Supabase/.test(BUILD));
    assert.ok(/Each project names its own provider|each project names its own provider/.test(BUILD));
  });

  test('Step 10 exit items reframed to positive directives', () => {
    // Three "Do NOT" exit items became positive framings.
    assert.ok(/Write only to `cycle_context\.json` for state/.test(BUILD),
      'Step 10 item 4 should be positive — launcher owns state.json');
    assert.ok(/Skip PR creation|PR creation.*ship-promote/.test(BUILD),
      'Step 10 item 5 should be positive — ship-promote creates PRs');
    assert.ok(/Report results;|Runner chooses the next phase/.test(BUILD),
      'Step 10 item 6 should be positive — Runner chooses next phase');
  });

  test('TDD "this is not optional / not a suggestion" one-liner softened', () => {
    assert.ok(!/This is not optional\. This is not a suggestion\./.test(BUILD),
      'the triple-negative TDD opener should be softened');
    // Positive reframing: TDD is the build order.
    assert.ok(/red, green, refactor/i.test(BUILD));
    assert.ok(/it's the build order|TDD rhythm/i.test(BUILD));
  });

  test('refactor-step directive softened from "not optional" to positive', () => {
    assert.ok(!/\*\*The refactor step is not optional\.\*\*/.test(BUILD),
      'refactor-step emphatic negation should be reframed');
    assert.ok(/Refactor every task you complete|Fix it now, not later/.test(BUILD));
  });

  test('subagent TDD directive softened (removed "non-negotiable")', () => {
    assert.ok(!/non-negotiable/.test(BUILD));
  });

  test('two-stage review directive softened ("good enough" line)', () => {
    assert.ok(!/Do not accept "good enough\."/.test(BUILD));
    assert.ok(/Hold the bar/.test(BUILD));
  });

  test('has a positive-framed Story Scope Boundary section', () => {
    assert.ok(/## Story Scope Boundary/.test(BUILD),
      'modernization adds the scope-boundary framing used in other P1.19 PRs');
    // A few load-bearing boundary points must appear inside it.
    const boundarySection = BUILD.split('## Story Scope Boundary')[1].split('##')[0];
    assert.ok(/story_context\.story\.id/.test(boundarySection),
      'scope boundary should name the single-story invocation contract');
    assert.ok(/ship-promote|production promotion/.test(boundarySection),
      'scope boundary should cede production promotion to ship-promote');
    assert.ok(/launcher/.test(boundarySection),
      'scope boundary should cede phase routing + state to the launcher');
  });
});
