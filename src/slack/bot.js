const { App } = require('@slack/bolt');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { markdownToSlack } = require('./format');
const blockKit = require('./block-kit');
const { statePath: resolveStatePath, hasStateFile } = require('../launcher/state-path.js');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Projects live outside the repo tree (#143) so spawned phase agents
// don't auto-load Rouge's own CLAUDE.md as ancestor context.
const PROJECTS_DIR = process.env.ROUGE_PROJECTS_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.rouge', 'projects');
const KNOWN_COMMANDS = ['status', 'start', 'pause', 'resume', 'new', 'seed', 'ship', 'feedback', 'help'];

function readState(projectName) {
  const statePath = resolveStatePath(path.join(PROJECTS_DIR, projectName));
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(projectName, state) {
  const statePath = resolveStatePath(path.join(PROJECTS_DIR, projectName));
  state.timestamp = new Date().toISOString();
  const tmp = statePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, statePath);
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter(d => hasStateFile(path.join(PROJECTS_DIR, d)));
}

function writeFeedback(projectName, text) {
  const feedbackPath = path.join(PROJECTS_DIR, projectName, 'feedback.json');
  const tmp = feedbackPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    text,
    timestamp: new Date().toISOString(),
  }, null, 2) + '\n');
  fs.renameSync(tmp, feedbackPath);
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

// Returns a short summary string for the status list view.
// Uses task_ledger.json if available; falls back to cycle number.
function getProjectStatusSummary(name, state) {
  try {
    const ledgerPath = path.join(PROJECTS_DIR, name, 'task_ledger.json');
    if (fs.existsSync(ledgerPath)) {
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      const milestones = ledger.milestones || [];
      if (milestones.length > 0) {
        // Count milestones and stories
        const promotedMs = state?.promoted_milestones || [];
        const currentMs = milestones.find(ms => !promotedMs.includes(ms.name));
        if (!currentMs) return `(${milestones.length}/${milestones.length} milestones)`;
        const msIdx = milestones.indexOf(currentMs) + 1;
        const stories = currentMs.stories || [];
        const doneStories = stories.filter(s => s.status === 'done').length;
        return `(milestone ${msIdx}/${milestones.length}, story ${doneStories}/${stories.length})`;
      }
    }
  } catch {}
  return `(cycle ${state?.cycle_number || 0})`;
}

function formatProjectDetail(name) {
  const state = readState(name);
  if (!state) return `Project \`${name}\` not found.`;

  const projectDir = path.join(PROJECTS_DIR, name);
  const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
  const seedState = getSeedingState(name);
  const emoji = STATE_EMOJI[state?.current_state] || '❓';

  const lines = [];
  lines.push(`${emoji} *${name}*${state.name && state.name !== name ? ` _(${state.name})_` : ''}`);
  lines.push('');

  // Phase & cycle
  lines.push(`*Phase:* \`${state.current_state || 'unknown'}\``);
  if (state.current_state === 'seeding' && seedState) {
    lines.push(`*Seeding:* ${seedState.status || 'unknown'}`);
  }
  lines.push(`*Cycle:* ${state.cycle_number || 0}`);

  // Milestones (from task_ledger.json)
  const ledgerPath = path.join(projectDir, 'task_ledger.json');
  if (fs.existsSync(ledgerPath)) {
    try {
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      if (ledger.milestones && ledger.milestones.length > 0) {
        lines.push('');
        lines.push('*Milestones:*');
        for (const ms of ledger.milestones) {
          const stories = ms.stories || [];
          const done = stories.filter(s => s.status === 'done').length;
          const total = stories.length;
          const promoted = (state.promoted_milestones || []).includes(ms.name);
          const icon = promoted ? '🔒' : done === total ? '✅' : done > 0 ? '🔨' : '⬜';
          lines.push(`  ${icon} ${ms.name} — ${done}/${total} stories${promoted ? ' (promoted)' : ''}`);
        }
      }
    } catch {}
  }

  // Foundation status
  if (state.foundation) {
    lines.push('');
    const fStatus = state.foundation.status || 'unknown';
    const fEmoji = fStatus === 'complete' ? '✅' : fStatus === 'in-progress' ? '🔨' : '⬜';
    lines.push(`*Foundation:* ${fEmoji} \`${fStatus}\``);
    if (state.foundation.completed_at) {
      lines.push(`  _Completed: ${state.foundation.completed_at}_`);
    }
  }

  // Confidence history
  const confidence = state.confidence_history || [];
  if (confidence.length > 0) {
    const last3 = confidence.slice(-3).map(c => typeof c === 'number' ? `${(c * 100).toFixed(0)}%` : String(c));
    lines.push('');
    lines.push(`*Confidence (last ${last3.length}):* ${last3.join(' → ')}`);
  }

  // Staging URL
  const stagingUrl = ctx?.deployment_url || ctx?.infrastructure?.staging_url;
  if (stagingUrl) {
    lines.push('');
    lines.push(`*Staging:* <${stagingUrl}|${stagingUrl}>`);
  }

  // Last action timestamp
  if (state.timestamp) {
    lines.push('');
    lines.push(`*Last action:* ${state.timestamp}`);
  }

  // Cost info from checkpoints
  const checkpointsPath = path.join(projectDir, 'checkpoints.jsonl');
  if (fs.existsSync(checkpointsPath)) {
    try {
      const content = fs.readFileSync(checkpointsPath, 'utf8').trim();
      const cpLines = content.split('\n').filter(Boolean);
      if (cpLines.length > 0) {
        const lastCp = JSON.parse(cpLines[cpLines.length - 1]);
        if (lastCp.costs?.cumulative_cost_usd) {
          lines.push(`*Cost:* $${lastCp.costs.cumulative_cost_usd.toFixed(2)}`);
        }
      }
    } catch {}
  }

  return lines.join('\n');
}

function getSeedingState(projectName) {
  const seedPath = path.join(PROJECTS_DIR, projectName, 'seeding-state.json');
  if (!fs.existsSync(seedPath)) return null;
  return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
}

function writeSeedingState(projectName, seedState) {
  const seedPath = path.join(PROJECTS_DIR, projectName, 'seeding-state.json');
  const tmp = seedPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(seedState, null, 2) + '\n');
  fs.renameSync(tmp, seedPath);
}

// FIX #105: Discipline state tracker + resume handoff.
//
// The orchestrator prompt used to tell Claude to maintain a JSON tracker of
// discipline state in its head. That tracker was never persisted to disk, so
// when a rate limit killed the subprocess and the session was resumed via
// --resume, Claude would reconstruct the tracker from its own memory —
// sometimes misjudging where it had stopped and blurring the boundary between
// disciplines. We now persist an authoritative tracker in seedingState and
// inject it into every Claude call as a [RESUMING FROM STATE] block.

const SEEDING_DISCIPLINES = [
  'brainstorming', 'competition', 'taste', 'spec',
  'infrastructure', 'design', 'legal-privacy', 'marketing',
];

/**
 * Record a parsed [DISCIPLINE_COMPLETE: <name>] marker in seedingState.
 * Normalises the discipline name (case-insensitive, strips whitespace).
 * Mutates seedingState in place; caller is responsible for persisting.
 */
function updateDisciplineTracker(seedState, disciplineName) {
  if (!seedState.disciplines) seedState.disciplines = {};
  const normalised = String(disciplineName || '').trim().toLowerCase();
  if (!normalised) return;
  const existing = seedState.disciplines[normalised] || { runs: 0 };
  seedState.disciplines[normalised] = {
    status: 'complete',
    completed_at: new Date().toISOString(),
    runs: (existing.runs || 0) + 1,
  };
}

/**
 * Build the [RESUMING FROM STATE] block that gets prepended to every Claude
 * seeding invocation after the first. Returns an empty string if there is no
 * discipline state to report (first message in the session).
 *
 * The block is prose that the orchestrator's Resumption section tells Claude
 * to trust as the authoritative source of truth — overriding its own memory
 * of where the discipline boundaries fell.
 */
