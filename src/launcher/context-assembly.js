/**
 * V2 Context Assembly — assembles focused context views for each invocation.
 *
 * Three assembly functions:
 *   assembleStoryContext()     — for story-building invocations
 *   assembleMilestoneContext() — for milestone-check invocations
 *   assembleFixStoryContext()  — for milestone-fix invocations
 *
 * These read from cycle_context.json + state.json and produce focused views
 * so prompts read a small, relevant brief instead of a 3,000+ line blob.
 *
 * cycle_context.json stays as the long-term accumulator.
 * Prompts write back to it. But they read from these focused views.
 */

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

/**
 * Filter factory_decisions/questions to those relevant to a story.
 * Matches on: story ID, entity names, file paths, feature area.
 */
function filterRelevant(entries, story, relatedFiles) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const storyId = story.id || '';
  const entities = (story.affected_entities || []).map(e => e.toLowerCase());
  const screens = (story.affected_screens || []).map(s => s.toLowerCase());
  const files = new Set((relatedFiles || []).map(f => f.toLowerCase()));

  return entries.filter(entry => {
    const text = JSON.stringify(entry).toLowerCase();
    // Match on story ID
    if (storyId && text.includes(storyId.toLowerCase())) return true;
    // Match on entity names
    if (entities.some(e => text.includes(e))) return true;
    // Match on screen names
    if (screens.some(s => text.includes(s))) return true;
    // Match on affected files
    if (entry.affects && Array.isArray(entry.affects)) {
      if (entry.affects.some(a => files.has(a.toLowerCase()))) return true;
    }
    return false;
  });
}

/**
 * Collect files_changed from related stories (same milestone, status=done).
 */
function relatedStoryResults(milestone, currentStoryId) {
  return (milestone.stories || [])
    .filter(s => s.id !== currentStoryId && s.status === 'done')
    .map(s => ({
      id: s.id,
      status: s.status,
      files_changed: s.files_changed || [],
      env_limitations: s.env_limitations || [],
      issues_encountered: s.blocked_by ? [s.blocked_by] : [],
    }));
}

/**
 * Assemble story_context.json for a story-building invocation.
 *
 * @param {string} projectDir — project root
 * @param {object} state — parsed state.json
 * @param {object} storySpec — the story's spec (from seed_spec or change_specs)
 * @returns {string} — path to the written story_context.json
 */
function assembleStoryContext(projectDir, state, storySpec) {
  const ctx = readJson(path.join(projectDir, 'cycle_context.json')) || {};
  const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
  const story = milestone
    ? (milestone.stories || []).find(s => s.id === state.current_story)
    : null;

  if (!story) throw new Error(`Story ${state.current_story} not found in milestone ${state.current_milestone}`);

  // Collect files from related stories for relevance filtering
  const related = milestone ? relatedStoryResults(milestone, story.id) : [];
  const relatedFiles = related.flatMap(r => r.files_changed);

  // Build foundation brief from cycle_context
  const foundationBrief = {
    architecture_map: ctx.decomposition_strategy?.architecture_map || {},
    schemas: ctx.decomposition_strategy?.entities || [],
    integrations: ctx.decomposition_strategy?.integrations || [],
    deployment: {
      method: ctx.infrastructure?.deployment_method || ctx.vision?.deploy_model || 'unknown',
      staging_url: ctx.deployment_url || ctx.infrastructure?.staging_url || null,
      db: ctx.infrastructure?.database_type || null,
    },
  };

  // Fix memory for this story
  const fixMemory = (state.fix_memory && state.fix_memory[story.id]) || [];

  // Milestone learnings (from circuit breaker)
  const milestoneLearnings = state.milestone_learnings || [];

  const storyContext = {
    _type: 'story_context',
    _assembled_at: new Date().toISOString(),

    // This story
    story: {
      spec: storySpec || { id: story.id, name: story.name },
      id: story.id,
      name: story.name,
      depends_on: story.depends_on || [],
      affected_entities: story.affected_entities || [],
      affected_screens: story.affected_screens || [],
      fix_memory: fixMemory,
      attempt_number: (story.attempts || 0) + 1,
      status: story.status,
    },

    // Foundation context
    foundation: foundationBrief,

    // Related stories in this milestone
    related_stories: related,

    // Milestone learnings (injected by circuit breaker)
    milestone_learnings: milestoneLearnings,

    // Cross-story fix patterns (accumulated across retries)
    fix_patterns: state.fix_patterns || {},

    // Shipped milestone insights (persists across milestones)
    shipped_insights: state.shipped_insights || [],

    // Global context (T2 tier — summary, not full)
    vision_summary: ctx.vision
      ? `${ctx.vision.product_name}: ${ctx.vision.one_liner}. Target: ${ctx.vision.target_audience?.primary || 'unknown'}. Deploy: ${ctx.vision.deploy_model || 'unknown'}.`
      : '',
    product_standard: ctx.product_standard || {},
    library_heuristics: ctx.library_heuristics || [],
    decomposition_strategy: ctx.decomposition_strategy || {},

    // Relevant decisions (filtered to this story)
    relevant_decisions: filterRelevant(ctx.factory_decisions || [], story, relatedFiles),
    relevant_questions: filterRelevant(ctx.factory_questions || [], story, relatedFiles),
    relevant_divergences: filterRelevant(ctx.divergences || [], story, relatedFiles),
  };

  const outputPath = path.join(projectDir, 'story_context.json');
  writeJson(outputPath, storyContext);
  return outputPath;
}

