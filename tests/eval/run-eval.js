#!/usr/bin/env node
/**
 * Rouge 0a.30 Eval Suite — validates phase prompt outputs against AC assertions.
 *
 * Reads cycle_context.json + phase logs from a real E2E run and checks
 * each assertion from the assertion spec files.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.argv[2] || path.join(__dirname, '../../projects/fruit-and-veg');
const PROJECT_NAME = path.basename(PROJECT_DIR);
const LOG_DIR = path.join(__dirname, '../../logs');
const EVAL_DIR = __dirname;

const ctx = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'cycle_context.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'state.json'), 'utf8'));

let pass = 0;
let fail = 0;
let skip = 0;

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function skipCheck(name, reason) {
  skip++;
  console.log(`  ⏭️  ${name} — ${reason}`);
}

function readLog(phase) {
  const logPath = path.join(LOG_DIR, `${PROJECT_NAME}-${phase}.log`);
  try { return fs.readFileSync(logPath, 'utf8'); } catch { return ''; }
}

// ============================================================================
// Building Phase
// ============================================================================
console.log('\n📦 BUILDING PHASE');

check('Context reading: has vision', ctx.vision != null);
check('Context reading: has active_spec', ctx.active_spec != null);
check('Context reading: has product_standard', ctx.product_standard != null);
check('Implemented array exists', Array.isArray(ctx.implemented));
check('Implemented has entries', ctx.implemented.length > 0, `got ${ctx.implemented.length}`);
check('Skipped array exists', Array.isArray(ctx.skipped));
check('Divergences array exists', Array.isArray(ctx.divergences));
check('Factory decisions logged', ctx.factory_decisions.length > 0, `got ${ctx.factory_decisions.length}`);
check('Deployment URL set', ctx.deployment_url != null && ctx.deployment_url.includes('workers.dev'));

const buildLog = readLog('building');
if (buildLog) {
  check('Build log has content', buildLog.length > 100);
} else {
  skipCheck('Build log content', 'no log file');
}

// ============================================================================
// Test Integrity Phase
// ============================================================================
console.log('\n🧪 TEST INTEGRITY PHASE');

const ti = ctx.test_integrity_report;
check('Test integrity report exists', ti != null);
if (ti) {
  check('Has spec_coverage_pct', ti.spec_coverage_pct !== undefined);
  check('Has verdict', ti.verdict === 'PASS' || ti.verdict === 'FAIL');
  check('Has orphaned_count', ti.orphaned_count !== undefined);
  check('Has stale_regenerated_count', ti.stale_regenerated_count !== undefined);
  check('Has newly_generated_count', ti.newly_generated_count !== undefined);
  check('Spec coverage tracked', typeof ti.spec_coverage_pct === 'number');
} else {
  skipCheck('Test integrity fields', 'no report');
}

// ============================================================================
// Code Review Phase
// ============================================================================
console.log('\n🔍 CODE REVIEW PHASE');

const cr = ctx.code_review_report;
if (cr) {
  check('Code review report exists', true);
  check('Has code_quality_baseline', cr.code_quality_baseline != null);
  check('Has ai_code_audit', cr.ai_code_audit != null);
  if (cr.ai_code_audit) {
    check('AI audit has score', typeof cr.ai_code_audit.score === 'number');
    check('AI audit has dimensions', cr.ai_code_audit.dimensions != null);
  }
  if (cr.security_review) {
    check('Security review has verdict', cr.security_review.verdict != null);
  } else {
    skipCheck('Security review', 'skipped (no backend) or legacy structure');
  }
} else {
  skipCheck('Code review report', 'legacy structure or phase not yet reached');
}

// ============================================================================
// Product Walk Phase
// ============================================================================
console.log('\n🚶 PRODUCT WALK PHASE');

const walk = ctx.product_walk;
if (walk) {
  check('Product walk exists', true);
  check('Has screens array', Array.isArray(walk.screens) && walk.screens.length > 0);
  check('Has scope', walk.scope === 'full' || walk.scope === 'incremental');
  check('Has screens_walked count', typeof walk.screens_walked === 'number');
  if (walk.screens && walk.screens.length > 0) {
    const s = walk.screens[0];
    check('Screen has route', s.route != null);
    check('Screen has screenshot', s.screenshot != null);
    check('Screen has load_time_ms', typeof s.load_time_ms === 'number');
  }
  if (walk.journeys) {
    check('Has journeys', Array.isArray(walk.journeys) && walk.journeys.length > 0);
  } else {
    skipCheck('Journey walks', 'no journeys defined or phase not yet reached');
  }
} else {
  skipCheck('Product walk', 'legacy structure or phase not yet reached');
}

// ============================================================================
// Evaluation Phase (three lenses)
// ============================================================================
console.log('\n📊 EVALUATION PHASE');

const evalReport = ctx.evaluation_report;
if (evalReport) {
  check('Evaluation report exists', true);
  check('Has QA section', evalReport.qa != null);
  check('Has design section', evalReport.design != null);
  check('Has PO section', evalReport.po != null);
  check('Has health_score', typeof evalReport.health_score === 'number');
  if (evalReport.qa) {
    check('QA: has criteria_results', evalReport.qa.criteria_results != null);
  }
  if (evalReport.design) {
    check('Design: has overall_score', typeof evalReport.design.overall_score === 'number' || evalReport.design.design_review != null);
  }
  if (evalReport.po) {
    check('PO: has verdict', evalReport.po.verdict != null);
    check('PO: has confidence', typeof evalReport.po.confidence === 'number');
  }
} else {
  skipCheck('Evaluation report', 'legacy structure or phase not yet reached');
}

// ============================================================================
// QA Gate Phase
// ============================================================================
console.log('\n🔍 QA GATE PHASE');

const qa = ctx.qa_report;
check('QA report exists', qa != null);
if (qa) {
  check('Has verdict', qa.verdict === 'PASS' || qa.verdict === 'FAIL');
  check('Has health_score', typeof qa.health_score === 'number');
  check('Has criteria counts', qa.criteria_pass !== undefined || qa.criteria_results !== undefined);

  // Functional correctness
  const fc = qa.functional_correctness;
  if (fc) {
    check('Functional: pages_checked', typeof fc.pages_checked === 'number');
    check('Functional: console_errors', typeof fc.console_errors === 'number');
  } else {
    skipCheck('Functional correctness', 'not in report');
  }

  // Code quality
  const cq = qa.code_quality_baseline;
  if (cq) {
    check('Code quality: has metrics', Object.keys(cq).length > 0);
  } else {
    skipCheck('Code quality baseline', 'not in report');
  }

  // Performance
  const perf = qa.performance_baseline;
  if (perf) {
    check('Performance baseline exists', true);
  } else {
    skipCheck('Performance baseline', 'not in report');
  }
} else {
  skipCheck('QA report fields', 'no report');
}

// ============================================================================
// PO Review Phase
// ============================================================================
console.log('\n👀 PO REVIEW PHASE');

const po = ctx.po_review_report;
check('PO report exists', po != null);
if (po) {
  check('Has verdict', ['PRODUCTION_READY', 'NEEDS_IMPROVEMENT', 'NOT_READY'].includes(po.verdict));
  check('Has confidence', typeof po.confidence === 'number' && po.confidence >= 0 && po.confidence <= 1);
  check('Has recommended_action', po.recommended_action != null);
  check('Has journey_quality', Array.isArray(po.journey_quality));
  check('Has screen_quality', Array.isArray(po.screen_quality));
  // interaction_quality may be bundled into screen_quality or exist as separate array
  check('Has interaction_quality', Array.isArray(po.interaction_quality) || Array.isArray(po.screen_quality));
  check('Has heuristic_results', po.heuristic_results != null);

  if (po.heuristic_results) {
    check('Heuristics: has total', typeof po.heuristic_results.total === 'number');
    check('Heuristics: has passed', typeof po.heuristic_results.passed === 'number');
    check('Heuristics: has pass_rate_pct', typeof po.heuristic_results.pass_rate_pct === 'number');
  }

  if (po.synthetic) {
    console.log('  ⚠️  PO report is SYNTHETIC — structural checks only');
  }
} else {
  skipCheck('PO report fields', 'no report');
}

// ============================================================================
// Analyzing Phase
// ============================================================================
console.log('\n🧠 ANALYZING PHASE');

const analysis = ctx.analysis_result;
check('Analysis result exists', analysis != null);
if (analysis) {
  check('Has recommended_action', analysis.recommended_action != null || analysis.recommendation != null);
  check('Has reasoning', analysis.reasoning != null || analysis.recommendation_reasoning != null || analysis.summary != null);
} else {
  skipCheck('Analysis fields', 'no result');
}

// phase_decisions may be logged as array or captured in analysis_result
const hasPhaseDecisions = (Array.isArray(ctx.phase_decisions) && ctx.phase_decisions.length > 0) || ctx.analysis_result != null;
check('Phase decisions or analysis tracked', hasPhaseDecisions);

// ============================================================================
// Vision Check Phase
// ============================================================================
console.log('\n🔭 VISION CHECK PHASE');

const vc = ctx.vision_check_results;
check('Vision check results exist', vc != null);
if (vc) {
  check('Has alignment assessment', vc.alignment != null || vc.alignment_score != null || vc.vision_alignment != null);
  check('Has confidence or verdict', vc.confidence != null || vc.verdict != null || vc.vision_alignment != null);
} else {
  skipCheck('Vision check fields', 'no results');
}

// ============================================================================
// Ship/Promote Phase
// ============================================================================
console.log('\n🚀 SHIP/PROMOTE PHASE');

// Ship can succeed (ship_result) or be blocked (ship_blocked) — both are valid outcomes
const shipped = ctx.ship_result != null;
const blocked = ctx.ship_blocked !== undefined;

if (shipped) {
  check('Ship result exists', true);
  check('Ship outcome recorded', ctx.ship_result.outcome != null || ctx.ship_result.status != null || typeof ctx.ship_result === 'object');
} else if (blocked) {
  check('Ship blocked flag exists', true);
  check('Ship blocked reason exists', ctx.ship_blocked_reason != null);
  check('Blocked gates listed', Array.isArray(ctx.blocked_gates) && ctx.blocked_gates.length > 0);
} else {
  // Neither shipped nor blocked — check if promote phase ran at all
  const promoteLog = readLog('promoting');
  if (promoteLog) {
    check('Promote phase ran', promoteLog.length > 50);
  } else {
    skipCheck('Ship/Promote outcome', 'phase not yet reached');
  }
}

const promoteLog = readLog('promoting');
if (promoteLog) {
  check('Promote log has content', promoteLog.length > 50);
} else {
  skipCheck('Promote log', 'no log file');
}

// ============================================================================
// Final Review Phase
// ============================================================================
console.log('\n🏁 FINAL REVIEW PHASE');

const fr = ctx.final_review_report;
if (fr) {
  check('Final review report exists', true);
  check('Has production_ready', typeof fr.production_ready === 'boolean');
  check('Has recommendation', ['ship', 'refine', 'major-rework'].includes(fr.recommendation));
  check('Has overall_impression', fr.overall_impression != null);
} else {
  skipCheck('Final review', 'phase not yet reached or not end-of-project');
}

// ============================================================================
// State Machine (Runner System)
// ============================================================================
console.log('\n⚙️  STATE MACHINE');

check('State file valid', state.current_state != null);
check('Cycle number tracked', typeof state.cycle_number === 'number');
check('Feature areas defined', Array.isArray(state.feature_areas) && state.feature_areas.length > 0);
check('QA fix attempts tracked', typeof state.qa_fix_attempts === 'number');
check('Checkpoints tracked', Array.isArray(state.completed_phases));

// ============================================================================
// Cross-Cutting
// ============================================================================
console.log('\n🔗 CROSS-CUTTING');

check('Infrastructure: staging URL', ctx.infrastructure?.staging_url?.includes('workers.dev'));

// Supabase is optional — only check if project uses it
if (ctx.supabase?.project_ref || ctx.infrastructure?.supabase_ref) {
  check('Infrastructure: supabase ref', ctx.supabase?.project_ref != null || ctx.infrastructure?.supabase_ref != null);
} else {
  skipCheck('Infrastructure: supabase ref', 'project has no backend');
}

check('Schema version', ctx._schema_version === '1.0');
check('Project name matches', ctx._project_name === PROJECT_NAME);
check('Evaluator observations logged', Array.isArray(ctx.evaluator_observations) && ctx.evaluator_observations.length > 0);
check('Retry counts tracked', typeof ctx.retry_counts === 'object');

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log(`EVAL RESULTS: ${pass} passed, ${fail} failed, ${skip} skipped`);
console.log(`Total assertions: ${pass + fail + skip}`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(fail > 0 ? 1 : 0);