function buildResumingFromStateBlock(seedState) {
  const disciplines = seedState && seedState.disciplines;
  if (!disciplines || Object.keys(disciplines).length === 0) return '';

  const completed = [];
  const pending = [];
  for (const name of SEEDING_DISCIPLINES) {
    const entry = disciplines[name];
    if (entry && entry.status === 'complete') {
      completed.push(name);
    } else {
      pending.push(name);
    }
  }

  const lines = [
    '[RESUMING FROM STATE — authoritative, trust over your own memory]',
    `Completed disciplines (${completed.length}/${SEEDING_DISCIPLINES.length}): ${completed.join(', ') || '(none)'}`,
    `Remaining disciplines: ${pending.join(', ') || '(none)'}`,
    'Do not re-run any discipline marked complete. Resume at the next remaining discipline. If the previous output left a discipline mid-work, restart that discipline cleanly from its opening — do not try to patch around where you think you stopped.',
    '[END STATE]',
    '',
    '',
  ];
  return lines.join('\n');
}

// FIX #2: Generate cycle_context.json from seed artifacts when seeding completes
function generateCycleContext(projectName) {
  const projectDir = path.join(PROJECTS_DIR, projectName);
  const specDir = path.join(projectDir, 'seed_spec');

  // Read feature areas from spec files (V2: spec-*.md) or state.json milestones (V3)
  const featureAreas = [];
  const seedState = readState(projectName);
  if (seedState && seedState.milestones && seedState.milestones.length > 0) {
    // V3: milestones are in state.json, written by the seeding swarm
    for (const m of seedState.milestones) {
      featureAreas.push({ name: m.name, status: m.status || 'pending' });
    }
  } else if (fs.existsSync(specDir)) {
    // V2 fallback: read spec-*.md files
    const specFiles = fs.readdirSync(specDir).filter(f => f.startsWith('spec-') && f.endsWith('.md')).sort();
    for (const file of specFiles) {
      const name = file.replace(/^spec-\d+-/, '').replace('.md', '');
      featureAreas.push({ name, status: 'pending' });
    }
  }

  // Read design artifact if it exists
  const designFile = path.join(specDir, 'design-artifact.yaml');
  const hasDesign = fs.existsSync(designFile);

  // Build the context
  const context = {
    _schema_version: '1.0',
    _project_name: projectName,
    _cycle_number: 1,
    vision: {
      name: projectName,
      feature_areas: featureAreas.map(fa => ({
        name: fa.name,
        description: `See seed_spec/spec-*-${fa.name}.md`,
        status: 'pending',
      })),
      // FIX B7+I13: read infrastructure from vision.json instead of hardcoding.
      // Previously hardcoded needs_database: true and deployment_target: 'cloudflare-workers'
      // for every project regardless of what the seeding infrastructure discipline decided.
      infrastructure: (() => {
        const vision = readJson(path.join(projectDir, 'vision.json'));
        const visionInfra = vision?.infrastructure || {};
        return {
          needs_database: visionInfra.needs_database ?? false,
          needs_auth: visionInfra.needs_auth ?? false,
          needs_payments: visionInfra.needs_payments ?? false,
          deployment_target: visionInfra.deployment_target || null,
          ...(visionInfra.services ? { services: visionInfra.services } : {}),
          ...(visionInfra.framework ? { framework: visionInfra.framework } : {}),
        };
      })(),
    },
    product_standard: {
      inherits: ['global', 'domain/web'],
      overrides: [],
      additions: [],
    },
    active_spec: {
      type: 'seed',
      feature_areas: featureAreas.map(fa => fa.name),
      spec_files: fs.existsSync(specDir)
        ? fs.readdirSync(specDir).filter(f => f.startsWith('spec-')).sort().map(f => `seed_spec/${f}`)
        : [],
      design_file: hasDesign ? 'seed_spec/design-artifact.yaml' : null,
    },
    library_heuristics: [],
    reference_products: [],
    previous_evaluations: [],
    evaluation_deltas: [],
    implemented: [],
    skipped: [],
    divergences: [],
    factory_decisions: [],
    factory_questions: [],
    evaluation_report: null,
    deployment_url: null,
    infrastructure: {
      staging_url: null,
      production_url: null,
      supabase_ref: null,
      sentry_dsn: null,
    },
    retry_counts: {},
    previous_cycles: [],
    supabase: {
      project_ref: null,
      slot_acquired: false,
      connection_string: null,
    },
  };

  const contextPath = path.join(projectDir, 'cycle_context.json');
  const tmp = contextPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(context, null, 2) + '\n');
  fs.renameSync(tmp, contextPath);

  // Also update state.json with feature areas
  const state = readState(projectName);
  if (state) {
    state.feature_areas = featureAreas;
    state.current_feature_area = featureAreas.length > 0 ? featureAreas[0].name : null;
    state.cycle_number = 1;
    writeState(projectName, state);
  }

  // FIX #91: Count V3 milestones, stories, and acceptance criteria for status display.
  // V2 spec file counts are misleading on V3 because V3 stores specs as milestones + stories
  // in state.json (and optionally seed_spec/milestones.json), not as spec-*.md files.
  let milestoneCount = 0;
  let storyCount = 0;
  let acCount = 0;
  let schemaVersion = 'v2';
  if (seedState && Array.isArray(seedState.milestones) && seedState.milestones.length > 0) {
    schemaVersion = 'v3';
    milestoneCount = seedState.milestones.length;
    for (const m of seedState.milestones) {
      const stories = Array.isArray(m.stories) ? m.stories : [];
      storyCount += stories.length;
      for (const s of stories) {
        const acs = Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [];
        acCount += acs.length;
      }
    }
    // If state.json stories don't carry acceptance criteria text, try seed_spec/milestones.json
    if (acCount === 0 && fs.existsSync(specDir)) {
      const msFile = path.join(specDir, 'milestones.json');
      if (fs.existsSync(msFile)) {
        try {
          const msData = JSON.parse(fs.readFileSync(msFile, 'utf8'));
          const msArr = Array.isArray(msData.milestones) ? msData.milestones : (Array.isArray(msData) ? msData : []);
          for (const m of msArr) {
            const stories = Array.isArray(m.stories) ? m.stories : [];
            for (const s of stories) {
              const acs = Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : [];
              acCount += acs.length;
            }
          }
        } catch {}
      }
    }
  }

  return {
    featureAreas: featureAreas.length,
    specFiles: context.active_spec.spec_files.length,
    milestones: milestoneCount,
    stories: storyCount,
    acceptanceCriteria: acCount,
    schemaVersion,
  };
}

function isRateLimited(text) {
  if (!text) return false;
  // Only detect rate limits in SHORT responses (< 200 chars).
  // Real rate limit messages from Claude Code are brief error messages.
  // Long responses that mention "rate limit" are actual content, not errors.
  if (text.length > 200) return false;
  const lower = text.toLowerCase();
  return lower.includes('hit your limit') ||
         lower.includes('too many requests') ||
         (lower.includes('resets ') && lower.includes('limit'));
}

