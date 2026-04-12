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

module.exports = {
  assembleStoryContext,
  assembleMilestoneContext,
  assembleFixStoryContext,
};