/**
 * Assemble milestone_context.json for a milestone-check invocation.
 *
 * @param {string} projectDir — project root
 * @param {object} state — parsed state.json
 * @returns {string} — path to the written milestone_context.json
 */
function assembleMilestoneContext(projectDir, state) {
  const ctx = readJson(path.join(projectDir, 'cycle_context.json')) || {};
  const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);

  if (!milestone) throw new Error(`Milestone ${state.current_milestone} not found`);

  const stories = milestone.stories || [];
  const completed = stories.filter(s => s.status === 'done');
  const blocked = stories.filter(s => s.status === 'blocked');
  const skipped = stories.filter(s => s.status === 'skipped');

  // Compute diff scope across all completed stories
  const allChangedFiles = completed.flatMap(s => s.files_changed || []);
  const diffScope = {
    frontend: allChangedFiles.some(f => /\.(tsx?|jsx?|css|html)$/.test(f) && !f.includes('/api/')),
    backend: allChangedFiles.some(f => f.includes('/api/') || f.includes('/server/') || f.includes('route')),
    tests: allChangedFiles.some(f => f.includes('.test.') || f.includes('.spec.')),
    config: allChangedFiles.some(f => /\.(json|yaml|yml|toml|env)$/.test(f) && !f.includes('package.json')),
    docs: allChangedFiles.some(f => /\.(md|txt)$/.test(f)),
  };

  // Previous milestones (summaries only)
  const previousMilestones = (state.milestones || [])
    .filter(m => m.name !== milestone.name && (m.status === 'complete' || m.status === 'partial'))
    .map(m => ({
      name: m.name,
      status: m.status,
      stories_done: (m.stories || []).filter(s => s.status === 'done').length,
      stories_blocked: (m.stories || []).filter(s => s.status === 'blocked').length,
      stories_total: (m.stories || []).length,
    }));

  const milestoneContext = {
    _type: 'milestone_context',
    _assembled_at: new Date().toISOString(),

    // Milestone summary
    milestone: {
      name: milestone.name,
      stories_completed: completed.map(s => ({
        id: s.id,
        name: s.name,
        files_changed: s.files_changed || [],
        env_limitations: s.env_limitations || [],
      })),
      stories_blocked: blocked.map(s => ({
        id: s.id,
        name: s.name,
        blocked_by: s.blocked_by,
      })),
      stories_skipped: skipped.map(s => ({
        id: s.id,
        reason: s.blocked_by || 'unknown',
      })),
    },

    // Deployment
    deployment_url: ctx.deployment_url || ctx.infrastructure?.staging_url || null,
    diff_scope: diffScope,

    // Full context for evaluation (T3)
    vision: ctx.vision || {},
    product_standard: ctx.product_standard || {},
    active_spec: ctx.active_spec || {},
    library_heuristics: ctx.library_heuristics || [],
    reference_products: ctx.reference_products || [],

    // Accumulated decisions from all stories in this milestone
    factory_decisions: ctx.factory_decisions || [],
    factory_questions: ctx.factory_questions || [],
    divergences: ctx.divergences || [],

    // Previous milestones
    previous_milestones: previousMilestones,

    // Infrastructure
    infrastructure: ctx.infrastructure || {},
  };

  const outputPath = path.join(projectDir, 'milestone_context.json');
  writeJson(outputPath, milestoneContext);
  return outputPath;
}

/**
 * Assemble fix_story_context.json for a milestone-fix invocation.
 *
 * @param {string} projectDir — project root
 * @param {object} state — parsed state.json
 * @returns {string} — path to the written fix_story_context.json
 */