function tryParseClaudeOutput(raw) {
  // Try parsing the whole output as JSON
  try { return JSON.parse(raw); } catch {}
  // Try finding a JSON object in the output (Claude may prefix with non-JSON text)
  const jsonMatch = raw.match(/\{[\s\S]*"result"[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  // Try last line (Claude sometimes outputs progress then JSON on last line)
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return null;
}

function invokeClaudeSeeding(projectDir, prompt, sessionId) {
  const rougeRoot = path.resolve(__dirname, '../..');
  const args = ['claude', '-p'];
  args.push('--dangerously-skip-permissions');
  args.push('--model', 'opus');
  args.push('--max-turns', '50');
  args.push('--output-format', 'json');
  // --add-dir: whitelist only the Rouge directories seeding needs.
  // Defence-in-depth — prevents accidental sibling-project discovery.
  args.push('--add-dir', path.join(rougeRoot, 'src/prompts/seeding'));
  args.push('--add-dir', path.join(rougeRoot, 'library'));
  // Rouge-core + vendor denylist. execSync uses a joined string, so
  // each pattern is single-quoted to survive shell parsing.
  const toolPermissions = require(path.join(rougeRoot, 'src/launcher/tool-permissions'));
  const { args: denyArgs } = toolPermissions.buildDenylistArgs();
  for (const arg of denyArgs) {
    // --disallowedTools or a pattern like Bash(gh *)
    args.push(arg.startsWith('--') ? arg : `'${arg.replace(/'/g, "'\\''")}'`);
  }
  if (sessionId) {
    args.push('--resume', sessionId);
  }
  try {
    const rawOutput = execSync(args.join(' '), {
      encoding: 'utf8',
      input: prompt,
      timeout: 600000, // 10 min
      cwd: projectDir,
      env: { ...process.env, HOME: process.env.HOME },
    });

    // Claude may output multiple lines — find the JSON line
    const parsed = tryParseClaudeOutput(rawOutput);
    if (!parsed) {
      // Couldn't parse JSON — return raw text as the result
      console.error('Could not parse Claude JSON output, returning raw text');
      return { result: rawOutput.slice(0, 3000), session_id: null };
    }

    const responseText = parsed.result || parsed.message || '';
    if (isRateLimited(responseText)) {
      return { rate_limited: true, message: responseText };
    }

    return parsed;
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';

    // Try to parse stdout even on error exit
    if (stdout) {
      const parsed = tryParseClaudeOutput(stdout);
      if (parsed) {
        const responseText = parsed.result || parsed.message || '';
        if (isRateLimited(responseText)) {
          return { rate_limited: true, message: responseText };
        }
        return parsed;
      }
      // Couldn't parse but got output — return it as text
      if (stdout.length > 10) {
        return { result: stdout.slice(0, 3000), session_id: null };
      }
    }

    // Distinguish timeout from other errors
    if (err.message.includes('ETIMEDOUT') || err.message.includes('timed out')) {
      return { error: 'Claude took too long to respond. Try again in a minute.', timeout: true };
    }
    console.error('Claude invocation error:', err.message.slice(0, 200));
    return { error: err.message.slice(0, 500) };
  }
}


// V3 state machine phases — must match STATE_TO_PROMPT in rouge-loop.js.
const STATE_EMOJI = {
  // Foundation
  'foundation': '\u{1F3D7}',          // 🏗️
  'foundation-eval': '\u{1F50D}',     // 🔍
  // Story loop
  'story-building': '\u{1F528}',      // 🔨
  // Milestone loop
  'milestone-check': '\u{1F4CB}',     // 📋
  'milestone-fix': '\u{1F527}',       // 🔧
  // Progression
  'analyzing': '\u{1F9E0}',           // 🧠
  'generating-change-spec': '\u{1F4DD}', // 📝
  'vision-check': '\u{1F52D}',        // 🔭
  'shipping': '\u{1F680}',            // 🚀
  'final-review': '\u{1F3C1}',        // 🏁
  // Terminal / control states
  'complete': '\u2705',               // ✅
  'waiting-for-human': '\u23F8\uFE0F', // ⏸️
  'escalation': '\u{1F6A8}',          // 🚨
  'ready': '\u{1F4CB}',               // 📋
  'seeding': '\u{1F331}',             // 🌱
};

function showHelp(say) {
  const { blocks } = blockKit.helpMessage();
  return say({ blocks });
}

// --- FW.14: App Home dashboard ---
app.event('app_home_opened', async ({ event, client }) => {
  try {
    const projects = listProjects();

    const projectBlocks = projects.length === 0
      ? [{ type: 'section', text: { type: 'mrkdwn', text: '_No projects yet. Use `/rouge new <name>` to create one._' } }]
      : projects.flatMap(name => {
          const state = readState(name);
          const seedState = getSeedingState(name);
          const projectDir = path.join(PROJECTS_DIR, name);
          const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
          const emoji = STATE_EMOJI[state?.current_state] || '❓';
          const cycle = state?.cycle_number || 0;
          const feature = state?.current_feature_area || 'n/a';
          const currentModule = state?.current_module || null;

          let statusLine = `${emoji} *${name}*`;
          if (state?.name && state.name !== name) statusLine += ` _(${state.name})_`;
          statusLine += ` — \`${state?.current_state || 'unknown'}\``;
          if (state?.current_state === 'seeding') {
            statusLine += seedState?.status === 'active' ? ' _(active)_' : ' _(paused)_';
          }

          // Build context line with available data
          const contextParts = [`Cycle ${cycle}`];
          if (currentModule) contextParts.push(`Module: ${currentModule}`);
          if (feature !== 'n/a') contextParts.push(`Area: ${feature}`);

          // Add quality metrics if available
          const health = ctx?.evaluation_report?.health_score;
          const confidence = ctx?.evaluation_report?.po?.confidence;
          if (health != null) contextParts.push(`Health: ${health}/100`);
          if (confidence != null) contextParts.push(`Conf: ${(confidence * 100).toFixed(0)}%`);

          // Staging URL
          const stagingUrl = ctx?.infrastructure?.staging_url;
          if (stagingUrl) contextParts.push(`<${stagingUrl}|staging>`);

          // Module progress (if modules exist)
          if (Array.isArray(state?.modules)) {
            const done = state.modules.filter(m => m.status === 'complete').length;
            contextParts.push(`Modules: ${done}/${state.modules.length}`);
          } else {
            const done = (state?.feature_areas || []).filter(fa => fa.status === 'complete').length;
            const total = (state?.feature_areas || []).length;
            if (total > 0) contextParts.push(`Areas: ${done}/${total}`);
          }

          const blocks = [
            { type: 'section', text: { type: 'mrkdwn', text: statusLine } },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: contextParts.join(' | ') },
              ],
            },
          ];

          // Add action buttons based on state
          const actions = [];
          if (state?.current_state === 'ready') {
            actions.push({ type: 'button', text: { type: 'plain_text', text: '🚀 Start' }, action_id: `start_${name}`, value: name, style: 'primary' });
          }
          if (state?.current_state === 'final-review') {
            actions.push({ type: 'button', text: { type: 'plain_text', text: '🚀 Ship It' }, action_id: `ship_home_${name}`, value: name, style: 'primary' });
          }
          if (!['waiting-for-human', 'complete', 'ready', 'final-review'].includes(state?.current_state)) {
            actions.push({ type: 'button', text: { type: 'plain_text', text: '⏸️ Pause' }, action_id: `pause_${name}`, value: name });
          }
          if (state?.current_state === 'waiting-for-human') {
            actions.push({ type: 'button', text: { type: 'plain_text', text: '▶️ Resume' }, action_id: `resume_${name}`, value: name, style: 'primary' });
            actions.push({ type: 'button', text: { type: 'plain_text', text: '⏭️ Skip' }, action_id: `skip_${name}`, value: name });
          }

          if (actions.length > 0) {
            blocks.push({ type: 'actions', elements: actions });
          }

          blocks.push({ type: 'divider' });
          return blocks;
        });

    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🔴 Rouge Dashboard' },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `_Last updated: ${new Date().toLocaleString()}_` },
            ],
          },
          { type: 'divider' },
          ...projectBlocks,
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '`/rouge new <name>` to create a project | `/rouge status` for quick check' },
          },
        ],
      },
    });
  } catch (err) {
    console.error('App Home error:', err.message);
  }
});

// --- FW.14: Action button handlers ---
app.action(/^start_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.value;
  const state = readState(projectName);
  if (state && state.current_state === 'ready') {
    // Determine initial build state: foundation if not done, otherwise story-building
        state.current_state = (state.foundation && state.foundation.status === 'complete') ? 'story-building' : 'foundation';
    writeState(projectName, state);
    await respond({ text: `🚀 Started \`${projectName}\`.` });
  }
});

// Ship from App Home dashboard
app.action(/^ship_home_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.value;
  const state = readState(projectName);
  if (state && state.current_state === 'final-review') {
    const projectDir = path.join(PROJECTS_DIR, projectName);
    const ctxFile = path.join(projectDir, 'cycle_context.json');
    const ctx = readJson(ctxFile);
    if (ctx) {
      ctx.final_review_report = ctx.final_review_report || {};
      ctx.final_review_report.human_approved = true;
      ctx.final_review_report.approved_at = new Date().toISOString();
      writeJson(ctxFile, ctx);
    }
    state.current_state = 'complete';
    writeState(projectName, state);
    await respond({ text: `🚀 \`${projectName}\` approved for production!` });
  }
});

app.action(/^pause_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.value;
  const state = readState(projectName);
  if (state) {
    state.paused_from_state = state.current_state;
    state.current_state = 'waiting-for-human';
    writeState(projectName, state);
    await respond({ text: `⏸️ Paused \`${projectName}\`.` });
  }
});

app.action(/^resume_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.value;
  const state = readState(projectName);
  if (state && state.current_state === 'waiting-for-human') {
    const resumeTo = state.paused_from_state || 'story-building';
    state.current_state = resumeTo;
    delete state.paused_from_state;
    writeState(projectName, state);
    await respond({ text: `▶️ Resumed \`${projectName}\` → \`${resumeTo}\`.` });
  }
});

