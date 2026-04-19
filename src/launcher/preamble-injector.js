/**
 * V3 Preamble injector — builds and injects the shared preamble for every phase prompt.
 * The preamble defines the I/O contract: what each phase can read, what it must write,
 * and what it must never touch.
 */

const fs = require('fs');
const path = require('path');

const PREAMBLE_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../prompts/loop/_preamble.md'), 'utf8'
);

// Escape `{{` / `}}` in user-supplied content so literal mustache-looking
// text doesn't collide with preamble template placeholders on the next
// pass. Used for learnings, human guidance, and human resolution blocks.
function escapeMustache(s) {
  return (s || '')
    .replace(/\{\{/g, '\\{\\{')
    .replace(/\}\}/g, '\\}\\}');
}

function buildPreamble({
  phaseName,
  phaseDescription,
  modelName,
  requiredOutputKeys,
  learningsContent,
  humanGuidance,
  humanResolution,
}) {
  let preamble = PREAMBLE_TEMPLATE
    .replace('{{phase_name}}', phaseName)
    .replace('{{phase_description}}', phaseDescription)
    .replace('{{model_name}}', modelName);

  // Task ledger write permission — only generating-change-spec can write
  if (phaseName === 'generating-change-spec') {
    preamble = preamble.replace(
      '{{task_ledger_write_note}}',
      '- task_ledger.json (WRITE ALLOWED — this phase adds fix stories)'
    );
  } else {
    preamble = preamble.replace('{{task_ledger_write_note}}', '');
    // Add task_ledger to NEVER write list for non-change-spec phases
    preamble = preamble.replace(
      '- checkpoints.jsonl (launcher-only)',
      '- task_ledger.json (read-only — only generating-change-spec may write)\n- checkpoints.jsonl (launcher-only)'
    );
  }

  // Required output keys
  if (requiredOutputKeys.length > 0) {
    preamble = preamble.replace(
      '{{required_output_keys}}',
      requiredOutputKeys.map(k => `- ${k}`).join('\n')
    );
  } else {
    preamble = preamble.replace('{{required_output_keys}}', '(none specified)');
  }

  // Human guidance — text the human submitted via the dashboard
  // escalation panel. Without this block, guidance written to
  // cycle_context.human_guidance (rouge-loop.js escalation handler)
  // reached no phase — a bug the user's escalation audit caught. Now
  // every phase sees it as a first-class instruction block.
  if (humanGuidance && humanGuidance.trim()) {
    preamble = preamble.replace(
      '{{human_guidance_section}}',
      `### Human guidance for this phase\n\n` +
      `The human resolved an earlier escalation with this guidance. Treat it\n` +
      `as higher-priority than your own judgement for the decisions it covers:\n\n` +
      `${escapeMustache(humanGuidance.trim())}`
    );
  } else {
    preamble = preamble.replace('{{human_guidance_section}}', '');
  }

  // Human resolution — the human took a problem offline (hand-off
  // mode), worked it through directly in their terminal, and resumed.
  // The resolution block captures what they changed (git diff summary
  // + optional note) so the resuming phase has context for what just
  // happened.
  if (humanResolution && typeof humanResolution === 'object') {
    const parts = ['### Human resolved this off-line'];
    parts.push(
      'The human handed this escalation off to a direct Claude Code session\n' +
      'and resolved it in their terminal. Their work is already committed.\n' +
      'Read this context, then continue the phase normally — do NOT redo the\n' +
      'changes they made.'
    );
    if (humanResolution.note) {
      parts.push(`\n**Note from the human**:\n${escapeMustache(humanResolution.note)}`);
    }
    if (Array.isArray(humanResolution.commits) && humanResolution.commits.length > 0) {
      parts.push(`\n**Commits made during the resolution** (most recent first):`);
      for (const c of humanResolution.commits) {
        parts.push(`- \`${c.sha}\` ${c.subject}`);
      }
    }
    if (Array.isArray(humanResolution.files_changed) && humanResolution.files_changed.length > 0) {
      parts.push(`\n**Files touched**:`);
      for (const f of humanResolution.files_changed) {
        parts.push(`- \`${f}\``);
      }
    }
    preamble = preamble.replace('{{human_resolution_section}}', parts.join('\n'));
  } else {
    preamble = preamble.replace('{{human_resolution_section}}', '');
  }

  // Learnings — escape `{{` / `}}` in the user-supplied content so
  // literal mustache-looking text in learnings.md doesn't accidentally
  // collide with preamble template placeholders on the next pass.
  // Audit G9.
  if (learningsContent && learningsContent.trim()) {
    preamble = preamble.replace(
      '{{learnings_section}}',
      `### Project learnings\n${escapeMustache(learningsContent.trim())}`
    );
  } else {
    preamble = preamble.replace('{{learnings_section}}', '');
  }

  return preamble.trim() + '\n';
}

function injectPreamble({ projectDir, phaseName, phaseDescription, modelName, requiredOutputKeys }) {
  // Read learnings.md if it exists
  let learningsContent = '';
  const learningsFile = path.join(projectDir, 'learnings.md');
  if (fs.existsSync(learningsFile)) {
    learningsContent = fs.readFileSync(learningsFile, 'utf8');
  }

  // Read human guidance + resolution from cycle_context.json. These
  // are populated by the launcher's escalation handler when the human
  // either submits guidance text or completes a hand-off session.
  // Both fields are consumed once — the handler clears them after
  // the phase runs so they don't bleed into later cycles.
  let humanGuidance = '';
  let humanResolution = null;
  const ctxFile = path.join(projectDir, 'cycle_context.json');
  if (fs.existsSync(ctxFile)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
      if (typeof ctx.human_guidance === 'string') {
        humanGuidance = ctx.human_guidance;
      }
      if (ctx.human_resolution && typeof ctx.human_resolution === 'object') {
        humanResolution = ctx.human_resolution;
      }
    } catch {
      // Malformed cycle_context — let the phase see no guidance
      // rather than crashing the preamble assembly.
    }
  }

  return buildPreamble({
    phaseName,
    phaseDescription,
    modelName,
    requiredOutputKeys,
    learningsContent,
    humanGuidance,
    humanResolution,
  });
}

module.exports = { buildPreamble, injectPreamble };