function assembleFixStoryContext(projectDir, state) {
  const ctx = readJson(path.join(projectDir, 'cycle_context.json')) || {};
  const evalReport = ctx.evaluation_report || {};
  const analysisResult = ctx.analysis_result || {};

  // Collect all fix tasks from evaluation
  const fixTasks = evalReport.qa?.fix_tasks || [];

  // Collect retry history across all relevant criteria
  const retryHistory = {};
  for (const task of fixTasks) {
    const id = task.id || task.criterion_id;
    if (id && ctx.retry_counts?.[id]) {
      retryHistory[id] = ctx.retry_counts[id];
    }
  }

  // Collect do-not-repeat from analyzing
  const doNotRepeat = (analysisResult.change_spec_briefs || [])
    .flatMap(brief => brief.do_not_repeat || []);

  // Collect relevant factory decisions for affected files
  const affectedFiles = fixTasks.flatMap(t => t.affected_files || []);
  const relevantDecisions = (ctx.factory_decisions || []).filter(d => {
    const text = JSON.stringify(d).toLowerCase();
    return affectedFiles.some(f => text.includes(f.toLowerCase()));
  });

  const fixContext = {
    _type: 'fix_story_context',
    _assembled_at: new Date().toISOString(),

    // From evaluation
    regressions: fixTasks.map(task => ({
      id: task.id || task.criterion_id,
      description: task.description,
      evidence: task.evidence,
      severity: task.severity,
      source: task.source,
      suggested_fix: task.suggested_fix,
    })),

    // From analyzing
    root_cause_analysis: analysisResult.root_cause_analysis || [],

    // Fix memory (consolidated)
    retry_history: retryHistory,
    do_not_repeat: doNotRepeat,

    // Relevant context
    relevant_decisions: relevantDecisions,
    affected_files: [...new Set(affectedFiles)],

    // Active spec for correct-behavior reference
    active_spec: ctx.active_spec || {},

    // Deployment for verification
    deployment_url: ctx.deployment_url || ctx.infrastructure?.staging_url || null,

    // Current milestone/story info
    milestone: state.current_milestone,
    story: state.current_story,
  };

  const outputPath = path.join(projectDir, 'fix_story_context.json');
  writeJson(outputPath, fixContext);
  return outputPath;
}

/**
 * Collect relevant source files for inlining into the build prompt.
 * Returns file contents directly so the model doesn't need to explore.
 */