// Skip phase — advance past stuck phase to next one in pipeline
app.action(/^skip_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.value;
  const state = readState(projectName);
  if (state && state.current_state === 'waiting-for-human') {
    const stuckPhase = state.paused_from_state || 'unknown';
    // Advance past the stuck phase
    // V3 phase pipeline — must match STATE_TO_PROMPT order in rouge-loop.js
    const pipeline = ['story-building', 'milestone-check', 'milestone-fix', 'analyzing', 'generating-change-spec', 'vision-check', 'shipping', 'final-review'];
    const idx = pipeline.indexOf(stuckPhase);
    const nextPhase = idx >= 0 && idx < pipeline.length - 1 ? pipeline[idx + 1] : 'promoting';
    state.current_state = nextPhase;
    delete state.paused_from_state;
    writeState(projectName, state);
    await respond({ text: `⏭️ Skipped \`${stuckPhase}\` → advanced to \`${nextPhase}\` for \`${projectName}\`.` });
  }
});

// --- FW.20: Feedback classification handler ---
app.action(/^classify_feedback_/, async ({ action, ack, respond }) => {
  await ack();
  const projectName = action.action_id.replace('classify_feedback_', '');
  const [classification, ...feedbackParts] = action.selected_option.value.split('|');
  const feedbackText = feedbackParts.join('|');

  writeFeedback(projectName, JSON.stringify({
    text: feedbackText,
    classification: classification === 'auto' ? null : classification,
    classified_by: classification === 'auto' ? 'llm' : 'human',
    timestamp: new Date().toISOString(),
  }));

  const classLabel = {
    'product-change': '🔧 Product Change',
    'global-learning': '🌍 Global Learning',
    'domain-learning': '🏷️ Domain Learning',
    'personal-preference': '👤 Personal Preference',
    'direction': '🧭 Direction',
    'auto': '🤖 Auto-classify',
  }[classification] || classification;

  await respond({ text: `✅ Feedback recorded as *${classLabel}* for \`${projectName}\`. Launcher will process it.` });
});

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>\s*/g, '').trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const projectName = parts[1];

  try {
    // FIX Bug 2: Check known commands BEFORE seeding relay
    // This ensures help/status/pause/etc. always work, even during active seeding
    if (KNOWN_COMMANDS.includes(cmd)) {
      switch (cmd) {
        case 'help': {
          await showHelp(say);
          return;
        }

        case 'status': {
          // Per-project detail view
          if (projectName) {
            await say(formatProjectDetail(projectName));
            return;
          }
          const projects = listProjects();
          if (projects.length === 0) {
            await say('No projects found.');
            return;
          }
          const lines = projects.map(name => {
            const state = readState(name);
            const seedState = getSeedingState(name);
            const emoji = STATE_EMOJI[state?.current_state] || '\u2753';
            let extra = '';
            if (state?.current_state === 'seeding' && seedState?.status === 'active') {
              extra = ' _(seeding active)_';
            } else if (state?.current_state === 'seeding' && seedState?.status === 'paused') {
              extra = ' _(seeding paused)_';
            }
            return `${emoji} *${name}*: \`${state?.current_state || 'unknown'}\` ${getProjectStatusSummary(name, state)}${extra}`;
          });
          await say(lines.join('\n'));
          return;
        }

        case 'start': {
          if (!projectName) { await say('Usage: `rouge start <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          if (state.current_state !== 'ready' && state.current_state !== 'seeding') {
            await say(`\`${projectName}\` is \`${state.current_state}\`. Can only start ready or seeding projects.`);
            return;
          }
          // Generate cycle_context.json if missing
          const projectDir2 = path.join(PROJECTS_DIR, projectName);
          if (!fs.existsSync(path.join(projectDir2, 'cycle_context.json'))) {
            try { generateCycleContext(projectName); } catch {}
          }
          // Determine initial build state: foundation if not done, otherwise story-building
        state.current_state = (state.foundation && state.foundation.status === 'complete') ? 'story-building' : 'foundation';
          writeState(projectName, state);
          const seedState2 = getSeedingState(projectName);
          if (seedState2) { seedState2.status = 'complete'; writeSeedingState(projectName, seedState2); }
          await say(`\u{1F680} Started \`${projectName}\`. Launcher will pick it up on next iteration.`);
          return;
        }

        case 'pause': {
          if (!projectName) { await say('Usage: `rouge pause <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          const nonPausable = ['waiting-for-human', 'complete', 'ready'];
          if (nonPausable.includes(state.current_state)) {
            await say(`\`${projectName}\` is already \`${state.current_state}\`.`);
            return;
          }
          // Also pause active seeding
          if (state.current_state === 'seeding') {
            const seedState = getSeedingState(projectName);
            if (seedState && seedState.status === 'active') {
              seedState.status = 'paused';
              writeSeedingState(projectName, seedState);
            }
          }
          const wasState = state.current_state;
          state.paused_from_state = wasState;
          state.current_state = 'waiting-for-human';
          writeState(projectName, state);
          await say(`\u23F8\uFE0F Paused \`${projectName}\` (was: \`${wasState}\`). Use \`rouge resume ${projectName}\` to continue.`);
          return;
        }

        case 'resume': {
          if (!projectName) { await say('Usage: `rouge resume <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          if (state.current_state !== 'waiting-for-human') {
            await say(`\`${projectName}\` is not paused (current: \`${state.current_state}\`).`);
            return;
          }
          const resumeTo = state.paused_from_state || 'story-building';
          state.current_state = resumeTo;
          delete state.paused_from_state;
          writeState(projectName, state);
          // Also resume seeding if that was the paused state
          if (resumeTo === 'seeding') {
            const seedState = getSeedingState(projectName);
            if (seedState && seedState.status === 'paused') {
              seedState.status = 'active';
              seedState.channel_id = event.channel;
              seedState.last_activity = new Date().toISOString();
              writeSeedingState(projectName, seedState);
            }
          }
          await say(`\u25B6\uFE0F Resumed \`${projectName}\` \u2192 \`${resumeTo}\`.`);
          return;
        }

        case 'new': {
          if (!projectName) { await say('Usage: `rouge new <project-name>`'); return; }
          if (!/^[a-z][a-z0-9-]*$/.test(projectName)) {
            await say('Project name must be kebab-case (e.g., `my-cool-app`).');
            return;
          }
          const projectDir = path.join(PROJECTS_DIR, projectName);
          if (fs.existsSync(projectDir)) {
            await say(`Project \`${projectName}\` already exists.`);
            return;
          }

          fs.mkdirSync(projectDir, { recursive: true });
          writeState(projectName, {
            current_state: 'seeding',
            cycle_number: 0,
            feature_areas: [],
            current_feature_area: null,
            confidence_history: [],
          });

          const promptPath = path.join(__dirname, '../prompts/seeding/00-swarm-orchestrator.md');
          if (!fs.existsSync(promptPath)) {
            await say(`\u274C Seeding prompt not found at ${promptPath}`);
            return;
          }
          const seedPrompt = fs.readFileSync(promptPath, 'utf8');

          await say(`\u{1F331} Creating project \`${projectName}\`. Starting seeding session...\n_Tell me about your product idea. This may take 30-60 seconds per response._`);

          const initPrompt = seedPrompt + '\n\n---\n\nThe user wants to build a product called "' + projectName + '". Start the seeding swarm. Ask the first question.';
          const result = invokeClaudeSeeding(projectDir, initPrompt, null);

          if (result.rate_limited) {
            await say(`\u23F1\uFE0F Rate limited: ${result.message}\nSeeding session saved. Try again after the reset with \`rouge seed ${projectName}\`.`);
            writeSeedingState(projectName, {
              session_id: null,
              channel_id: event.channel,
              started_at: new Date().toISOString(),
              last_activity: new Date().toISOString(),
              status: 'paused',
            });
            return;
          }

          if (result.error) {
            await say(`\u274C Seeding failed to start: ${result.error}`);
            return;
          }

          // FW.1: Post first response as a new message (to get thread_ts)
          const response = markdownToSlack(result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result)));
          const firstMsg = await app.client.chat.postMessage({
            channel: event.channel,
            text: response.length > 3000 ? response.slice(0, 3000) + '...' : response,
          });

          writeSeedingState(projectName, {
            session_id: result.session_id || null,
            channel_id: event.channel,
            thread_ts: firstMsg.ts, // thread anchor
            started_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            status: 'active',
          });

          // Post remaining chunks in thread if needed
          if (response.length > 3000) {
            const chunks = response.slice(3000).match(/.{1,3000}/gs) || [];
            for (const chunk of chunks) {
              await app.client.chat.postMessage({
                channel: event.channel,
                thread_ts: firstMsg.ts,
                text: chunk,
              });
            }
          }
          return;
        }

        case 'seed': {
          if (!projectName) { await say('Usage: `rouge seed <project>` to resume a paused seeding session'); return; }
          const seedState = getSeedingState(projectName);
          if (!seedState || seedState.status !== 'paused') {
            await say(`No paused seeding session for \`${projectName}\`.`);
            return;
          }
          seedState.status = 'active';
          seedState.channel_id = event.channel;
          seedState.last_activity = new Date().toISOString();
          writeSeedingState(projectName, seedState);
          // Also make sure state.json reflects seeding
          const state = readState(projectName);
          if (state && state.current_state !== 'seeding') {
            state.current_state = 'seeding';
            delete state.paused_from_state;
            writeState(projectName, state);
          }
          await say(`\u{1F331} Resumed seeding for \`${projectName}\`. Continue the conversation.`);
          return;
        }

        case 'ship': {
          if (!projectName) { await say('Usage: `rouge ship <project>`'); return; }
          const state = readState(projectName);
          if (!state) { await say(`Project \`${projectName}\` not found.`); return; }
          if (state.current_state !== 'final-review') {
            await say(`\`${projectName}\` is \`${state.current_state}\`, not in final-review.`);
            return;
          }
          const projectDir = path.join(PROJECTS_DIR, projectName);
          const ctxFile = path.join(projectDir, 'cycle_context.json');
          let ctx = null;
          try { ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8')); } catch {}
          if (ctx) {
            ctx.final_review_report = ctx.final_review_report || {};
            ctx.final_review_report.human_approved = true;
            ctx.final_review_report.approved_by = event.user;
            ctx.final_review_report.approved_at = new Date().toISOString();
            const tmp = ctxFile + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2) + '\n');
            fs.renameSync(tmp, ctxFile);
          }
          state.current_state = 'complete';
          writeState(projectName, state);
          await say(`\u{1F680} \`${projectName}\` approved for production! Launcher will deploy on next iteration.`);
          return;
        }

        case 'feedback': {
          if (!projectName) { await say('Usage: `rouge feedback <project> <text>`'); return; }
          const feedbackText = parts.slice(2).join(' ');
          if (!feedbackText) { await say('Usage: `rouge feedback <project> your feedback here`'); return; }
          const projectDir = path.join(PROJECTS_DIR, projectName);
          const feedbackFile = path.join(projectDir, 'feedback.json');
          let existing = { items: [] };
          try { existing = JSON.parse(fs.readFileSync(feedbackFile, 'utf8')); } catch {}
          if (!existing.items) existing.items = [];
          existing.items.push({
            text: feedbackText,
            source: 'human',
            user: event.user,
            timestamp: new Date().toISOString(),
          });
          fs.writeFileSync(feedbackFile, JSON.stringify(existing, null, 2));
          await say(`\u{1F4DD} Feedback recorded for \`${projectName}\`. The final-review phase will incorporate it.`);
          return;
        }
      }
    }

    // Seeding relay: check for active OR paused sessions in this channel
    // Auto-resume paused sessions when user talks (no need for /rouge seed)
    // Thread-aware: if user is in a thread, match by thread_ts first
    const eventThread = event.thread_ts || event.ts;
    const activeSeedings = listProjects().filter(name => {
      const ss = getSeedingState(name);
      if (!ss || ss.channel_id !== event.channel) return false;
      if (ss.status !== 'active' && ss.status !== 'paused') return false;
      // Auto-close zombie sessions: seeding state says active but project moved past seeding
      const projState = readState(name);
      if (projState && projState.current_state !== 'seeding') {
        ss.status = 'complete';
        writeSeedingState(name, ss);
        console.log(`[${name}] Auto-closed zombie seeding session (project is ${projState.current_state})`);
        return false;
      }
      return true;
    });

    // Prefer thread-exact match, then fall back to channel match with only one active session
    let seedProject = null;
    const threadMatch = activeSeedings.find(name => {
      const ss = getSeedingState(name);
      return ss.thread_ts && ss.thread_ts === event.thread_ts;
    });
    if (threadMatch) {
      seedProject = threadMatch;
    } else if (!event.thread_ts && activeSeedings.length === 1) {
      // Top-level message in channel with exactly one active session — route there
      seedProject = activeSeedings[0];
    }
    // If multiple active sessions in the same channel and no thread match, don't guess

    // Auto-resume paused sessions
    if (seedProject) {
      const ss = getSeedingState(seedProject);
      if (ss.status === 'paused') {
        ss.status = 'active';
        ss.last_activity = new Date().toISOString();
        writeSeedingState(seedProject, ss);
        console.log(`[${seedProject}] Auto-resumed seeding (user talked in thread)`);
      }
    }

    if (seedProject) {
      const seedState = getSeedingState(seedProject);
      const projectDir = path.join(PROJECTS_DIR, seedProject);

      // 👀 React to show message received — removed when response arrives
      try {
        await app.client.reactions.add({ channel: event.channel, timestamp: event.ts, name: 'eyes' });
      } catch {}

      // FIX #105: prepend authoritative discipline state to every Claude
      // invocation. Every subsequent call is a fresh `claude -p --resume`
      // subprocess, so injection must happen on every turn, not just after
      // rate limits. The block is empty on the very first turn (no state yet).
      const resumeBlock = buildResumingFromStateBlock(seedState);
      const result = invokeClaudeSeeding(projectDir, resumeBlock + text, seedState.session_id);

      // Remove 👀 — processing complete
      try {
        await app.client.reactions.remove({ channel: event.channel, timestamp: event.ts, name: 'eyes' });
      } catch {}

      // FIX Bug 1: Handle rate limiting gracefully
      if (result.rate_limited) {
        seedState.status = 'paused';
        writeSeedingState(seedProject, seedState);
        await say(`\u23F1\uFE0F Rate limited: ${result.message}\nSeeding paused. Resume after reset with \`rouge seed ${seedProject}\`.`);
        return;
      }

      // FIX Bug 3: Handle timeouts gracefully
      if (result.timeout) {
        await say(`\u23F3 ${result.error}\nThe seeding session is still active — just send your message again.`);
        return;
      }

      if (result.error) {
        await say(`\u274C Seeding error: ${result.error}`);
        return;
      }

      seedState.last_activity = new Date().toISOString();
      if (result.session_id) seedState.session_id = result.session_id;

      const response = markdownToSlack(result.result || result.message || (typeof result === 'string' ? result : JSON.stringify(result)));

      // Only accept explicit SEEDING_COMPLETE marker from the orchestrator.
      // Previously also matched (approved + ready) which caused false positives
      // when discipline responses casually contained both words.
      const isComplete = response.includes('SEEDING_COMPLETE');

      if (isComplete) {
        // Generate cycle_context.json from seed artifacts
        const stats = generateCycleContext(seedProject);

        // Safety: don't mark as ready if no seeding artifacts were produced (FIX #91).
        // V3 writes milestones + stories into state.json; V2 writes spec-*.md files into seed_spec/.
        // Either path needs real content before we can mark the project ready.
        const hasContent = stats.schemaVersion === 'v3'
          ? stats.milestones > 0
          : stats.specFiles > 0;
        if (!hasContent) {
          console.log(`[${seedProject}] SEEDING_COMPLETE received but no artifacts found — not marking as ready`);
          // Post warning to thread so user knows something went wrong
          try {
            await app.client.chat.postMessage({
              channel: seedState.channel_id,
              thread_ts: seedState.thread_ts,
              text: `⚠️ Seeding said complete but produced no artifacts (no milestones in state.json, no spec files in seed_spec/). The session may need to continue — try prompting the orchestrator to actually write the SPEC artifact.`,
            });
          } catch (e) { console.error('Failed to post spec warning:', e.message); }
        } else {
          const state = readState(seedProject);
          state.current_state = 'ready';
          writeState(seedProject, state);
          seedState.status = 'complete';
        }
      }

      // FW.6: Parse discipline progress markers (FIX #105: also persist to seedingState).
      const DISCIPLINES = SEEDING_DISCIPLINES;
      const completedDisciplines = [];
      const progressMatches = response.matchAll(/\[DISCIPLINE_COMPLETE:\s*(\S+)\]/g);
      for (const match of progressMatches) {
        completedDisciplines.push(match[1]);
        updateDisciplineTracker(seedState, match[1]);
      }

      writeSeedingState(seedProject, seedState);

      // FW.1: Reply in thread
      const threadTs = seedState.thread_ts;
      const sayInThread = (text) => app.client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs || undefined,
        text,
      });

      // Show progress bar if any disciplines completed
      if (completedDisciplines.length > 0) {
        const progressLine = DISCIPLINES.map(d => {
          const done = completedDisciplines.includes(d);
          return done ? `✅ ${d}` : `⬜ ${d}`;
        }).join(' → ');

        const progressMsg = `📊 *Seeding Progress* (${completedDisciplines.length}/${DISCIPLINES.length})\n${progressLine}`;

        // Post progress as a separate message in thread
        try {
          await sayInThread(progressMsg);
        } catch {}
      }

      // Strip progress markers from the response before showing to user
      const cleanResponse = response.replace(/\[DISCIPLINE_COMPLETE:\s*\S+\]/g, '').trim();

      if (cleanResponse.length > 3000) {
        const chunks = cleanResponse.match(/.{1,3000}/gs) || [cleanResponse];
        for (const chunk of chunks) await sayInThread(chunk);
      } else {
        await sayInThread(cleanResponse);
      }

      if (isComplete) {
        const stats = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, seedProject, 'cycle_context.json'), 'utf8'));
        const faCount = stats.active_spec?.feature_areas?.length || 0;
        const specCount = stats.active_spec?.spec_files?.length || 0;
        await sayInThread(`\n\u2705 Seeding complete for \`${seedProject}\`!\n\u{1F4CB} ${faCount} feature areas, ${specCount} spec files, cycle_context.json generated.\nUse \`rouge start ${seedProject}\` when ready.`);
      }
      return;
    }

    // Feedback for waiting projects
    if (projectName) {
      const state = readState(projectName);
      if (state?.current_state === 'waiting-for-human') {
        const feedback = parts.slice(1).join(' ');
        if (feedback) {
          // FW.20: Show classification dropdown with the feedback
          await app.client.chat.postMessage({
            channel: event.channel,
            text: `Feedback for \`${projectName}\`: "${feedback}"`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `📝 *Feedback for \`${projectName}\`*\n> ${feedback}` },
              },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: 'How should this feedback be classified?' },
                accessory: {
                  type: 'static_select',
                  action_id: `classify_feedback_${projectName}`,
                  placeholder: { type: 'plain_text', text: 'Select type...' },
                  options: [
                    { text: { type: 'plain_text', text: '🔧 Product Change' }, value: `product-change|${feedback}` },
                    { text: { type: 'plain_text', text: '🌍 Global Learning' }, value: `global-learning|${feedback}` },
                    { text: { type: 'plain_text', text: '🏷️ Domain Learning' }, value: `domain-learning|${feedback}` },
                    { text: { type: 'plain_text', text: '👤 Personal Preference' }, value: `personal-preference|${feedback}` },
                    { text: { type: 'plain_text', text: '🧭 Direction' }, value: `direction|${feedback}` },
                    { text: { type: 'plain_text', text: '🤖 Auto-classify' }, value: `auto|${feedback}` },
                  ],
                },
              },
            ],
          });
          return;
        }
      }
    }

    // Nothing matched — show help
    await showHelp(say);

  } catch (err) {
    console.error('Command error:', err);
    await say(`\u274C Error: ${err.message}`);
  }
});

// --- FW.21: DM support for seeding ---
app.event('message', async ({ event, say }) => {
  // Only handle DMs (not channel messages, which are handled by app_mention)
  if (event.channel_type !== 'im') return;
  if (event.subtype) return; // ignore edits, joins, etc.
  if (event.bot_id) return; // ignore own messages

  const text = event.text?.trim() || '';

  // Check for active seeding session from this user in DMs
  const activeSeedings = listProjects().filter(name => {
    const ss = getSeedingState(name);
    return ss && ss.status === 'active' && ss.channel_id === event.channel;
  });

  if (activeSeedings.length > 0) {
    const seedProject = activeSeedings[0];
    const seedState = getSeedingState(seedProject);
    const projectDir = path.join(PROJECTS_DIR, seedProject);

    // 👀 React to show message received
    try {
      await app.client.reactions.add({ channel: event.channel, timestamp: event.ts, name: 'eyes' });
    } catch {}

    // FIX #105: prepend authoritative discipline state to every Claude
    // seeding invocation (DM code path).
    const resumeBlock = buildResumingFromStateBlock(seedState);
    const result = invokeClaudeSeeding(projectDir, resumeBlock + text, seedState.session_id);

    // Remove 👀
    try {
      await app.client.reactions.remove({ channel: event.channel, timestamp: event.ts, name: 'eyes' });
    } catch {}

    if (result.rate_limited) {
      seedState.status = 'paused';
      writeSeedingState(seedProject, seedState);
      await say(`⏱️ Rate limited. Resume: \`/rouge seed ${seedProject}\``);
      return;
    }

    if (result.timeout) {
      await say(`⏳ ${result.error}`);
      return;
    }

    if (result.error) {
      await say(`❌ ${result.error}`);
      return;
    }

    seedState.last_activity = new Date().toISOString();
    if (result.session_id) seedState.session_id = result.session_id;

    const response = markdownToSlack(result.result || result.message || JSON.stringify(result));

    // Only accept explicit SEEDING_COMPLETE marker from the orchestrator.
    // Previously also matched (approved + ready) which caused false positives
    // when discipline responses casually contained both words.
    const isComplete = response.includes('SEEDING_COMPLETE');

    if (isComplete) {
      // Generate cycle_context.json from seed artifacts
      const stats = generateCycleContext(seedProject);

      // Safety: don't mark as ready if no seeding artifacts were produced (FIX #91).
      // V3 writes milestones + stories into state.json; V2 writes spec-*.md files into seed_spec/.
      const hasContent = stats.schemaVersion === 'v3'
        ? stats.milestones > 0
        : stats.specFiles > 0;
      if (!hasContent) {
        console.log(`[${seedProject}] SEEDING_COMPLETE received via DM but no artifacts found — not marking as ready`);
        try {
          await say(`⚠️ Seeding said complete but produced no artifacts (no milestones in state.json, no spec files in seed_spec/). The session may need to continue — try prompting the orchestrator to actually write the SPEC artifact.`);
        } catch (e) { console.error('Failed to post spec warning:', e.message); }
      } else {
        const state = readState(seedProject);
        state.current_state = 'ready';
        writeState(seedProject, state);
        seedState.status = 'complete';
      }
    }

    // FW.6: Parse discipline progress markers (FIX #105: also persist to seedingState).
    const DM_DISCIPLINES = SEEDING_DISCIPLINES;
    const dmCompletedDisciplines = [];
    const dmProgressMatches = response.matchAll(/\[DISCIPLINE_COMPLETE:\s*(\S+)\]/g);
    for (const match of dmProgressMatches) {
      dmCompletedDisciplines.push(match[1]);
      updateDisciplineTracker(seedState, match[1]);
    }

    writeSeedingState(seedProject, seedState);

    // Show progress bar if any disciplines completed
    if (dmCompletedDisciplines.length > 0) {
      const progressLine = DM_DISCIPLINES.map(d => {
        const done = dmCompletedDisciplines.includes(d);
        return done ? `✅ ${d}` : `⬜ ${d}`;
      }).join(' → ');

      const progressMsg = `📊 *Seeding Progress* (${dmCompletedDisciplines.length}/${DM_DISCIPLINES.length})\n${progressLine}`;

      try {
        await say(progressMsg);
      } catch {}
    }

    // Strip progress markers from the response before showing to user
    const cleanResponse = response.replace(/\[DISCIPLINE_COMPLETE:\s*\S+\]/g, '').trim();

    if (cleanResponse.length > 3000) {
      const chunks = cleanResponse.match(/.{1,3000}/gs) || [cleanResponse];
      for (const chunk of chunks) await say(chunk);
    } else {
      await say(cleanResponse);
    }

    if (isComplete) {
      await say(`\n✅ Seeding complete! Use \`/rouge start ${seedProject}\` in a channel.`);
    }
    return;
  }

  // No active seeding — show help
  await say('👋 DM me during an active seeding session to continue the conversation.\nUse `/rouge new <name>` in a channel to start.');
});