function collectRelevantSourceFiles(projectDir, story, state, opts = {}) {
  const maxFiles = opts.maxFiles || 5;
  const maxTotalBytes = opts.maxTotalBytes || 30000;

  const candidates = new Set();

  // Source 1: files changed by completed stories in same milestone
  const milestone = (state.milestones || []).find(m => m.name === state.current_milestone);
  if (milestone) {
    for (const s of milestone.stories || []) {
      if (s.status === 'done' && s.id !== story.id) {
        for (const f of s.files_changed || []) {
          if (!f.includes('.test.') && !f.includes('node_modules')) {
            candidates.add(f);
          }
        }
      }
    }
  }

  // Source 2: grep for affected entity names in src/
  const entities = story.affected_entities || [];
  if (entities.length > 0 && candidates.size < maxFiles) {
    try {
      const { execSync } = require('child_process');
      const pattern = entities.slice(0, 3).join('|');
      const grepResult = execSync(
        `grep -rl --include="*.ts" --include="*.tsx" --include="*.js" "${pattern}" src/ packages/ apps/ 2>/dev/null | head -10`,
        { cwd: projectDir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      for (const f of grepResult.trim().split('\n').filter(Boolean)) {
        candidates.add(f);
      }
    } catch {}
  }

  // Rank: prefer shorter files (likely modules/utils), exclude test files and configs
  const ranked = [...candidates]
    .filter(f => {
      const abs = path.isAbsolute(f) ? f : path.join(projectDir, f);
      try { return fs.statSync(abs).isFile(); } catch { return false; }
    })
    .map(f => {
      const abs = path.isAbsolute(f) ? f : path.join(projectDir, f);
      const size = fs.statSync(abs).size;
      return { path: f, abs, size };
    })
    .filter(f => f.size < 15000) // skip huge files
    .sort((a, b) => a.size - b.size);

  const result = [];
  let totalBytes = 0;
  for (const f of ranked) {
    if (result.length >= maxFiles) break;
    if (totalBytes + f.size > maxTotalBytes) break;
    try {
      const content = fs.readFileSync(f.abs, 'utf8');
      const relPath = path.relative(projectDir, f.abs);
      result.push({ path: relPath, content });
      totalBytes += f.size;
    } catch {}
  }

  return result;
}

/**
 * Compact older story entries in cycle_context.json to prevent unbounded growth.
 * Keeps the 2 most recent completed story results at full fidelity;
 * older entries get verbose fields replaced with summaries.
 *
 * Idempotent: already-compacted entries are skipped.
 */
function compactOlderStories(projectDir) {
  const contextFile = path.join(projectDir, 'cycle_context.json');
  const ctx = readJson(contextFile);
  if (!ctx) return;

  let changed = false;

  // Compact story_results array (if present): keep last 2 at full fidelity
  const results = ctx.story_results;
  if (Array.isArray(results) && results.length > 2) {
    const cutoff = results.length - 2;
    for (let i = 0; i < cutoff; i++) {
      const entry = results[i];
      if (!entry || entry._compacted) continue;

      // Compact files_changed: array → { count, key_files }
      if (Array.isArray(entry.files_changed)) {
        entry.files_changed = {
          count: entry.files_changed.length,
          key_files: entry.files_changed.slice(0, 3),
        };
        changed = true;
      }

      // Compact acceptance_criteria lists
      if (Array.isArray(entry.acceptance_criteria)) {
        const passed = entry.acceptance_criteria.filter(ac => ac.status === 'pass' || ac.passed).length;
        const failed = entry.acceptance_criteria.length - passed;
        entry.acceptance_criteria = { total: entry.acceptance_criteria.length, passed, failed };
        changed = true;
      }

      // Compact test results
      if (entry.tests_added !== undefined && entry.tests_passing !== undefined && entry.test_results) {
        delete entry.test_results;
        changed = true;
      }

      // Mark as compacted so we don't re-process
      entry._compacted = true;
      changed = true;
    }
  }

  // Compact alternatives_considered in factory_decisions (always runs).
  // Keep last 10 decisions at full fidelity (most recent = most relevant to current gaps).
  if (Array.isArray(ctx.factory_decisions) && ctx.factory_decisions.length > 10) {
    const decisionCutoff = ctx.factory_decisions.length - 10;
    for (let i = 0; i < decisionCutoff; i++) {
      const decision = ctx.factory_decisions[i];
      if (!decision || decision._compacted) continue;
      if (Array.isArray(decision.alternatives_considered)) {
        decision.alternatives_considered = decision.alternatives_considered[0] || null;
        changed = true;
      } else if (typeof decision.alternatives_considered === 'string' && decision.alternatives_considered.length > 100) {
        const firstSentence = decision.alternatives_considered.split('. ')[0];
        decision.alternatives_considered = firstSentence + (firstSentence.endsWith('.') ? '' : '.');
        changed = true;
      }
      if (decision.context && decision.context.length > 100) {
        decision.context = decision.context.slice(0, 100) + '...';
        changed = true;
      }
      decision._compacted = true;
      changed = true;
    }
  }

  // Compact implemented array: keep last 5 at full fidelity, compact older
  if (Array.isArray(ctx.implemented) && ctx.implemented.length > 5) {
    const implCutoff = ctx.implemented.length - 5;
    for (let i = 0; i < implCutoff; i++) {
      const item = ctx.implemented[i];
      if (!item || item._compacted) continue;
      if (Array.isArray(item.files_changed) && item.files_changed.length > 3) {
        item.files_changed = {
          count: item.files_changed.length,
          key_files: item.files_changed.slice(0, 3),
        };
        changed = true;
      }
      item._compacted = true;
      changed = true;
    }
  }

  if (changed) {
    writeJson(contextFile, ctx);
  }
}

/**
 * Assemble analysis_context.json for the analyzing phase.
 *
 * Provides: evaluation_report, factory_decisions, factory_questions,
 * confidence_history, previous_cycles, vision, product_standard,
 * retry_counts, qa_fix_results, capability_assessments, cycle metadata.
 *
 * @param {string} projectDir — project root
 * @param {object} state — parsed state.json
 * @returns {string} — path to the written analysis_context.json
 */
function assembleAnalysisContext(projectDir, state) {
  const ctx = readJson(path.join(projectDir, 'cycle_context.json')) || {};

  const analysisContext = {
    _type: 'analysis_context',
    _assembled_at: new Date().toISOString(),
    _cycle_number: ctx._cycle_number || state.cycle_number || 1,
    _current_milestone: ctx._current_milestone || state.current_milestone || null,

    // Primary input: evaluation report (preserved in full)
    evaluation_report: ctx.evaluation_report || {},

    // Decision trail for root cause analysis
    factory_decisions: ctx.factory_decisions || [],
    factory_questions: ctx.factory_questions || [],

    // Trend data
    confidence_history: ctx.confidence_history || [],
    previous_cycles: ctx.previous_cycles || [],

    // Strategic context
    vision: ctx.vision || {},
    product_standard: ctx.product_standard || {},

    // Fix/retry context
    retry_counts: ctx.retry_counts || {},
    qa_fix_results: ctx.qa_fix_results || {},

    // Capability screen results (injected by launcher before this phase)
    capability_assessments: ctx.capability_assessments || [],

    // Divergences (for pattern detection)
    divergences: ctx.divergences || [],

    // Active spec for reference during root cause classification
    active_spec: ctx.active_spec || {},

    // Sub-phase evaluation reports (may be top-level in older projects)
    test_integrity_report: ctx.test_integrity_report || null,
    code_review_report: ctx.code_review_report || null,
    product_walk: ctx.product_walk || null,

    // Evaluator observations (from QA and PO review)
    evaluator_observations: ctx.evaluator_observations || [],

    // Circuit breaker mode (mid-loop diagnostic)
    _circuit_breaker: ctx._circuit_breaker || false,
    story_failures: ctx.story_failures || [],
  };

  const outputPath = path.join(projectDir, 'analysis_context.json');
  writeJson(outputPath, analysisContext);
  return outputPath;
}

/**
 * Assemble vision_check_context.json for the vision-check phase.
 *
 * Provides: vision, implemented work, factory_decisions, divergences,
 * evaluator observations, confidence, quality gaps, previous cycles.
 *
 * Note: vision-check also reads journey.json and global_improvements.json
 * directly — those are NOT included here.
 *
 * @param {string} projectDir — project root
 * @param {object} state — parsed state.json
 * @returns {string} — path to the written vision_check_context.json
 */
function assembleVisionCheckContext(projectDir, state) {
  const ctx = readJson(path.join(projectDir, 'cycle_context.json')) || {};

  // Aggregate implemented items from story_results
  const implemented = [];
  const skipped = [];
  if (Array.isArray(ctx.story_results)) {
    for (const result of ctx.story_results) {
      if (Array.isArray(result.implemented)) {
        for (const item of result.implemented) {
          implemented.push({ ...item, _story_id: result.story_id || result._story_id });
        }
      }
      if (Array.isArray(result.skipped)) {
        for (const item of result.skipped) {
          skipped.push({ ...item, _story_id: result.story_id || result._story_id });
        }
      }
    }
  }
  // Also include top-level implemented/skipped (from current cycle if not yet in story_results)
  if (Array.isArray(ctx.implemented)) {
    for (const item of ctx.implemented) {
      if (!implemented.some(i => i.task === item.task)) {
        implemented.push(item);
      }
    }
  }
  if (Array.isArray(ctx.skipped)) {
    for (const item of ctx.skipped) {
      if (!skipped.some(i => i.task === item.task)) {
        skipped.push(item);
      }
    }
  }

  const visionCheckContext = {
    _type: 'vision_check_context',
    _assembled_at: new Date().toISOString(),
    _cycle_number: ctx._cycle_number || state.cycle_number || 1,
    _current_milestone: ctx._current_milestone || state.current_milestone || null,

    // The north star
    vision: ctx.vision || {},

    // What was built (aggregated across stories)
    implemented,
    skipped,

    // Full decision trail (vision-check reviews all decisions for drift)
    factory_decisions: ctx.factory_decisions || [],
    factory_questions: ctx.factory_questions || [],

    // Divergences (critical for drift detection — never truncated)
    divergences: ctx.divergences || [],

    // Evaluator observations (from QA and PO review)
    evaluator_observations: ctx.evaluator_observations || [],

    // Evaluation confidence and gaps
    evaluation_report_summary: {
      po_confidence: ctx.evaluation_report?.po?.confidence || null,
      po_confidence_adjusted: ctx.evaluation_report?.po?.confidence_adjusted || null,
      quality_gaps: ctx.evaluation_report?.po?.quality_gaps || [],
    },

    // History
    previous_cycles: ctx.previous_cycles || [],
  };

  const outputPath = path.join(projectDir, 'vision_check_context.json');
  writeJson(outputPath, visionCheckContext);
  return outputPath;
}

module.exports = {
  assembleStoryContext,
  assembleMilestoneContext,
  assembleFixStoryContext,
  collectRelevantSourceFiles,
  compactOlderStories,
  assembleAnalysisContext,
  assembleVisionCheckContext,
};