// --- Slash command handler (FW.11) ---
app.command('/rouge', async ({ command, ack, respond }) => {
  await ack(); // Must ack within 3 seconds

  const text = command.text?.trim() || '';
  const parts = text.split(/\s+/);
  const cmd = parts[0]?.toLowerCase() || 'help';
  const projectName = parts[1];

  try {
    switch (cmd) {
      case 'help': {
        const { blocks: helpBlocks } = blockKit.helpMessage();
        await respond({
          response_type: 'ephemeral',
          blocks: helpBlocks,
        });
        break;
      }

      case 'status': {
        // Per-project detail view
        if (projectName) {
          await respond({ response_type: 'ephemeral', text: formatProjectDetail(projectName) });
          break;
        }
        const projects = listProjects();
        if (projects.length === 0) {
          await respond({ response_type: 'ephemeral', text: 'No projects found.' });
          return;
        }
        const lines = projects.map(name => {
          const state = readState(name);
          const seedState = getSeedingState(name);
          const emoji = STATE_EMOJI[state?.current_state] || '\u2753';
          let extra = '';
          if (state?.current_state === 'seeding' && seedState?.status === 'active') extra = ' _(seeding active)_';
          else if (state?.current_state === 'seeding' && seedState?.status === 'paused') extra = ' _(seeding paused)_';
          return `${emoji} *${name}*: \`${state?.current_state || 'unknown'}\` (cycle ${state?.cycle_number || 0})${extra}`;
        });
        await respond({ response_type: 'ephemeral', text: lines.join('\n') });
        break;
      }

      case 'start': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge start <project>`' }); return; }
        const state = readState(projectName);
        if (!state) { await respond({ response_type: 'ephemeral', text: `Project \`${projectName}\` not found.` }); return; }
        // Allow start from 'ready' OR 'seeding' (user decides when seeding is done)
        if (state.current_state !== 'ready' && state.current_state !== 'seeding') {
          await respond({ response_type: 'ephemeral', text: `\`${projectName}\` is \`${state.current_state}\`. Can only start ready or seeding projects.` });
          return;
        }

        // Check that seeding actually produced artifacts before allowing start (FIX #91).
        // V3: state.json has milestones[]. V2: seed_spec/ has spec-*.md files.
        const projectDir = path.join(PROJECTS_DIR, projectName);
        const specDir = path.join(projectDir, 'seed_spec');
        const hasV3Milestones = Array.isArray(state.milestones) && state.milestones.length > 0;
        const hasV2SpecFiles = fs.existsSync(specDir) && fs.readdirSync(specDir).some(f => f.startsWith('spec-') && f.endsWith('.md'));
        if (!hasV3Milestones && !hasV2SpecFiles) {
          await respond({ response_type: 'ephemeral', text: `\`${projectName}\` has no seeding artifacts yet. Finish the seeding conversation first.` });
          return;
        }

        // Generate cycle_context.json from seed artifacts (the real fix for missing context)
        const ctxPath = path.join(projectDir, 'cycle_context.json');
        if (!fs.existsSync(ctxPath)) {
          try {
            const stats = generateCycleContext(projectName);
            const detail = stats.schemaVersion === 'v3'
              ? `${stats.milestones} milestones, ${stats.stories} stories${stats.acceptanceCriteria > 0 ? `, ${stats.acceptanceCriteria} acceptance criteria` : ''}`
              : `${stats.featureAreas} feature areas, ${stats.specFiles} spec files`;
            await respond({ response_type: 'ephemeral', text: `📋 Generated cycle context: ${detail}.` });
          } catch (err) {
            await respond({ response_type: 'ephemeral', text: `⚠️ Could not generate cycle context: ${err.message}. Starting anyway.` });
          }
        }

        // Determine initial build state: foundation if not done, otherwise story-building
        state.current_state = (state.foundation && state.foundation.status === 'complete') ? 'story-building' : 'foundation';
        writeState(projectName, state);

        // Mark seeding as complete
        const seedState = getSeedingState(projectName);
        if (seedState) {
          seedState.status = 'complete';
          writeSeedingState(projectName, seedState);
        }

        await respond({ response_type: 'in_channel', text: `\u{1F680} Started \`${projectName}\`. Launcher will pick it up on next iteration.` });
        break;
      }

      case 'pause': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge pause <project>`' }); return; }
        const state = readState(projectName);
        if (!state) { await respond({ response_type: 'ephemeral', text: `Project \`${projectName}\` not found.` }); return; }
        const nonPausable = ['waiting-for-human', 'complete', 'ready'];
        if (nonPausable.includes(state.current_state)) {
          await respond({ response_type: 'ephemeral', text: `\`${projectName}\` is already \`${state.current_state}\`.` });
          return;
        }
        if (state.current_state === 'seeding') {
          const seedState = getSeedingState(projectName);
          if (seedState && seedState.status === 'active') {
            seedState.status = 'paused';
            writeSeedingState(projectName, seedState);
          }
        }
        const wasState = state.current_state;
        state.paused_from_state = wasState;
        state.current_state = 'waiting-for-human';
        writeState(projectName, state);
        await respond({ response_type: 'in_channel', text: `\u23F8\uFE0F Paused \`${projectName}\` (was: \`${wasState}\`). Use \`/rouge resume ${projectName}\` to continue.` });
        break;
      }

      case 'resume': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge resume <project>`' }); return; }
        const state = readState(projectName);
        if (!state) { await respond({ response_type: 'ephemeral', text: `Project \`${projectName}\` not found.` }); return; }
        if (state.current_state !== 'waiting-for-human') {
          await respond({ response_type: 'ephemeral', text: `\`${projectName}\` is not paused.` });
          return;
        }
        const resumeTo = state.paused_from_state || 'story-building';
        state.current_state = resumeTo;
        delete state.paused_from_state;
        if (resumeTo === 'seeding') {
          const seedState = getSeedingState(projectName);
          if (seedState && seedState.status === 'paused') {
            seedState.status = 'active';
            seedState.channel_id = command.channel_id;
            seedState.last_activity = new Date().toISOString();
            writeSeedingState(projectName, seedState);
          }
        }
        writeState(projectName, state);
        await respond({ response_type: 'in_channel', text: `\u25B6\uFE0F Resumed \`${projectName}\` \u2192 \`${resumeTo}\`.` });
        break;
      }

      case 'new': {
        // FW.13: Open modal for project creation
        await app.client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'create_project',
            title: { type: 'plain_text', text: 'New Rouge Project' },
            submit: { type: 'plain_text', text: 'Create & Seed' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [
              {
                type: 'input',
                block_id: 'project_name',
                label: { type: 'plain_text', text: 'Project Name' },
                element: {
                  type: 'plain_text_input',
                  action_id: 'name_input',
                  placeholder: { type: 'plain_text', text: 'my-cool-app (kebab-case)' },
                },
              },
              {
                type: 'input',
                block_id: 'description',
                label: { type: 'plain_text', text: 'One-line Description' },
                element: {
                  type: 'plain_text_input',
                  action_id: 'desc_input',
                  placeholder: { type: 'plain_text', text: 'What does this product do?' },
                },
              },
              {
                type: 'input',
                block_id: 'domain',
                label: { type: 'plain_text', text: 'Domain' },
                element: {
                  type: 'static_select',
                  action_id: 'domain_input',
                  options: [
                    { text: { type: 'plain_text', text: '🌐 Web App' }, value: 'web' },
                    { text: { type: 'plain_text', text: '🎮 Game' }, value: 'game' },
                    { text: { type: 'plain_text', text: '📦 Artifact (book, image, etc.)' }, value: 'artifact' },
                  ],
                  initial_option: { text: { type: 'plain_text', text: '🌐 Web App' }, value: 'web' },
                },
              },
            ],
            private_metadata: JSON.stringify({ channel_id: command.channel_id }),
          },
        });
        break;
      }

      case 'seed': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge seed <project>`' }); return; }
        const seedState = getSeedingState(projectName);
        if (!seedState || seedState.status !== 'paused') {
          await respond({ response_type: 'ephemeral', text: `No paused seeding session for \`${projectName}\`.` });
          return;
        }
        seedState.status = 'active';
        seedState.channel_id = command.channel_id;
        seedState.last_activity = new Date().toISOString();
        writeSeedingState(projectName, seedState);
        const state = readState(projectName);
        if (state && state.current_state !== 'seeding') {
          state.current_state = 'seeding';
          delete state.paused_from_state;
          writeState(projectName, state);
        }
        await respond({ response_type: 'in_channel', text: `\u{1F331} Resumed seeding for \`${projectName}\`. Continue the conversation.` });
        break;
      }

      case 'ship': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge ship <project>`' }); return; }
        const state = readState(projectName);
        if (!state) { await respond({ response_type: 'ephemeral', text: `Project \`${projectName}\` not found.` }); return; }
        if (state.current_state !== 'final-review') {
          await respond({ response_type: 'ephemeral', text: `\`${projectName}\` is \`${state.current_state}\`, not in final-review.` });
          return;
        }
        const projectDir = path.join(PROJECTS_DIR, projectName);
        const ctxFile = path.join(projectDir, 'cycle_context.json');
        let ctx = null;
        try { ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8')); } catch {}
        if (ctx) {
          ctx.final_review_report = ctx.final_review_report || {};
          ctx.final_review_report.human_approved = true;
          ctx.final_review_report.approved_by = command.user_id;
          ctx.final_review_report.approved_at = new Date().toISOString();
          const tmp = ctxFile + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2) + '\n');
          fs.renameSync(tmp, ctxFile);
        }
        state.current_state = 'complete';
        writeState(projectName, state);
        await respond({ response_type: 'in_channel', text: `\u{1F680} \`${projectName}\` approved for production! Launcher will deploy on next iteration.` });
        break;
      }

      case 'feedback': {
        if (!projectName) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge feedback <project> <text>`' }); return; }
        const feedbackText = parts.slice(2).join(' ');
        if (!feedbackText) { await respond({ response_type: 'ephemeral', text: 'Usage: `/rouge feedback <project> your feedback here`' }); return; }
        const projectDir = path.join(PROJECTS_DIR, projectName);
        const feedbackFile = path.join(projectDir, 'feedback.json');
        let existing = { items: [] };
        try { existing = JSON.parse(fs.readFileSync(feedbackFile, 'utf8')); } catch {}
        if (!existing.items) existing.items = [];
        existing.items.push({
          text: feedbackText,
          source: 'human',
          user: command.user_id,
          timestamp: new Date().toISOString(),
        });
        fs.writeFileSync(feedbackFile, JSON.stringify(existing, null, 2));
        await respond({ response_type: 'in_channel', text: `\u{1F4DD} Feedback recorded for \`${projectName}\`. The final-review phase will incorporate it.` });
        break;
      }

      default: {
        await respond({ response_type: 'ephemeral', text: `Unknown command: \`${cmd}\`. Try \`/rouge help\`.` });
      }
    }
  } catch (err) {
    console.error('Slash command error:', err);
    await respond({ response_type: 'ephemeral', text: `\u274C Error: ${err.message}` });
  }
});

// --- FW.13: Modal submission handler ---
app.view('create_project', async ({ ack, view, client }) => {
  const name = view.state.values.project_name.name_input.value.trim().toLowerCase().replace(/\s+/g, '-');
  const description = view.state.values.description.desc_input.value.trim();
  const domain = view.state.values.domain.domain_input.selected_option.value;
  const { channel_id } = JSON.parse(view.private_metadata);

  // Validate
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    await ack({
      response_action: 'errors',
      errors: { project_name: 'Must be kebab-case (lowercase, hyphens only)' },
    });
    return;
  }

  const projectDir = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(projectDir)) {
    await ack({
      response_action: 'errors',
      errors: { project_name: 'Project already exists' },
    });
    return;
  }

  await ack(); // Close modal

  // Create project
  fs.mkdirSync(projectDir, { recursive: true });
  writeState(name, {
    current_state: 'seeding',
    cycle_number: 0,
    feature_areas: [],
    current_feature_area: null,
    confidence_history: [],
    domain,
    description,
  });

  // Post to channel
  await client.chat.postMessage({
    channel: channel_id,
    text: `🌱 Creating project \`${name}\` (${domain}): _${description}_\nStarting seeding session...`,
  });

  // Start seeding
  const promptPath = path.join(__dirname, '../prompts/seeding/00-swarm-orchestrator.md');
  if (!fs.existsSync(promptPath)) {
    await client.chat.postMessage({ channel: channel_id, text: '❌ Seeding prompt not found.' });
    return;
  }

  const seedPrompt = fs.readFileSync(promptPath, 'utf8');
  const initPrompt = seedPrompt + `\n\n---\n\nThe user wants to build a ${domain} product called "${name}". Description: "${description}". Start the seeding swarm. Ask the first question.`;
  const result = invokeClaudeSeeding(projectDir, initPrompt, null);

  if (result.error || result.rate_limited) {
    writeSeedingState(name, { session_id: null, channel_id, started_at: new Date().toISOString(), last_activity: new Date().toISOString(), status: 'paused' });
    await client.chat.postMessage({ channel: channel_id, text: result.rate_limited ? `⏱️ Rate limited. Resume: \`/rouge seed ${name}\`` : `❌ ${result.error}` });
    return;
  }

  const response = markdownToSlack(result.result || result.message || JSON.stringify(result));
  const firstMsg = await client.chat.postMessage({
    channel: channel_id,
    text: response.length > 3000 ? response.slice(0, 3000) + '...' : response,
  });

  writeSeedingState(name, {
    session_id: result.session_id || null,
    channel_id,
    thread_ts: firstMsg.ts,
    started_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    status: 'active',
  });
});

// --- FW.25-27: Bot self-setup on first run ---
async function selfSetup() {
  try {
    // Check existing channels
    const result = await app.client.conversations.list({ types: 'public_channel', limit: 200 });
    const channels = result.channels || [];
    const channelNames = channels.map(c => c.name);

    const requiredChannels = [
      { name: 'rouge-feed', topic: 'Rouge Build: live phase updates and progress', purpose: 'Autonomous product development feed. Phase transitions, QA results, deployments.' },
      { name: 'rouge-alerts', topic: 'Rouge: critical alerts only', purpose: 'Rate limits, failures, escalations. Low volume.' },
    ];

    for (const ch of requiredChannels) {
      if (!channelNames.includes(ch.name)) {
        console.log(`Creating channel: #${ch.name}`);
        try {
          const created = await app.client.conversations.create({ name: ch.name, is_private: false });
          if (created.channel) {
            await app.client.conversations.setTopic({ channel: created.channel.id, topic: ch.topic });
            await app.client.conversations.setPurpose({ channel: created.channel.id, purpose: ch.purpose });
            // Pin welcome message
            const welcome = await app.client.chat.postMessage({
              channel: created.channel.id,
              text: `\u{1F44B} *Welcome to #${ch.name}*\n\n${ch.purpose}\n\nThis channel was auto-created by Rouge on first run.`,
            });
            await app.client.pins.add({ channel: created.channel.id, timestamp: welcome.ts });
          }
        } catch (err) {
          // Channel might already exist but bot isn't a member, or missing scope
          console.log(`Could not create #${ch.name}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.log(`Self-setup skipped: ${err.message}`);
  }
}

(async () => {
  await app.start();
  console.log('\u26A1 Rouge Slack bot is running (Socket Mode)');
  await selfSetup();
})();

// Check for seeding timeouts every 10 minutes
const SEEDING_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  try {
    const projects = listProjects();
    for (const name of projects) {
      const ss = getSeedingState(name);
      if (!ss || ss.status !== 'active') continue;

      const elapsed = Date.now() - new Date(ss.last_activity).getTime();
      if (elapsed > SEEDING_TIMEOUT_MS) {
        ss.status = 'paused';
        writeSeedingState(name, ss);

        if (process.env.ROUGE_SLACK_WEBHOOK) {
          const msg = `\u23F8\uFE0F Seeding for \`${name}\` paused (2h timeout). Resume: \`@rouge seed ${name}\``;
          try {
            execSync(
              `curl -s -X POST "$ROUGE_SLACK_WEBHOOK" -H 'Content-Type: application/json' -d '${JSON.stringify({ text: msg }).replace(/'/g, "'\\''")}'`,
              { env: process.env, timeout: 10000 }
            );
          } catch {}
        }
        console.log(`Seeding timeout: ${name} paused`);
      }
    }
  } catch (err) {
    console.error('Timeout check error:', err.message);
  }
}, 10 * 60 * 1000);
